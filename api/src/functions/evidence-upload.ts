/**
 * Canonical, staff-confirmed evidence upload.
 *
 * POST /api/cases/{id}/evidence/upload
 *   - authenticated staff only;
 *   - an opaque idempotency key is bound to one case + actor + ordered manifest
 *     before any Blob write;
 *   - exact content is deduplicated per case by SHA-256;
 *   - each new evidence row, its audit, archive work and readiness work commit
 *     together;
 *   - photos start in a safe pending-image-check state. The existing autonomous
 *     classifier owns that state and releases an eligible photo to the archive.
 */

import { app, type HttpRequest, type InvocationContext } from '@azure/functions';
import { createHash, randomUUID } from 'node:crypto';
import { statusToInt } from '@cs/domain/codecs';
import { withRole } from '../lib/auth.js';
import { tx, type TxQuery } from '../lib/db.js';
import { evidenceBlobPath, uploadEvidenceBytes } from '../lib/blob.js';
import {
  classifyUpload,
  validateUploadBatch,
  validateUploadContent,
  type UploadKind,
  type CanonicalUploadType,
} from '../lib/upload-validate.js';
import { AUDIT_ACTION, actorFromClaims, writeAuditStrict } from '../lib/audit.js';
import { requestStatusRecompute } from '../lib/status-recompute.js';
import { lockCaseForMutation } from '../lib/case-mutation-locks.js';
import {
  requestArchiveMirror,
  requestArchiveMirrorIfEligible,
  type ArchiveMirrorCandidate,
} from '../lib/archive-mirror-outbox.js';

const IMAGE_KIND_CODE = 100000000;
const DOCUMENT_KIND_CODE = 100000002;
const IDEMPOTENCY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const IMAGE_CHECK_PENDING = 'Image check pending';

const TERMINAL_STATUS_CODES = [
  statusToInt('eva_submitted'),
  statusToInt('box_synced'),
  statusToInt('removed'),
  statusToInt('done'),
];

type UploadSource = 'add_evidence' | 'manual_intake' | 'assistant_confirmed' | 'legacy_upload';

const SOURCE_LABEL: Record<UploadSource, string> = {
  add_evidence: 'staff_add_evidence',
  manual_intake: 'staff_manual_intake',
  assistant_confirmed: 'staff_assistant_confirmed',
  legacy_upload: 'staff_legacy_upload',
};

const SOURCE_SUMMARY: Record<UploadSource, string> = {
  add_evidence: 'Add evidence',
  manual_intake: 'New case',
  assistant_confirmed: 'Assistant confirmation',
  legacy_upload: 'Staff upload',
};

interface PreparedFile {
  index: number;
  name: string;
  bytes: Buffer;
  sha256: string;
  kind: UploadKind;
  contentType: CanonicalUploadType;
}

interface AddedFile {
  fileIndex: number;
  fileName: string;
  evidenceId: string;
  duplicate: boolean;
}

interface RejectedFile {
  fileIndex: number;
  fileName: string;
  reason: string;
}

class UploadRefusal extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly targetCaseId?: string,
  ) {
    super(message);
  }
}

function sourceOf(value: string | File | null): UploadSource | undefined {
  return value === 'add_evidence' || value === 'manual_intake' || value === 'assistant_confirmed'
    ? value
    : undefined;
}

function legacyIdempotencyKey(caseId: string, actor: string, manifest: string): string {
  return `legacy-${createHash('sha256')
    .update(JSON.stringify({ caseId: caseId.toLowerCase(), actor, manifest }), 'utf8')
    .digest('hex')}`;
}

function manifestHash(files: readonly PreparedFile[]): string {
  const manifest = files.map((file) => ({
    index: file.index,
    name: file.name,
    size: file.bytes.length,
    sha256: file.sha256,
    contentType: file.contentType,
  }));
  return createHash('sha256').update(JSON.stringify(manifest), 'utf8').digest('hex');
}

function itemIdentity(source: UploadSource, idempotencyKey: string, index: number): string {
  return `staff:${source}:${idempotencyKey}:${index}`;
}

async function assertActiveCase(q: TxQuery, caseId: string): Promise<string> {
  const locked = await lockCaseForMutation(q, caseId);
  if (locked.kind === 'missing') throw new UploadRefusal(404, 'This case is no longer available.');
  if (locked.kind === 'retired') {
    throw new UploadRefusal(
      409,
      'This case has been merged. Open the current case and try again.',
      locked.mergedInto,
    );
  }
  const rows = await q<{ status_code: number }>(
    'SELECT status_code FROM case_ WHERE id = $1',
    [locked.caseId],
  );
  if (!rows[0] || TERMINAL_STATUS_CODES.includes(Number(rows[0].status_code))) {
    throw new UploadRefusal(409, 'This case is no longer open for evidence.');
  }
  return locked.caseId;
}

async function bindBatch(input: {
  caseId: string;
  idempotencyKey: string;
  actor: string;
  source: UploadSource;
  manifestHash: string;
  files: readonly PreparedFile[];
}): Promise<string> {
  return tx(async (q) => {
    const caseId = await assertActiveCase(q, input.caseId);
    await q(
      `INSERT INTO staff_evidence_upload
         (idempotency_key, case_id, actor, source, manifest_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [input.idempotencyKey, caseId, input.actor, input.source, input.manifestHash],
    );
    const batches = await q<{
      case_id: string;
      actor: string;
      source: string;
      manifest_hash: string;
    }>(
      `SELECT case_id, actor, source, manifest_hash
         FROM staff_evidence_upload
        WHERE idempotency_key = $1
        FOR UPDATE`,
      [input.idempotencyKey],
    );
    const batch = batches[0];
    if (
      !batch ||
      batch.case_id.toLowerCase() !== caseId ||
      batch.actor !== input.actor ||
      batch.source !== input.source ||
      batch.manifest_hash !== input.manifestHash
    ) {
      throw new UploadRefusal(
        409,
        'This upload no longer matches the selected case or files. Choose them again.',
      );
    }
    for (const file of input.files) {
      const prefix = `staff-${input.idempotencyKey}-${file.index}-${file.sha256.slice(0, 16)}`;
      const blobPath = evidenceBlobPath(prefix, file.name);
      await q(
        `INSERT INTO staff_evidence_upload_item
           (idempotency_key, item_index, case_id, sha256, file_name, content_type, blob_path)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (idempotency_key, item_index) DO NOTHING`,
        [
          input.idempotencyKey,
          file.index,
          caseId,
          file.sha256,
          file.name,
          file.contentType,
          blobPath,
        ],
      );
      const items = await q<{
        case_id: string;
        sha256: string;
        file_name: string;
        content_type: string;
        blob_path: string;
      }>(
        `SELECT case_id, sha256, file_name, content_type, blob_path
           FROM staff_evidence_upload_item
          WHERE idempotency_key = $1 AND item_index = $2
          FOR UPDATE`,
        [input.idempotencyKey, file.index],
      );
      const item = items[0];
      if (
        !item
        || item.case_id.toLowerCase() !== caseId
        || item.sha256 !== file.sha256
        || item.file_name !== file.name
        || item.content_type !== file.contentType
      ) {
        throw new UploadRefusal(
          409,
          'This upload no longer matches the selected case or files. Choose them again.',
        );
      }
    }
    return caseId;
  });
}

async function existingEvidence(
  q: TxQuery,
  caseId: string,
  identity: string,
  sha256: string,
): Promise<{ id: string; duplicate: boolean; storagePath: string | null } | undefined> {
  const identityRows = await q<{
    id: string;
    case_id: string;
    sha256: string | null;
    storage_path: string | null;
  }>(
    `SELECT id, case_id, sha256, storage_path
       FROM evidence
      WHERE source_message_id = $1
      FOR UPDATE`,
    [identity],
  );
  if (identityRows[0]) {
    const row = identityRows[0];
    if (row.case_id.toLowerCase() !== caseId || row.sha256 !== sha256) {
      throw new UploadRefusal(409, 'This upload no longer matches the selected case or files.');
    }
    return { id: row.id, duplicate: true, storagePath: row.storage_path };
  }
  const twins = await q<{ id: string; storage_path: string | null }>(
    `SELECT id, storage_path FROM evidence
      WHERE case_id = $1 AND sha256 = $2
      ORDER BY created_at, id
      LIMIT 1
      FOR UPDATE`,
    [caseId, sha256],
  );
  return twins[0]
    ? { id: twins[0].id, duplicate: true, storagePath: twins[0].storage_path }
    : undefined;
}

type UploadItemClaim =
  | { kind: 'existing'; id: string }
  | {
      kind: 'upload';
      itemId: string;
      claimToken: string;
      pathPrefix: string;
      blobPath: string;
    };

async function claimUploadItem(input: {
  caseId: string;
  source: UploadSource;
  idempotencyKey: string;
  file: PreparedFile;
}): Promise<UploadItemClaim> {
  return tx(async (q) => {
    const caseId = await assertActiveCase(q, input.caseId);
    const items = await q<{
      id: string;
      state: string;
      evidence_id: string | null;
      blob_path: string;
    }>(
      `SELECT id, state, evidence_id, blob_path
         FROM staff_evidence_upload_item
        WHERE idempotency_key = $1 AND item_index = $2 AND case_id = $3
        FOR UPDATE`,
      [input.idempotencyKey, input.file.index, caseId],
    );
    const item = items[0];
    if (!item) throw new UploadRefusal(409, 'This upload could not be resumed. Choose the files again.');
    if (item.state === 'complete' && item.evidence_id) {
      return { kind: 'existing', id: item.evidence_id };
    }
    // Once a writer may have touched Blob, only the cleanup owner may transition
    // this item. Looking up a same-SHA twin first would incorrectly mark the item
    // complete and make its distinct unreferenced path undiscoverable.
    if (item.state === 'cleanup_pending' || item.state === 'uploading') {
      throw new UploadRefusal(
        409,
        item.state === 'cleanup_pending'
          ? 'That upload is being safely reset. Wait a moment and try again.'
          : 'That upload is already in progress. Wait a moment and try again.',
      );
    }
    if (item.state !== 'reserved' && item.state !== 'cleaned') {
      throw new UploadRefusal(409, 'This upload could not be resumed. Choose the files again.');
    }

    const identity = itemIdentity(input.source, input.idempotencyKey, input.file.index);
    const existing = await existingEvidence(q, caseId, identity, input.file.sha256);
    if (existing) {
      await q(
        `UPDATE staff_evidence_upload_item
            SET state = 'complete', evidence_id = $2,
                upload_claim_token = NULL, upload_claim_expires_at = NULL,
                cleanup_claim_token = NULL, cleanup_claim_expires_at = NULL,
                updated_at = now()
          WHERE id = $1`,
        [item.id, existing.id],
      );
      return { kind: 'existing', id: existing.id };
    }
    const claimToken = randomUUID();
    // Every lease gets a fresh path. A cleanup worker may hold a stale token while
    // a later retry succeeds; deleting its old path can never remove new bytes.
    const pathPrefix = [
      'staff',
      input.idempotencyKey,
      input.file.index,
      input.file.sha256.slice(0, 16),
      claimToken,
    ].join('-');
    const blobPath = evidenceBlobPath(pathPrefix, input.file.name);
    const claimed = await q<{ id: string; blob_path: string }>(
      `UPDATE staff_evidence_upload_item
          SET state = 'uploading', upload_claim_token = $2,
              upload_claim_expires_at = now() + interval '15 minutes',
              blob_path = $3,
              cleanup_claim_token = NULL, cleanup_claim_expires_at = NULL,
              updated_at = now()
        WHERE id = $1
          AND state IN ('reserved', 'cleaned')
      RETURNING id, blob_path`,
      [item.id, claimToken, blobPath],
    );
    if (!claimed[0]) {
      throw new UploadRefusal(409, 'That upload is already in progress. Wait a moment and try again.');
    }
    return {
      kind: 'upload',
      itemId: claimed[0].id,
      claimToken,
      pathPrefix,
      blobPath: claimed[0].blob_path,
    };
  });
}

async function scheduleItemCleanup(itemId: string, claimToken: string, detail: string): Promise<void> {
  await tx(async (q) => {
    const items = await q<{ blob_path: string }>(
      `SELECT blob_path FROM staff_evidence_upload_item
        WHERE id = $1 AND state = 'uploading' AND upload_claim_token = $2::uuid
        FOR UPDATE`,
      [itemId, claimToken],
    );
    if (!items[0]) return;
    const linked = await q<{ id: string }>(
      `SELECT id FROM evidence WHERE storage_path = $1 ORDER BY created_at, id LIMIT 1 FOR UPDATE`,
      [items[0].blob_path],
    );
    if (linked[0]) {
      await q(
        `UPDATE staff_evidence_upload_item
            SET state = 'complete', evidence_id = $2,
                upload_claim_token = NULL, upload_claim_expires_at = NULL,
                updated_at = now()
          WHERE id = $1`,
        [itemId, linked[0].id],
      );
      return;
    }
    await q(
      `UPDATE staff_evidence_upload_item
          SET state = 'cleanup_pending',
              upload_claim_token = NULL, upload_claim_expires_at = NULL,
              cleanup_next_attempt_at = now(), cleanup_last_error = $3,
              updated_at = now()
        WHERE id = $1 AND upload_claim_token = $2::uuid`,
      [itemId, claimToken, detail.slice(0, 400)],
    );
  });
}

async function persistFile(input: {
  caseId: string;
  source: UploadSource;
  idempotencyKey: string;
  actor: string;
  file: PreparedFile;
  itemId: string;
  claimToken: string;
  blobPath: string;
  size: number;
}): Promise<{ id: string; duplicate: boolean }> {
  return tx(async (q) => {
    const caseId = await assertActiveCase(q, input.caseId);
    const owned = await q<{ id: string; blob_path: string }>(
      `SELECT id, blob_path
         FROM staff_evidence_upload_item
        WHERE id = $1 AND case_id = $2 AND state = 'uploading'
          AND upload_claim_token = $3::uuid
        FOR UPDATE`,
      [input.itemId, caseId, input.claimToken],
    );
    if (!owned[0] || owned[0].blob_path !== input.blobPath) {
      throw new UploadRefusal(409, 'That upload is no longer current. Try the file again.');
    }
    const identity = itemIdentity(input.source, input.idempotencyKey, input.file.index);
    const existing = await existingEvidence(q, caseId, identity, input.file.sha256);
    if (existing) {
      const ownsStoredBytes = existing.storagePath === input.blobPath;
      await q(
        `UPDATE staff_evidence_upload_item
            SET state = $2, evidence_id = $3,
                upload_claim_token = NULL, upload_claim_expires_at = NULL,
                cleanup_next_attempt_at = CASE WHEN $2 = 'cleanup_pending' THEN now() ELSE NULL END,
                updated_at = now()
          WHERE id = $1`,
        [input.itemId, ownsStoredBytes ? 'complete' : 'cleanup_pending', existing.id],
      );
      return { id: existing.id, duplicate: true };
    }

    const isImage = input.file.kind === 'image';
    const inserted = await q<ArchiveMirrorCandidate>(
      `INSERT INTO evidence
         (file_name, case_id, kind_code, sha256, content_type, size_bytes, storage_path,
          source_message_id, source_label, accepted_for_eva, excluded, exclusion_reason,
          exclusion_decision_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               $10, $11, $12, $13)
       ON CONFLICT DO NOTHING
       RETURNING id, case_id, excluded, storage_path, box_file_id`,
      [
        input.file.name,
        caseId,
        isImage ? IMAGE_KIND_CODE : DOCUMENT_KIND_CODE,
        input.file.sha256,
        input.file.contentType,
        input.size,
        input.blobPath,
        identity,
        SOURCE_LABEL[input.source],
        !isImage,
        isImage,
        isImage ? IMAGE_CHECK_PENDING : null,
        isImage ? 'classifier' : null,
      ],
    );

    const row = inserted[0];
    if (!row) {
      const raced = await existingEvidence(q, caseId, identity, input.file.sha256);
      if (raced) {
        const ownsStoredBytes = raced.storagePath === input.blobPath;
        await q(
          `UPDATE staff_evidence_upload_item
              SET state = $2, evidence_id = $3,
                  upload_claim_token = NULL, upload_claim_expires_at = NULL,
                  cleanup_next_attempt_at = CASE WHEN $2 = 'cleanup_pending' THEN now() ELSE NULL END,
                  updated_at = now()
            WHERE id = $1`,
          [input.itemId, ownsStoredBytes ? 'complete' : 'cleanup_pending', raced.id],
        );
        return { id: raced.id, duplicate: true };
      }
      throw new Error('evidence insert did not return a row');
    }

    // Every successful file enters durable archive work. A pending image's first
    // generation is acknowledged as intentionally ineligible; classification requests
    // the next generation when it safely releases the image for mirroring.
    if (isImage) await requestArchiveMirror(q, row);
    else await requestArchiveMirrorIfEligible(q, row);
    await requestStatusRecompute(q, caseId);
    await writeAuditStrict(
      {
        action: AUDIT_ACTION.evidence_added,
        caseId,
        actor: input.actor,
        summary: `Staff added ${input.file.name} through ${SOURCE_SUMMARY[input.source]}`.slice(0, 400),
        after: {
          evidenceId: row.id,
          fileName: input.file.name,
          source: input.source,
          sha256: input.file.sha256,
        },
      },
      q,
    );
    await q(
      `UPDATE staff_evidence_upload_item
          SET state = 'complete', evidence_id = $2,
              upload_claim_token = NULL, upload_claim_expires_at = NULL,
              cleanup_claim_token = NULL, cleanup_claim_expires_at = NULL,
              cleanup_next_attempt_at = NULL, cleanup_last_error = NULL,
              updated_at = now()
        WHERE id = $1 AND upload_claim_token = $3::uuid`,
      [input.itemId, row.id, input.claimToken],
    );
    return { id: row.id, duplicate: false };
  });
}

app.http('uploadCaseEvidence', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/evidence/upload',
  handler: withRole('CollisionSpike.User', async (req: HttpRequest, ctx: InvocationContext, claims) => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return { status: 400, jsonBody: { error: 'Choose the files again and try once more.' } };
    }

    const suppliedIdempotencyKey = (req.headers?.get('idempotency-key') ?? '').trim();
    const suppliedSourceValue = form.get('source');
    const suppliedSource = sourceOf(suppliedSourceValue);
    const legacyRequest = !suppliedIdempotencyKey && suppliedSourceValue == null;
    if (!legacyRequest && !IDEMPOTENCY_RE.test(suppliedIdempotencyKey)) {
      return { status: 400, jsonBody: { error: 'This upload could not be safely retried. Choose the files again.' } };
    }
    if (!legacyRequest && !suppliedSource) {
      return { status: 400, jsonBody: { error: 'Choose where these files are being added from.' } };
    }

    const files = form.getAll('file').filter((value): value is File => value instanceof File);
    if (!files.length) return { status: 400, jsonBody: { error: 'Choose at least one file.' } };
    const batchRefusal = validateUploadBatch(files);
    if (batchRefusal) return { status: 400, jsonBody: { error: batchRefusal } };

    const prepared: PreparedFile[] = [];
    const rejected: RejectedFile[] = [];
    for (const [index, file] of files.entries()) {
      const metadata = classifyUpload(file.type, file.size, file.name);
      if (!metadata.ok) {
        rejected.push({ fileIndex: index, fileName: file.name, reason: metadata.reason });
        continue;
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const content = await validateUploadContent(metadata, bytes);
      if (!content.ok) {
        rejected.push({ fileIndex: index, fileName: file.name, reason: content.reason });
        continue;
      }
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (!SHA256_RE.test(sha256)) throw new Error('unreachable sha256 result');
      prepared.push({
        index,
        name: (file.name.trim() || `file-${index + 1}`).slice(0, 400),
        bytes,
        sha256,
        kind: content.kind,
        contentType: content.contentType,
      });
    }
    if (!prepared.length) return { status: 400, jsonBody: { added: [], rejected } };

    const actor = actorFromClaims(claims) ?? 'authenticated staff';
    const batchManifestHash = manifestHash(prepared);
    // API-first rolling compatibility: a cached pre-TKT-165 SPA sends neither the
    // source field nor idempotency header. Derive both from authenticated, target-
    // bound request facts so the legacy replay is still stable and identity-bearing.
    const source: UploadSource = suppliedSource ?? 'legacy_upload';
    const idempotencyKey = suppliedIdempotencyKey
      || legacyIdempotencyKey(req.params.id, actor, batchManifestHash);
    let caseId: string;
    try {
      caseId = await bindBatch({
        caseId: req.params.id,
        idempotencyKey,
        actor,
        source,
        manifestHash: batchManifestHash,
        files: prepared,
      });
    } catch (error) {
      if (error instanceof UploadRefusal) {
        return {
          status: error.status,
          jsonBody: {
            added: [],
            rejected: files.map((file, fileIndex) => ({
              fileIndex,
              fileName: file.name,
              reason: error.message,
            })),
            ...(error.targetCaseId ? { targetCaseId: error.targetCaseId } : {}),
          },
        };
      }
      throw error;
    }

    const added: AddedFile[] = [];
    let created = 0;
    for (const file of prepared) {
      let uploadClaim: Extract<UploadItemClaim, { kind: 'upload' }> | undefined;
      try {
        const claim = await claimUploadItem({ caseId, source, idempotencyKey, file });
        if (claim.kind === 'existing') {
          added.push({
            fileIndex: file.index,
            fileName: file.name,
            evidenceId: claim.id,
            duplicate: true,
          });
          continue;
        }
        uploadClaim = claim;

        const { blobPath, size } = await uploadEvidenceBytes(
          claim.pathPrefix,
          file.name,
          file.bytes,
          file.contentType,
        );
        if (blobPath !== claim.blobPath) throw new Error('reserved blob path changed');
        const persisted = await persistFile({
          caseId,
          source,
          idempotencyKey,
          actor,
          file,
          itemId: claim.itemId,
          claimToken: claim.claimToken,
          blobPath,
          size,
        });
        if (!persisted.duplicate) created++;
        added.push({
          fileIndex: file.index,
          fileName: file.name,
          evidenceId: persisted.id,
          duplicate: persisted.duplicate,
        });
      } catch (error) {
        if (uploadClaim) {
          try {
            await scheduleItemCleanup(
              uploadClaim.itemId,
              uploadClaim.claimToken,
              error instanceof Error ? error.message : String(error),
            );
          } catch (cleanupError) {
            // The durable owner row remains `uploading`; its lease expiry is itself
            // a cleanup candidate, so even a database outage here cannot orphan bytes.
            ctx.error(
              `[evidence-upload] cleanup scheduling ${file.name}: ${
                cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
              }`,
            );
          }
        }
        const refusal = error instanceof UploadRefusal ? error : undefined;
        ctx.error(`[evidence-upload] ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
        rejected.push({
          fileIndex: file.index,
          fileName: file.name,
          reason: refusal?.message ?? 'That file was not added. Try it again.',
        });
        if (refusal?.targetCaseId) {
          return {
            status: 409,
            jsonBody: { added, rejected, targetCaseId: refusal.targetCaseId },
          };
        }
      }
    }

    return {
      status: rejected.length ? (added.length ? 207 : 400) : created > 0 ? 201 : 200,
      jsonBody: { added, rejected },
    };
  }),
});

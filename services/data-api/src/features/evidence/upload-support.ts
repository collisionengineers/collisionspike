/** upload-support — cohesive Data API module. */

import { createHash, randomUUID } from 'node:crypto';
import { statusToInt } from '@cs/domain/codecs';
import { tx, type TxQuery } from '../../platform/db/client.js';
import { evidenceBlobPath } from './blob-store.js';
import { type UploadKind, type CanonicalUploadType } from './upload-validate.js';
import { AUDIT_ACTION, writeAudit, writeAuditStrict } from '../../shared/audit.js';
import { requestStatusRecompute } from '../cases/status-recompute.js';
import { lockCaseForMutation } from '../cases/mutation-locks.js';
import { requestArchiveMirror, requestArchiveMirrorIfEligible, type ArchiveMirrorCandidate } from '../archive/mirror-outbox.js';

const IMAGE_KIND_CODE = 100000000;

const INSTRUCTION_KIND_CODE = 100000002;

const OTHER_KIND_CODE = 100000006;

export const IDEMPOTENCY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;

export const SHA256_RE = /^[0-9a-f]{64}$/;

const IMAGE_CHECK_PENDING = 'Image check pending';

const TERMINAL_STATUS_CODES = [
  statusToInt('eva_submitted'),
  statusToInt('box_synced'),
  statusToInt('removed'),
  statusToInt('done'),
];

export type UploadSource = 'add_evidence' | 'manual_intake' | 'assistant_confirmed';

export type UploadRole = 'auto' | 'instruction' | 'extra';

const SOURCE_LABEL: Record<UploadSource, string> = {
  add_evidence: 'staff_add_evidence',
  manual_intake: 'staff_manual_intake',
  assistant_confirmed: 'staff_assistant_confirmed',
};

const SOURCE_SUMMARY: Record<UploadSource, string> = {
  add_evidence: 'Add evidence',
  manual_intake: 'New case',
  assistant_confirmed: 'Assistant confirmation',
};

export interface PreparedFile {
  index: number;
  name: string;
  bytes: Buffer;
  sha256: string;
  kind: UploadKind;
  contentType: CanonicalUploadType;
  role: UploadRole;
}

export interface AddedFile {
  fileIndex: number;
  fileName: string;
  evidenceId: string;
  duplicate: boolean;
}

export interface RejectedFile {
  fileIndex: number;
  fileName: string;
  reason: string;
}

export type ManualIntakeCompletion = 'completed' | 'already_complete' | 'not_bound';

export async function recordManualIntakeResult(input: {
  source: UploadSource;
  caseId: string;
  actor: string;
  idempotencyKey: string;
  selectedCount: number;
  added: readonly AddedFile[];
  rejected: readonly RejectedFile[];
  completion?: ManualIntakeCompletion;
}): Promise<void> {
  if (input.source !== 'manual_intake') return;
  const recovered = input.completion === 'completed'
    && input.added.length === input.selectedCount
    && input.added.some((item) => item.duplicate);
  const complete = input.rejected.length === 0
    && input.added.length === input.selectedCount
    && input.completion !== 'not_bound';
  const summary = recovered
    ? `New case files confirmed after retry (${input.added.length} of ${input.selectedCount})`
    : complete
      ? `New case files confirmed (${input.added.length} of ${input.selectedCount})`
      : input.added.length > 0
        ? `New case files need attention (${input.added.length} of ${input.selectedCount} confirmed)`
        : `New case files could not be added (0 of ${input.selectedCount} confirmed)`;
  await writeAudit({
    action: AUDIT_ACTION.evidence_upload_result,
    caseId: input.caseId,
    actor: input.actor,
    severity: complete ? 'info' : 'warning',
    summary,
    after: {
      idempotencyKey: input.idempotencyKey,
      selectedCount: input.selectedCount,
      completion: input.completion ?? 'not_attempted',
      recovered,
      added: input.added.map((item) => ({
        fileIndex: item.fileIndex,
        fileName: item.fileName,
        evidenceId: item.evidenceId,
        duplicate: item.duplicate,
      })),
      rejected: input.rejected.map((item) => ({
        fileIndex: item.fileIndex,
        fileName: item.fileName,
        reason: item.reason,
      })),
    },
  });
}

export class UploadRefusal extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly targetCaseId?: string,
  ) {
    super(message);
  }
}

export function sourceOf(value: string | File | null): UploadSource | undefined {
  return value === 'add_evidence' || value === 'manual_intake' || value === 'assistant_confirmed'
    ? value
    : undefined;
}

export function manifestHash(files: readonly PreparedFile[]): string {
  const manifest = files.map((file) => ({
    index: file.index,
    name: file.name,
    size: file.bytes.length,
    sha256: file.sha256,
    contentType: file.contentType,
    role: file.role,
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

export async function bindBatch(input: {
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
): Promise<{ id: string; duplicate: boolean; storagePath: string | null; kindCode: number } | undefined> {
  const identityRows = await q<{
    id: string;
    case_id: string;
    sha256: string | null;
    storage_path: string | null;
    kind_code: number;
  }>(
    `SELECT id, case_id, sha256, storage_path, kind_code
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
    return {
      id: row.id,
      duplicate: true,
      storagePath: row.storage_path,
      kindCode: Number(row.kind_code),
    };
  }
  const twins = await q<{ id: string; storage_path: string | null; kind_code: number }>(
    `SELECT id, storage_path, kind_code FROM evidence
      WHERE case_id = $1 AND sha256 = $2
      ORDER BY created_at, id
      LIMIT 1
      FOR UPDATE`,
    [caseId, sha256],
  );
  return twins[0]
    ? {
        id: twins[0].id,
        duplicate: true,
        storagePath: twins[0].storage_path,
        kindCode: Number(twins[0].kind_code),
      }
    : undefined;
}

function assertExistingRole(existing: { kindCode: number }, file: PreparedFile): void {
  if (file.kind !== 'document' || file.role === 'auto') return;
  const expected = file.role === 'extra' ? OTHER_KIND_CODE : INSTRUCTION_KIND_CODE;
  if (existing.kindCode !== expected) {
    throw new UploadRefusal(
      409,
      'That PDF was already added with a different role. Choose the correct file and try again.',
    );
  }
}

export type UploadItemClaim =
  | { kind: 'existing'; id: string }
  | {
      kind: 'upload';
      itemId: string;
      claimToken: string;
      pathPrefix: string;
      blobPath: string;
    };

export async function claimUploadItem(input: {
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
      assertExistingRole(existing, input.file);
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

export async function scheduleItemCleanup(itemId: string, claimToken: string, detail: string): Promise<void> {
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

export async function persistFile(input: {
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
      assertExistingRole(existing, input.file);
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
        isImage
          ? IMAGE_KIND_CODE
          : input.file.role === 'extra'
            ? OTHER_KIND_CODE
            : INSTRUCTION_KIND_CODE,
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
        assertExistingRole(raced, input.file);
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

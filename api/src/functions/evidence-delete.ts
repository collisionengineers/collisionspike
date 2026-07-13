/**
 * TKT-160 -- DELETE /api/cases/{caseId}/images/{evidenceId}
 *
 * Explicit staff-confirmed deletion of one image. The route snapshots and audits
 * the target before touching external stores, validates the persisted Archive file
 * against the exact case folder, deletes Archive before Blob, and hard-removes the
 * active evidence row only after both stores report deleted/missing/not-required.
 * A durable intent + lease makes retries idempotent and keeps partial failure honest.
 */

import { app, type InvocationContext } from '@azure/functions';
import { evidenceKindCodec } from '@cs/domain/codecs';
import { withRole } from '../lib/auth.js';
import { query, tx, type TxQuery } from '../lib/db.js';
import { actorFromClaims, AUDIT_ACTION, writeAuditStrict } from '../lib/audit.js';
import { lockCaseForMutation } from '../lib/case-mutation-locks.js';
import { deleteEvidenceBytes } from '../lib/blob.js';
import {
  deleteBoxFile,
  FunctionCallError,
  validateBoxFileDeletion,
} from '../lib/functions-client.js';
import {
  acknowledgeStatusRecompute,
  requestStatusRecompute,
} from '../lib/status-recompute.js';
import { recomputeStatus } from './cases.js';

type StoreOutcome = 'pending' | 'not_required' | 'deleted' | 'missing' | 'failed';
type DeletionState = 'pending' | 'retry_needed' | 'ready_to_finalize' | 'completed';

interface DeletionIntent extends Record<string, unknown> {
  id: string;
  evidence_id: string;
  case_id: string;
  file_name: string;
  kind_code: number;
  storage_path: string | null;
  source_message_id: string | null;
  box_file_id: string | null;
  box_folder_id: string | null;
  requested_by: string;
  state: DeletionState;
  blob_outcome: StoreOutcome;
  box_outcome: StoreOutcome;
  claim_token: string | null;
  claim_expires_at: Date | string | null;
  attempt_count: number;
}

interface EvidenceDeleteSnapshot extends Record<string, unknown> {
  id: string;
  case_id: string;
  file_name: string;
  kind_code: number;
  storage_path: string | null;
  source_message_id: string | null;
  box_file_id: string | null;
  box_folder_id: string | null;
  deletion_operation_id: string | null;
  archive_mirror_claim_token: string | null;
  archive_mirror_claim_expires_at: Date | string | null;
}

export function deletionStoreResolved(outcome: StoreOutcome): boolean {
  return outcome === 'deleted' || outcome === 'missing' || outcome === 'not_required';
}

function claimIsActive(token: string | null, expiresAt: Date | string | null): boolean {
  if (!token || !expiresAt) return false;
  const expiry = new Date(expiresAt).getTime();
  return Number.isFinite(expiry) && expiry > Date.now();
}

function clean(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
}

function snapshotMatchesIntent(row: EvidenceDeleteSnapshot, intent: DeletionIntent): boolean {
  return (
    row.id === intent.evidence_id &&
    row.case_id.toLowerCase() === intent.case_id.toLowerCase() &&
    row.kind_code === intent.kind_code &&
    clean(row.storage_path) === clean(intent.storage_path) &&
    clean(row.source_message_id) === clean(intent.source_message_id) &&
    clean(row.box_file_id) === clean(intent.box_file_id) &&
    clean(row.box_folder_id) === clean(intent.box_folder_id)
  );
}

async function readIntent(caseId: string, evidenceId: string): Promise<DeletionIntent | undefined> {
  const rows = await query<DeletionIntent>(
    'SELECT * FROM evidence_deletion WHERE case_id = $1 AND evidence_id = $2 LIMIT 1',
    [caseId, evidenceId],
  );
  return rows[0];
}

async function readSnapshot(caseId: string, evidenceId: string): Promise<EvidenceDeleteSnapshot | undefined> {
  const rows = await query<EvidenceDeleteSnapshot>(
    `SELECT e.id, e.case_id, e.file_name, e.kind_code, e.storage_path,
            e.source_message_id, e.box_file_id, c.box_folder_id,
            e.deletion_operation_id, e.archive_mirror_claim_token,
            e.archive_mirror_claim_expires_at
       FROM evidence e
       JOIN case_ c ON c.id = e.case_id
      WHERE e.id = $1 AND e.case_id = $2`,
    [evidenceId, caseId],
  );
  return rows[0];
}

function completeBody(intent: DeletionIntent, repeated = false): Record<string, unknown> {
  return {
    completed: true,
    repeated,
    evidenceId: intent.evidence_id,
    fileName: intent.file_name,
  };
}

async function preflightBox(
  intentOrSnapshot: Pick<DeletionIntent, 'box_file_id' | 'box_folder_id' | 'box_outcome'>,
): Promise<'pending' | 'missing' | 'not_required'> {
  if (!clean(intentOrSnapshot.box_file_id)) return 'not_required';
  if (deletionStoreResolved(intentOrSnapshot.box_outcome)) {
    return intentOrSnapshot.box_outcome === 'missing' ? 'missing' : 'pending';
  }
  const folderId = clean(intentOrSnapshot.box_folder_id);
  if (!folderId) throw Object.assign(new Error('archive folder unavailable'), { code: 'archive_target_invalid' });
  const result = await validateBoxFileDeletion(clean(intentOrSnapshot.box_file_id)!, folderId);
  return result.status === 'missing' ? 'missing' : 'pending';
}

type ClaimResult =
  | { kind: 'claimed'; intent: DeletionIntent }
  | { kind: 'completed'; intent: DeletionIntent }
  | { kind: 'busy' }
  | { kind: 'missing' }
  | { kind: 'retired'; mergedInto: string }
  | { kind: 'changed' }
  | { kind: 'archive_busy' };

async function claimDeletion(
  q: TxQuery,
  caseId: string,
  evidenceId: string,
  actor: string,
  imageKind: number,
  expected: EvidenceDeleteSnapshot,
  preflight: 'pending' | 'missing' | 'not_required',
): Promise<ClaimResult> {
  const lockedCase = await lockCaseForMutation(q, caseId);
  if (lockedCase.kind === 'missing') return { kind: 'missing' };
  if (lockedCase.kind === 'retired') return { kind: 'retired', mergedInto: lockedCase.mergedInto };

  const currentRows = await q<EvidenceDeleteSnapshot>(
    `SELECT e.id, e.case_id, e.file_name, e.kind_code, e.storage_path,
            e.source_message_id, e.box_file_id, c.box_folder_id,
            e.deletion_operation_id, e.archive_mirror_claim_token,
            e.archive_mirror_claim_expires_at
       FROM evidence e
       JOIN case_ c ON c.id = e.case_id
      WHERE e.id = $1 AND e.case_id = $2
      FOR UPDATE OF e, c`,
    [evidenceId, lockedCase.caseId],
  );
  const current = currentRows[0];
  if (!current || current.kind_code !== imageKind) return { kind: 'changed' };
  const expectedLike: DeletionIntent = {
    id: '', evidence_id: expected.id, case_id: expected.case_id, file_name: expected.file_name,
    kind_code: expected.kind_code, storage_path: expected.storage_path,
    source_message_id: expected.source_message_id, box_file_id: expected.box_file_id,
    box_folder_id: expected.box_folder_id, requested_by: actor, state: 'pending',
    blob_outcome: 'pending', box_outcome: 'pending', claim_token: null,
    claim_expires_at: null, attempt_count: 0,
  };
  if (!snapshotMatchesIntent(current, expectedLike)) return { kind: 'changed' };
  if (claimIsActive(current.archive_mirror_claim_token, current.archive_mirror_claim_expires_at)) {
    return { kind: 'archive_busy' };
  }

  let inserted = await q<DeletionIntent>(
    `INSERT INTO evidence_deletion
       (evidence_id, case_id, file_name, kind_code, storage_path, source_message_id,
        box_file_id, box_folder_id, requested_by, blob_outcome, box_outcome)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (evidence_id) DO NOTHING
     RETURNING *`,
    [
      evidenceId,
      lockedCase.caseId,
      current.file_name,
      imageKind,
      clean(current.storage_path),
      clean(current.source_message_id),
      clean(current.box_file_id),
      clean(current.box_folder_id),
      actor,
      clean(current.storage_path) ? 'pending' : 'not_required',
      preflight,
    ],
  );

  if (inserted[0]) {
    const marker = await q<{ id: string }>(
      `UPDATE evidence
          SET deletion_operation_id = $3, updated_at = now()
        WHERE id = $1 AND case_id = $2 AND deletion_operation_id IS NULL
        RETURNING id`,
      [evidenceId, lockedCase.caseId, inserted[0].id],
    );
    if (!marker[0]) throw new Error('image deletion marker was not applied');
    // Keep the locked snapshot aligned with the marker written in this same
    // transaction so the invariant check below also covers a first attempt.
    current.deletion_operation_id = inserted[0].id;
    await writeAuditStrict({
      action: AUDIT_ACTION.image_deletion_requested,
      caseId: lockedCase.caseId,
      summary: `Image deletion requested for ${current.file_name}`,
      actor,
      after: {
        operationId: inserted[0].id,
        evidenceId,
        storagePath: clean(current.storage_path),
        sourceMessageId: clean(current.source_message_id),
        archiveFileId: clean(current.box_file_id),
        archiveFolderId: clean(current.box_folder_id),
      },
    }, q);
  }

  const intentRows = inserted[0]
    ? inserted
    : await q<DeletionIntent>(
        'SELECT * FROM evidence_deletion WHERE evidence_id = $1 AND case_id = $2 FOR UPDATE',
        [evidenceId, lockedCase.caseId],
      );
  const intent = intentRows[0];
  if (!intent || !snapshotMatchesIntent(current, intent)) return { kind: 'changed' };
  if (intent.state === 'completed') return { kind: 'completed', intent };
  if (current.deletion_operation_id !== intent.id) return { kind: 'changed' };

  const claimed = await q<DeletionIntent>(
    `UPDATE evidence_deletion
        SET state = 'pending',
            blob_outcome = CASE WHEN blob_outcome = 'failed' THEN 'pending' ELSE blob_outcome END,
            box_outcome = CASE
              WHEN $2::text = 'missing' THEN 'missing'
              WHEN box_outcome = 'failed' THEN 'pending'
              ELSE box_outcome
            END,
            claim_token = gen_random_uuid(),
            claim_expires_at = now() + interval '5 minutes',
            attempt_count = attempt_count + 1,
            last_attempt_at = now(), last_failure_code = NULL, updated_at = now()
      WHERE id = $1
        AND state IN ('pending','retry_needed')
        AND (claim_token IS NULL OR claim_expires_at <= now())
      RETURNING *`,
    [intent.id, preflight],
  );
  return claimed[0] ? { kind: 'claimed', intent: claimed[0] } : { kind: 'busy' };
}

async function stampStoreOutcome(
  operationId: string,
  claimToken: string,
  store: 'blob' | 'box',
  outcome: StoreOutcome,
): Promise<void> {
  const column = store === 'blob' ? 'blob_outcome' : 'box_outcome';
  const rows = await query<{ id: string }>(
    `UPDATE evidence_deletion SET ${column} = $3, updated_at = now()
      WHERE id = $1 AND claim_token = $2 RETURNING id`,
    [operationId, claimToken, outcome],
  );
  if (!rows[0]) throw new Error('image deletion claim changed');
}

async function recordFailure(
  intent: DeletionIntent,
  actor: string,
  store: 'blob' | 'box',
  code: string,
): Promise<void> {
  await tx(async (q) => {
    const column = store === 'blob' ? 'blob_outcome' : 'box_outcome';
    const rows = await q<DeletionIntent>(
      `UPDATE evidence_deletion
          SET ${column} = 'failed', state = 'retry_needed', last_failure_code = $3,
              claim_token = NULL, claim_expires_at = NULL, updated_at = now()
        WHERE id = $1 AND claim_token = $2
        RETURNING *`,
      [intent.id, intent.claim_token, code],
    );
    if (!rows[0]) throw new Error('image deletion claim changed');
    await writeAuditStrict({
      action: AUDIT_ACTION.image_deletion_failed,
      caseId: intent.case_id,
      summary: `Image deletion needs retry for ${intent.file_name}`,
      severity: 'warning',
      actor,
      after: {
        operationId: intent.id,
        evidenceId: intent.evidence_id,
        failedStore: store === 'box' ? 'archive' : 'temporary_copy',
        failureCode: code,
      },
    }, q);
  });
}

async function finalizeDeletion(intent: DeletionIntent, actor: string): Promise<number> {
  return tx(async (q) => {
    const caseLock = await lockCaseForMutation(q, intent.case_id);
    if (caseLock.kind !== 'active') throw new Error('image deletion case changed');
    const completed = await q<{ case_id: string; evidence_id: string }>(
      'SELECT * FROM complete_evidence_deletion($1::uuid, $2::uuid)',
      [intent.id, intent.claim_token],
    );
    if (!completed[0]) throw new Error('image deletion was not finalized');
    const generation = await requestStatusRecompute(q, intent.case_id);
    await writeAuditStrict({
      action: AUDIT_ACTION.image_deleted,
      caseId: intent.case_id,
      summary: `Image deleted: ${intent.file_name}`,
      actor,
      before: {
        evidenceId: intent.evidence_id,
        storagePath: intent.storage_path,
        sourceMessageId: intent.source_message_id,
        archiveFileId: intent.box_file_id,
      },
      after: {
        operationId: intent.id,
        blobOutcome: intent.blob_outcome,
        archiveOutcome: intent.box_outcome,
      },
    }, q);
    return generation;
  });
}

app.http('deleteCaseImage', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'cases/{caseId}/images/{evidenceId}',
  handler: withRole('CollisionSpike.User', async (req, ctx: InvocationContext, claims) => {
    const caseId = (req.params.caseId ?? '').trim().toLowerCase();
    const evidenceId = (req.params.evidenceId ?? '').trim().toLowerCase();
    if (!caseId || !evidenceId) {
      return { status: 400, jsonBody: { error: 'case and image identifiers are required' } };
    }
    const actor = actorFromClaims(claims) ?? 'authenticated staff';
    const imageKind = evidenceKindCodec.toInt('image') ?? 100000000;

    let existing = await readIntent(caseId, evidenceId);
    if (existing?.state === 'completed') {
      return { status: 200, jsonBody: completeBody(existing, true) };
    }
    let snapshot = await readSnapshot(caseId, evidenceId);
    if (!snapshot) return { status: 404, jsonBody: { error: 'image not found' } };
    if (snapshot.kind_code !== imageKind) {
      return { status: 409, jsonBody: { error: 'Only case images can be deleted here.' } };
    }
    if (existing && !snapshotMatchesIntent(snapshot, existing)) {
      return {
        status: 409,
        jsonBody: { message: 'This image changed while deletion was being prepared. Refresh and try again.' },
      };
    }
    if (claimIsActive(snapshot.archive_mirror_claim_token, snapshot.archive_mirror_claim_expires_at)) {
      return {
        status: 409,
        jsonBody: { message: 'This image is still being added to the Archive. Try again shortly.' },
      };
    }

    let preflight: 'pending' | 'missing' | 'not_required';
    try {
      preflight = await preflightBox(existing ?? {
        box_file_id: snapshot.box_file_id,
        box_folder_id: snapshot.box_folder_id,
        box_outcome: snapshot.box_file_id ? 'pending' : 'not_required',
      });
    } catch (error) {
      const invalid =
        (error instanceof FunctionCallError && error.status === 400) ||
        (error && typeof error === 'object' && 'code' in error && error.code === 'archive_target_invalid');
      return {
        status: invalid ? 409 : 503,
        jsonBody: {
          message: invalid
            ? 'This image could not be matched safely to this case’s Archive folder. Nothing was deleted.'
            : 'The Archive copy could not be checked. Nothing was deleted; try again.',
          retryable: !invalid,
        },
      };
    }

    const claim = await tx((q) =>
      claimDeletion(q, caseId, evidenceId, actor, imageKind, snapshot!, preflight),
    );
    if (claim.kind === 'missing') return { status: 404, jsonBody: { error: 'image not found' } };
    if (claim.kind === 'retired') {
      return {
        status: 409,
        jsonBody: { message: 'This case was merged. Open the current case and try again.', targetCaseId: claim.mergedInto },
      };
    }
    if (claim.kind === 'archive_busy') {
      return { status: 409, jsonBody: { message: 'This image is still being added to the Archive. Try again shortly.' } };
    }
    if (claim.kind === 'changed') {
      return { status: 409, jsonBody: { message: 'This image changed. Refresh and try again.' } };
    }
    if (claim.kind === 'busy') {
      return { status: 409, jsonBody: { message: 'This image is already being deleted. Refresh shortly.' } };
    }
    if (claim.kind === 'completed') {
      return { status: 200, jsonBody: completeBody(claim.intent, true) };
    }

    const intent = claim.intent;
    const claimToken = intent.claim_token!;
    try {
      if (!deletionStoreResolved(intent.box_outcome)) {
        const result = await deleteBoxFile(intent.box_file_id!, intent.box_folder_id!);
        intent.box_outcome = result.status === 'missing' ? 'missing' : 'deleted';
        await stampStoreOutcome(intent.id, claimToken, 'box', intent.box_outcome);
      }
    } catch (error) {
      const unsafe = error instanceof FunctionCallError && error.status === 400;
      await recordFailure(intent, actor, 'box', unsafe ? 'archive_target_changed' : 'archive_delete_failed');
      return {
        status: unsafe ? 409 : 503,
        jsonBody: {
          completed: false,
          retryable: !unsafe,
          evidenceId,
          fileName: intent.file_name,
          message: unsafe
            ? 'The Archive copy moved or no longer belongs to this case. The image is still on the case.'
            : 'The Archive copy could not be removed. The image is still on the case; try again.',
          deletionPending: true,
        },
      };
    }

    try {
      if (!deletionStoreResolved(intent.blob_outcome)) {
        const removed = await deleteEvidenceBytes(intent.storage_path!);
        intent.blob_outcome = removed ? 'deleted' : 'missing';
        await stampStoreOutcome(intent.id, claimToken, 'blob', intent.blob_outcome);
      }
    } catch {
      await recordFailure(intent, actor, 'blob', 'temporary_copy_delete_failed');
      return {
        status: 503,
        jsonBody: {
          completed: false,
          retryable: true,
          evidenceId,
          fileName: intent.file_name,
          message: 'One stored copy could not be removed. The image is still on the case; try again.',
          deletionPending: true,
        },
      };
    }

    let generation: number;
    try {
      generation = await finalizeDeletion(intent, actor);
    } catch (error) {
      ctx.warn(`[image-delete] finalization pending for ${evidenceId}: ${error instanceof Error ? error.message : String(error)}`);
      await recordFailure(intent, actor, 'blob', 'finalization_failed').catch(() => undefined);
      return {
        status: 503,
        jsonBody: {
          completed: false,
          retryable: true,
          evidenceId,
          fileName: intent.file_name,
          message: 'The stored copies were removed, but the case still needs updating. Try again.',
          deletionPending: true,
        },
      };
    }

    try {
      const evaluated = await recomputeStatus(caseId, actor);
      if (!evaluated) throw new Error('case unavailable');
      await acknowledgeStatusRecompute(query, caseId, generation);
    } catch (error) {
      ctx.warn(`[image-delete] readiness recompute remains pending for ${caseId}: ${error instanceof Error ? error.message : String(error)}`);
    }
    existing = { ...intent, state: 'completed' };
    return { status: 200, jsonBody: completeBody(existing) };
  }),
});

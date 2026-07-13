import { createHash } from 'node:crypto';
import type { TxQuery } from './db.js';

export const MANUAL_INTAKE_OPERATION_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? 'undefined' : encoded;
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

export function manualIntakeRequestHash(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export class ManualIntakeOperationConflict extends Error {}

export interface ManualIntakeOperationBinding {
  idempotencyKey: string;
  actor: string;
  requestHash: string;
  uploadIdempotencyKey?: string;
  expectedFileCount: number;
  instructionFileIndex?: number;
}

/** Claim one manual case-create operation. A committed case is returned on replay.
 * Before its evidence batch completes, the same case operation may rebind to a
 * changed file selection; exact-content deduplication makes the new upload safe. */
export async function beginManualIntakeOperation(
  q: TxQuery,
  input: ManualIntakeOperationBinding,
): Promise<string | undefined> {
  const uploadKey = input.uploadIdempotencyKey ?? null;
  const instructionIndex = input.instructionFileIndex ?? null;
  await q(
    `INSERT INTO manual_intake_case_create_operation
       (idempotency_key, actor, request_hash, upload_idempotency_key, expected_file_count,
        instruction_file_index)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [input.idempotencyKey, input.actor, input.requestHash, uploadKey, input.expectedFileCount,
      instructionIndex],
  );
  const rows = await q<{
    actor: string;
    request_hash: string;
    case_id: string | null;
    upload_idempotency_key: string | null;
    expected_file_count: number | string;
    evidence_completed_at: Date | string | null;
    instruction_file_index: number | string | null;
  }>(
    `SELECT actor, request_hash, case_id, upload_idempotency_key,
            expected_file_count, evidence_completed_at, instruction_file_index
       FROM manual_intake_case_create_operation
      WHERE idempotency_key = $1
      FOR UPDATE`,
    [input.idempotencyKey],
  );
  const operation = rows[0];
  if (
    !operation ||
    operation.actor !== input.actor ||
    operation.request_hash !== input.requestHash
  ) {
    throw new ManualIntakeOperationConflict(
      'This case attempt no longer matches the reviewed details.',
    );
  }

  const bindingChanged =
    operation.upload_idempotency_key !== uploadKey ||
    Number(operation.expected_file_count) !== input.expectedFileCount ||
    (operation.instruction_file_index == null ? null : Number(operation.instruction_file_index))
      !== instructionIndex;
  if (bindingChanged) {
    await q(
      `UPDATE manual_intake_case_create_operation
          SET upload_idempotency_key = $2, expected_file_count = $3,
              instruction_file_index = $4,
              evidence_completed_at = CASE WHEN $3 = 0 THEN now() ELSE NULL END,
              response_loss_recovery_audited_at = NULL,
              updated_at = now()
        WHERE idempotency_key = $1`,
      [input.idempotencyKey, uploadKey, input.expectedFileCount, instructionIndex],
    );
  }
  return operation.case_id ?? undefined;
}

export async function finishManualIntakeOperation(
  q: TxQuery,
  idempotencyKey: string,
  caseId: string,
  expectedFileCount: number,
): Promise<void> {
  const rows = await q<{ idempotency_key: string }>(
    `UPDATE manual_intake_case_create_operation
        SET case_id = $2,
            evidence_completed_at = CASE WHEN $3 = 0 THEN now() ELSE evidence_completed_at END,
            updated_at = now()
      WHERE idempotency_key = $1 AND case_id IS NULL
      RETURNING idempotency_key`,
    [idempotencyKey, caseId, expectedFileCount],
  );
  if (!rows[0]) {
    throw new ManualIntakeOperationConflict('This case attempt could not be completed safely.');
  }
}

export async function completeManualIntakeEvidence(
  q: TxQuery,
  input: {
    caseId: string;
    uploadIdempotencyKey: string;
    fileCount: number;
    instructionFileIndex?: number;
  },
): Promise<'completed' | 'already_complete' | 'not_bound'> {
  const instructionIndex = input.instructionFileIndex ?? null;
  const rows = await q<{ idempotency_key: string }>(
    `UPDATE manual_intake_case_create_operation
        SET evidence_completed_at = now(), updated_at = now()
      WHERE case_id = $1
        AND upload_idempotency_key = $2
        AND expected_file_count = $3
        AND instruction_file_index IS NOT DISTINCT FROM $4::integer
        AND evidence_completed_at IS NULL
      RETURNING idempotency_key`,
    [input.caseId, input.uploadIdempotencyKey, input.fileCount, instructionIndex],
  );
  if (rows[0]) return 'completed';

  const bindings = await q<{
    upload_idempotency_key: string | null;
    expected_file_count: number | string;
    instruction_file_index: number | string | null;
    evidence_completed_at: Date | string | null;
  }>(
    `SELECT upload_idempotency_key, expected_file_count, instruction_file_index,
            evidence_completed_at
       FROM manual_intake_case_create_operation
      WHERE case_id = $1
      FOR UPDATE`,
    [input.caseId],
  );
  const binding = bindings[0];
  if (
    binding
    && binding.upload_idempotency_key === input.uploadIdempotencyKey
    && Number(binding.expected_file_count) === input.fileCount
    && (binding.instruction_file_index == null ? null : Number(binding.instruction_file_index))
      === instructionIndex
    && binding.evidence_completed_at != null
  ) {
    return 'already_complete';
  }
  return 'not_bound';
}

/** Check the exact operation binding before any Blob write. */
export async function manualIntakeEvidenceBindingState(
  q: TxQuery,
  input: {
    caseId: string;
    uploadIdempotencyKey: string;
    fileCount: number;
    instructionFileIndex?: number;
  },
): Promise<'pending' | 'already_complete' | 'not_bound'> {
  const instructionIndex = input.instructionFileIndex ?? null;
  const rows = await q<{
    upload_idempotency_key: string | null;
    expected_file_count: number | string;
    instruction_file_index: number | string | null;
    evidence_completed_at: Date | string | null;
  }>(
    `SELECT upload_idempotency_key, expected_file_count, instruction_file_index,
            evidence_completed_at
       FROM manual_intake_case_create_operation
      WHERE case_id = $1
      FOR UPDATE`,
    [input.caseId],
  );
  const binding = rows[0];
  if (
    !binding ||
    binding.upload_idempotency_key !== input.uploadIdempotencyKey ||
    Number(binding.expected_file_count) !== input.fileCount ||
    (binding.instruction_file_index == null ? null : Number(binding.instruction_file_index))
      !== instructionIndex
  ) return 'not_bound';
  return binding.evidence_completed_at == null ? 'pending' : 'already_complete';
}

/** Claim the one audit that explains a completed batch whose first response was lost. */
export async function claimManualIntakeRecoveryAudit(
  q: TxQuery,
  input: {
    caseId: string;
    uploadIdempotencyKey: string;
    fileCount: number;
    instructionFileIndex?: number;
  },
): Promise<boolean> {
  const rows = await q<{ idempotency_key: string }>(
    `UPDATE manual_intake_case_create_operation
        SET response_loss_recovery_audited_at = now(), updated_at = now()
      WHERE case_id = $1
        AND upload_idempotency_key = $2
        AND expected_file_count = $3
        AND instruction_file_index IS NOT DISTINCT FROM $4::integer
        AND evidence_completed_at IS NOT NULL
        AND response_loss_recovery_audited_at IS NULL
      RETURNING idempotency_key`,
    [input.caseId, input.uploadIdempotencyKey, input.fileCount,
      input.instructionFileIndex ?? null],
  );
  return rows.length > 0;
}

export async function manualIntakeSideEffectsPending(
  q: TxQuery,
  idempotencyKey: string,
): Promise<boolean> {
  const rows = await q<{ side_effects_completed_at: Date | string | null }>(
    `SELECT side_effects_completed_at
       FROM manual_intake_case_create_operation
      WHERE idempotency_key = $1
      FOR UPDATE`,
    [idempotencyKey],
  );
  return Boolean(rows[0]) && rows[0].side_effects_completed_at == null;
}

export async function finishManualIntakeSideEffects(
  q: TxQuery,
  idempotencyKey: string,
): Promise<void> {
  await q(
    `UPDATE manual_intake_case_create_operation
        SET side_effects_completed_at = COALESCE(side_effects_completed_at, now()), updated_at = now()
      WHERE idempotency_key = $1`,
    [idempotencyKey],
  );
}

export async function manualIntakeEvidenceState(
  q: TxQuery,
  caseId: string,
): Promise<{ pending: boolean; archiveFailed: boolean }> {
  const rows = await q<{ pending: boolean; archiveFailed: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM manual_intake_case_create_operation
        WHERE case_id = $1
          AND expected_file_count > 0
          AND evidence_completed_at IS NULL
     ) AS pending,
     EXISTS (
       SELECT 1
         FROM staff_evidence_upload batch
         JOIN staff_evidence_upload_item item
           ON item.idempotency_key = batch.idempotency_key
          AND item.case_id = batch.case_id
          AND item.evidence_id IS NOT NULL
         JOIN archive_mirror_outbox o ON o.evidence_id = item.evidence_id
        WHERE batch.case_id = $1
          AND batch.source = 'manual_intake'
          AND o.dead_lettered_at IS NOT NULL
     ) AS "archiveFailed"`,
    [caseId],
  );
  return {
    pending: rows[0]?.pending === true,
    archiveFailed: rows[0]?.archiveFailed === true,
  };
}

export async function manualIntakeEvidencePending(
  q: TxQuery,
  caseId: string,
): Promise<boolean> {
  const state = await manualIntakeEvidenceState(q, caseId);
  return state.pending || state.archiveFailed;
}

/** merge-intake-ownership — cohesive Data API module. */

import type { TxQuery } from '../../platform/db/client.js';

export async function manualIntakeMergeConflict(
  q: TxQuery,
  sourceCaseId: string,
  targetCaseId: string,
): Promise<string | undefined> {
  const operations = await q<{
    case_id: string;
    expected_file_count: number | string;
    evidence_completed_at: Date | string | null;
    side_effects_completed_at: Date | string | null;
  }>(
    `SELECT case_id, expected_file_count, evidence_completed_at, side_effects_completed_at
       FROM manual_intake_case_create_operation
      WHERE case_id = ANY($1::uuid[])
      ORDER BY case_id, created_at, idempotency_key
      FOR UPDATE`,
    [[sourceCaseId, targetCaseId]],
  );
  const incomplete = operations.some((operation) =>
    operation.side_effects_completed_at == null ||
    (Number(operation.expected_file_count) > 0 && operation.evidence_completed_at == null));
  return incomplete
    ? 'Source files are still being added for one of these cases. Finish or retry them before merging.'
    : undefined;
}

export async function transferStaffUploadOwnership(
  q: TxQuery,
  sourceCaseId: string,
  targetCaseId: string,
): Promise<void> {
  // Move the durable parent batch first. Evidence coalescing above may rebind an
  // item's evidence identity, but ownership stays on the source until its batch
  // owns the survivor. The following item update then restores the batch/item
  // case invariant before the transaction becomes visible.
  await q(
    `UPDATE staff_evidence_upload
        SET case_id = $2, updated_at = now()
      WHERE case_id = $1`,
    [sourceCaseId, targetCaseId],
  );
  await q(
    `UPDATE staff_evidence_upload_item
        SET case_id = $2, updated_at = now()
      WHERE case_id = $1`,
    [sourceCaseId, targetCaseId],
  );
  await q(
    `UPDATE manual_intake_case_create_operation
        SET case_id = $2, updated_at = now()
      WHERE case_id = $1`,
    [sourceCaseId, targetCaseId],
  );
}

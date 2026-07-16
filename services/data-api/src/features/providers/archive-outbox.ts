/**
 * Durable continuation for the remote half of provider recovery.
 *
 * Identity and Case/PO are committed in Postgres first. A generation requested in
 * that same transaction remains pending until orchestration runs the existing
 * fail-closed Archive-folder seam and the Data API verifies the exact case row.
 */
import type { TxQuery } from '../../platform/db/client.js';

export async function requestProviderArchive(
  q: TxQuery,
  caseId: string,
): Promise<number> {
  const rows = await q<{ provider_archive_requested_generation: string | number }>(
    `UPDATE case_
        SET provider_archive_requested_generation = provider_archive_requested_generation + 1,
            provider_archive_requested_at = now(),
            provider_archive_attempt_count = 0,
            provider_archive_next_attempt_at = now(),
            provider_archive_last_error = NULL,
            updated_at = now()
      WHERE id = $1
      RETURNING provider_archive_requested_generation`,
    [caseId],
  );
  if (!rows[0]) throw new Error('provider Archive target case disappeared');
  return Number(rows[0].provider_archive_requested_generation);
}

/** Retiring a merge source makes its old remote intent obsolete. */
export async function cancelProviderArchive(
  q: TxQuery,
  caseId: string,
): Promise<void> {
  await q(
    `UPDATE case_
        SET provider_archive_completed_generation = provider_archive_requested_generation,
            provider_archive_completed_at = CASE
              WHEN provider_archive_completed_generation < provider_archive_requested_generation
                THEN now()
              ELSE provider_archive_completed_at
            END,
            provider_archive_last_error = CASE
              WHEN provider_archive_completed_generation < provider_archive_requested_generation
                THEN 'superseded by merge target'
              ELSE provider_archive_last_error
            END,
            updated_at = now()
      WHERE id = $1
        AND provider_archive_completed_generation < provider_archive_requested_generation`,
    [caseId],
  );
}

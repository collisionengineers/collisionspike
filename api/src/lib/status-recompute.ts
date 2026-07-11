/**
 * Durable status-recompute request helper.
 *
 * Evidence mutations call this in the SAME transaction as their field write. The
 * orchestration status sweep acknowledges generations only after evaluation succeeds,
 * so a crash or transient API failure cannot strand readiness on stale evidence.
 */
import type { TxQuery } from './db.js';

export async function requestStatusRecompute(q: TxQuery, caseId: string): Promise<number> {
  const rows = await q<{ status_recompute_requested_generation: string | number }>(
    `UPDATE case_
        SET status_recompute_requested_generation = status_recompute_requested_generation + 1,
            status_recompute_requested_at = now()
      WHERE id = $1
      RETURNING status_recompute_requested_generation`,
    [caseId],
  );
  if (!rows[0]) throw new Error('status recompute target case disappeared');
  return Number(rows[0].status_recompute_requested_generation);
}

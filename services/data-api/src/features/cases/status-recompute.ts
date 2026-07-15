/**
 * Durable status-recompute request helper.
 *
 * Evidence mutations call this in the SAME transaction as their field write. The
 * orchestration status sweep acknowledges generations only after evaluation succeeds,
 * so a crash or transient API failure cannot strand readiness on stale evidence.
 */
import type { TxQuery } from '../../platform/db/client.js';

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

/**
 * Acknowledge at most the generation that was actually evaluated. GREATEST keeps
 * completion monotonic; LEAST prevents an old evaluator from consuming newer work.
 */
export async function acknowledgeStatusRecompute(
  q: TxQuery,
  caseId: string,
  generation: number,
): Promise<{ completed: boolean; pending: boolean }> {
  const rows = await q<{
    status_recompute_requested_generation: string | number;
    status_recompute_completed_generation: string | number;
  }>(
    `UPDATE case_
        SET status_recompute_completed_generation = GREATEST(
              status_recompute_completed_generation,
              LEAST($2::bigint, status_recompute_requested_generation)
            )
      WHERE id = $1
      RETURNING status_recompute_requested_generation,
                status_recompute_completed_generation`,
    [caseId, generation],
  );
  if (!rows[0]) throw new Error('status recompute target case disappeared');
  const requested = Number(rows[0].status_recompute_requested_generation);
  const completed = Number(rows[0].status_recompute_completed_generation);
  return { completed: completed >= generation, pending: completed < requested };
}

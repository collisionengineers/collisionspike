import type { TxQuery } from '../../platform/db/client.js';

export interface ArchiveMirrorCandidate extends Record<string, unknown> {
  id: string;
  case_id: string;
  excluded: boolean;
  storage_path: string | null;
  box_file_id: string | null;
}

/**
 * Advance durable archive work for a currently eligible evidence row. The caller
 * supplies its transaction-bound query so this generation commits atomically with the
 * decision that made the row eligible. Returns the requested generation, or undefined
 * when the row is excluded, byte-less, or already archived.
 */
export async function requestArchiveMirrorIfEligible(
  q: TxQuery,
  row: Partial<ArchiveMirrorCandidate>,
): Promise<number | undefined> {
  const storagePath = typeof row.storage_path === 'string' ? row.storage_path.trim() : '';
  const boxFileId = typeof row.box_file_id === 'string' ? row.box_file_id.trim() : '';
  if (
    row.excluded !== false ||
    !row.id ||
    !row.case_id ||
    !storagePath ||
    boxFileId
  ) {
    return undefined;
  }
  return requestArchiveMirrorGeneration(
    q,
    row as Pick<ArchiveMirrorCandidate, 'id' | 'case_id'>,
  );
}

async function requestArchiveMirrorGeneration(
  q: TxQuery,
  row: Pick<ArchiveMirrorCandidate, 'id' | 'case_id'>,
): Promise<number | undefined> {
  const requested = await q<{ requested_generation: string | number }>(
    `INSERT INTO archive_mirror_outbox
       (evidence_id, case_id, requested_generation, completed_generation,
        requested_at, updated_at)
     VALUES ($1, $2, 1, 0, now(), now())
     ON CONFLICT (evidence_id) DO UPDATE
       SET case_id = EXCLUDED.case_id,
           requested_generation = archive_mirror_outbox.requested_generation + 1,
           requested_at = now(),
           attempt_count = 0,
           next_attempt_at = now(),
           last_attempt_at = NULL,
           last_error = NULL,
           dead_lettered_at = NULL,
           dead_letter_reason = NULL,
           updated_at = now()
     RETURNING requested_generation`,
    [row.id, row.case_id],
  );
  return requested[0] ? Number(requested[0].requested_generation) : undefined;
}

/**
 * Record an evidence generation even when it is intentionally ineligible right now.
 * The monitor acknowledges that inert generation; a later classifier/staff decision
 * requests the next generation if the row becomes eligible. This is used by staff
 * photos so archive work is durable from creation without racing the image-safety gate.
 */
export async function requestArchiveMirror(
  q: TxQuery,
  row: Pick<ArchiveMirrorCandidate, 'id' | 'case_id'>,
): Promise<number> {
  const generation = await requestArchiveMirrorGeneration(q, row);
  if (generation === undefined) throw new Error('archive mirror request returned no generation');
  return generation;
}

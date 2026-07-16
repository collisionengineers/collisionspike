/**
 * Transaction-scoped advisory locks shared by case merge and evidence backfill.
 *
 * Every caller derives the same namespaced key for a case and acquires multiple
 * keys in lexical order. That fixed global order prevents reverse concurrent
 * merges from deadlocking while still serialising a backfill against a merge of
 * its current case.
 */
import type { TxQuery } from '../../platform/db/client.js';
import { mergedIntoFrom } from '../../shared/mapping/index.js';

const CASE_MUTATION_LOCK_NAMESPACE = 'case-merge-backfill:';

/** Normalised, deduplicated case ids in the one global acquisition order. */
export function orderedCaseMutationIds(caseIds: readonly string[]): string[] {
  return [...new Set(caseIds.map((id) => id.trim().toLowerCase()).filter(Boolean))].sort();
}

/** Pure lock-key derivation, exported so the deadlock-prevention contract is pinned. */
export function deriveCaseMutationLockKeys(caseIds: readonly string[]): string[] {
  return orderedCaseMutationIds(caseIds).map((id) => `${CASE_MUTATION_LOCK_NAMESPACE}${id}`);
}

/** Acquire the case locks inside the caller's existing transaction. */
export async function acquireCaseMutationLocks(q: TxQuery, caseIds: readonly string[]): Promise<void> {
  for (const key of deriveCaseMutationLockKeys(caseIds)) {
    await q('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
  }
}

export type LockedCaseMutation =
  | { kind: 'active'; caseId: string }
  | { kind: 'retired'; caseId: string; mergedInto: string }
  | { kind: 'missing'; caseId: string };

/**
 * Take the shared case-mutation advisory lock and then the physical case row lock.
 *
 * Every evidence writer must call this before locking/inserting evidence or touching an
 * evidence-owned outbox row. Merge uses the same advisory key and locks case rows before
 * evidence, so this establishes one global case -> evidence -> outbox order. The merge
 * marker is read only after both locks are held; a writer can never continue against a
 * case that retired while it was waiting.
 */
export async function lockCaseForMutation(
  q: TxQuery,
  requestedCaseId: string,
): Promise<LockedCaseMutation> {
  const caseId = requestedCaseId.trim().toLowerCase();
  if (!caseId) return { kind: 'missing', caseId };
  await acquireCaseMutationLocks(q, [caseId]);
  const rows = await q<{ id: string; duplicate_keys: unknown }>(
    'SELECT id, duplicate_keys FROM case_ WHERE id = $1 FOR UPDATE',
    [caseId],
  );
  const row = rows[0];
  if (!row) return { kind: 'missing', caseId };
  const canonicalId = row.id.trim().toLowerCase();
  const mergedInto = mergedIntoFrom(row.duplicate_keys)?.trim().toLowerCase();
  if (mergedInto) return { kind: 'retired', caseId: canonicalId, mergedInto };
  return { kind: 'active', caseId: canonicalId };
}

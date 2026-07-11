/**
 * Transaction-scoped advisory locks shared by case merge and evidence backfill.
 *
 * Every caller derives the same namespaced key for a case and acquires multiple
 * keys in lexical order. That fixed global order prevents reverse concurrent
 * merges from deadlocking while still serialising a backfill against a merge of
 * its current case.
 */
import type { TxQuery } from './db.js';

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

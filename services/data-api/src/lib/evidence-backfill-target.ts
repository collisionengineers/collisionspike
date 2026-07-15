/**
 * Resolve and lock the case currently owning a queued evidence backfill.
 *
 * A different inbound_email.case_id is accepted only when the queued case's
 * durable duplicate_keys.mergedInto chain ends at that exact current owner.
 * Manual detach/relink therefore stays a benign stale result, while a real case
 * merge redirects the work to its survivor.
 */
import { query, tx, type TxQuery } from './db.js';
import { mergedIntoFrom } from './mappers.js';
import {
  acquireCaseMutationLocks,
  orderedCaseMutationIds,
} from './case-mutation-locks.js';

const MAX_MERGE_LINEAGE_HOPS = 16;
const MAX_LOCK_RETRIES = 4;

export type EvidenceBackfillTargetResult<T> =
  | { kind: 'resolved'; targetCaseId: string; value: T }
  | { kind: 'stale' };

type OptimisticTargetProbe =
  | { kind: 'resolved'; owner: string; lineage: string[] }
  | { kind: 'stale' }
  | { kind: 'retry' };

async function inboundOwner(q: TxQuery, inboundEmailId: string, forUpdate = false): Promise<string | null> {
  const rows = await q<{ case_id: string | null }>(
    `SELECT case_id FROM inbound_email WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [inboundEmailId],
  );
  return rows[0]?.case_id ?? null;
}

/**
 * Return the complete requested->survivor lineage only when its final case is
 * exactly `currentOwner`. Every row is read, including the final survivor, so a
 * retired intermediate cannot masquerade as the current target.
 */
export async function verifiedMergeLineage(
  q: TxQuery,
  requestedCaseId: string,
  currentOwner: string,
): Promise<string[] | null> {
  const lineage: string[] = [];
  const seen = new Set<string>();
  let cursor = requestedCaseId;

  for (let hop = 0; hop <= MAX_MERGE_LINEAGE_HOPS; hop++) {
    const canonical = cursor.trim().toLowerCase();
    if (!canonical || seen.has(canonical)) return null;
    seen.add(canonical);

    const rows = await q<{ id: string; duplicate_keys: unknown }>(
      'SELECT id, duplicate_keys FROM case_ WHERE id = $1',
      [cursor],
    );
    const row = rows[0];
    if (!row) return null;
    lineage.push(row.id);

    const next = mergedIntoFrom(row.duplicate_keys);
    if (!next) {
      return row.id.toLowerCase() === currentOwner.trim().toLowerCase() ? lineage : null;
    }
    cursor = next;
  }
  return null;
}

/**
 * Read owner -> lineage -> owner and accept the probe only when the owner stayed
 * stable across the lineage walk. Under READ COMMITTED each SELECT gets a fresh
 * statement snapshot; a merge can otherwise commit between the first owner read
 * and the lineage reads, making a valid old->survivor chain look unrelated. The
 * second owner read turns that mixed-snapshot observation into a retry, never stale.
 */
async function stableOptimisticTargetProbe(
  inboundEmailId: string,
  requestedCaseId: string,
): Promise<OptimisticTargetProbe> {
  const ownerBefore = await inboundOwner(query, inboundEmailId);
  const lineage = ownerBefore
    ? await verifiedMergeLineage(query, requestedCaseId, ownerBefore)
    : null;
  const ownerAfter = await inboundOwner(query, inboundEmailId);

  if ((ownerBefore ?? '').trim().toLowerCase() !== (ownerAfter ?? '').trim().toLowerCase()) {
    return { kind: 'retry' };
  }
  if (!ownerBefore || !lineage) return { kind: 'stale' };
  return { kind: 'resolved', owner: ownerBefore, lineage };
}

/**
 * Run `work` under the case-lineage advisory locks, locked case rows, and locked
 * inbound row. A merge that commits between the optimistic probe and lock
 * acquisition causes a fresh transaction retry with the new complete lineage.
 */
export async function withResolvedEvidenceBackfillTarget<T>(
  inboundEmailId: string,
  requestedCaseId: string,
  work: (q: TxQuery, targetCaseId: string) => Promise<T>,
): Promise<EvidenceBackfillTargetResult<T>> {
  for (let attempt = 0; attempt < MAX_LOCK_RETRIES; attempt++) {
    const probe = await stableOptimisticTargetProbe(inboundEmailId, requestedCaseId);
    if (probe.kind === 'retry') continue;
    if (probe.kind === 'stale') return probe;
    const probedLineage = probe.lineage;

    const outcome = await tx(async (q) => {
      await acquireCaseMutationLocks(q, probedLineage);
      const orderedIds = orderedCaseMutationIds(probedLineage);
      const lockedCases = await q<{ id: string }>(
        'SELECT id FROM case_ WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
        [orderedIds],
      );
      if (lockedCases.length !== orderedIds.length) return { kind: 'stale' as const };

      const lockedOwner = await inboundOwner(q, inboundEmailId, true);
      if (!lockedOwner) return { kind: 'stale' as const };
      const lockedLineage = await verifiedMergeLineage(q, requestedCaseId, lockedOwner);
      if (!lockedLineage) return { kind: 'stale' as const };

      const held = new Set(orderedIds);
      if (lockedLineage.some((id) => !held.has(id.trim().toLowerCase()))) {
        return { kind: 'retry' as const };
      }

      return {
        kind: 'resolved' as const,
        targetCaseId: lockedOwner,
        value: await work(q, lockedOwner),
      };
    });

    if (outcome.kind === 'retry') continue;
    return outcome;
  }

  // Do not turn sustained merge churn into a benign stale acknowledgement: a
  // 500 makes the queue retry, preserving the evidence until ownership settles.
  throw new Error('evidence backfill target kept changing while locks were acquired');
}

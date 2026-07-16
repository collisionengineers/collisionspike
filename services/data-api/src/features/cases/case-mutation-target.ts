/**
 * Resolve a case's durable mergedInto lineage and run work while every case in
 * that lineage is held in the repository-wide mutation-lock order.
 *
 * The optimistic walk discovers the complete lock set. The transaction then
 * takes all advisory locks, locks the physical case rows in lexical order, and
 * repeats the walk. A merge committed between the two phases causes a bounded
 * retry; work never runs with an unheld survivor.
 */
import { query, tx, type TxQuery } from '../../platform/db/client.js';
import { mergedIntoFrom } from '../../shared/mapping/index.js';
import {
  acquireCaseMutationLocks,
  orderedCaseMutationIds,
} from './mutation-locks.js';

const MAX_MERGE_LINEAGE_HOPS = 16;
const MAX_LOCK_RETRIES = 4;
const CASE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ResolvedCaseMutationTarget {
  caseId: string;
  statusCode: number;
  lineage: string[];
}

type CaseMutationTargetProbe =
  | { kind: 'resolved'; target: ResolvedCaseMutationTarget }
  | { kind: 'unresolved'; reason: 'missing' | 'invalid_lineage' | 'cycle_or_too_deep' };

export type CaseMutationTargetResult<T> =
  | { kind: 'resolved'; targetCaseId: string; value: T }
  | { kind: 'unresolved'; reason: 'missing' | 'invalid_lineage' | 'cycle_or_too_deep' | 'changing' };

async function probeCaseMutationTarget(
  q: TxQuery | typeof query,
  requestedCaseId: string,
): Promise<CaseMutationTargetProbe> {
  const lineage: string[] = [];
  const seen = new Set<string>();
  let cursor = requestedCaseId;

  for (let hop = 0; hop <= MAX_MERGE_LINEAGE_HOPS; hop++) {
    const caseId = cursor.trim().toLowerCase();
    if (!caseId || !CASE_ID_RE.test(caseId)) {
      return { kind: 'unresolved', reason: 'invalid_lineage' };
    }
    if (seen.has(caseId)) {
      return { kind: 'unresolved', reason: 'cycle_or_too_deep' };
    }
    seen.add(caseId);
    const rows = await q<{ id: string; duplicate_keys: unknown; status_code: number }>(
      'SELECT id, duplicate_keys, status_code FROM case_ WHERE id = $1',
      [caseId],
    );
    const row = rows[0];
    if (!row) return { kind: 'unresolved', reason: 'missing' };
    const canonical = row.id.trim().toLowerCase();
    lineage.push(canonical);
    const mergedInto = mergedIntoFrom(row.duplicate_keys)?.trim().toLowerCase();
    if (!mergedInto) {
      return {
        kind: 'resolved',
        target: { caseId: canonical, statusCode: Number(row.status_code), lineage },
      };
    }
    cursor = mergedInto;
  }

  return { kind: 'unresolved', reason: 'cycle_or_too_deep' };
}

function sameLineage(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export async function withResolvedCaseMutationTarget<T>(
  requestedCaseId: string,
  work: (q: TxQuery, target: ResolvedCaseMutationTarget) => Promise<T>,
): Promise<CaseMutationTargetResult<T>> {
  for (let attempt = 0; attempt < MAX_LOCK_RETRIES; attempt++) {
    const probe = await probeCaseMutationTarget(query, requestedCaseId);
    if (probe.kind === 'unresolved') return probe;

    const outcome = await tx(async (q) => {
      await acquireCaseMutationLocks(q, probe.target.lineage);
      const orderedIds = orderedCaseMutationIds(probe.target.lineage);
      const locked = await q<{ id: string }>(
        'SELECT id FROM case_ WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
        [orderedIds],
      );
      if (locked.length !== orderedIds.length) {
        return { kind: 'unresolved' as const, reason: 'missing' as const };
      }

      const checked = await probeCaseMutationTarget(q, requestedCaseId);
      if (checked.kind === 'unresolved') return checked;
      if (!sameLineage(checked.target.lineage, probe.target.lineage)) {
        return { kind: 'retry' as const };
      }

      return {
        kind: 'resolved' as const,
        targetCaseId: checked.target.caseId,
        value: await work(q, checked.target),
      };
    });

    if (outcome.kind === 'retry') continue;
    return outcome;
  }

  return { kind: 'unresolved', reason: 'changing' };
}

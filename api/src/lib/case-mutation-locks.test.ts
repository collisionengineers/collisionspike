import { describe, expect, it } from 'vitest';
import {
  acquireCaseMutationLocks,
  deriveCaseMutationLockKeys,
  lockCaseForMutation,
  orderedCaseMutationIds,
} from './case-mutation-locks.js';
import type { TxQuery } from './db.js';

describe('case mutation lock ordering', () => {
  it('normalises, deduplicates and sorts case ids', () => {
    expect(orderedCaseMutationIds([' Case-B ', 'case-a', 'CASE-B', '', 'case-c'])).toEqual([
      'case-a',
      'case-b',
      'case-c',
    ]);
  });

  it('derives the same namespaced order for reverse concurrent merges', () => {
    expect(deriveCaseMutationLockKeys(['case-b', 'case-a'])).toEqual([
      'case-merge-backfill:case-a',
      'case-merge-backfill:case-b',
    ]);
    expect(deriveCaseMutationLockKeys(['case-a', 'case-b'])).toEqual(
      deriveCaseMutationLockKeys(['case-b', 'case-a']),
    );
  });

  it('acquires every advisory lock in the derived order', async () => {
    const calls: Array<[string, unknown[]?]> = [];
    const q: TxQuery = async (sql, params) => {
      calls.push([sql, params]);
      return [];
    };
    await acquireCaseMutationLocks(q, ['case-z', 'case-a']);
    expect(calls.map(([, params]) => params?.[0])).toEqual([
      'case-merge-backfill:case-a',
      'case-merge-backfill:case-z',
    ]);
  });

  it('locks the advisory key before the case row and exposes a retired target', async () => {
    const calls: string[] = [];
    const q: TxQuery = async (sql) => {
      calls.push(sql);
      if (sql.includes('FROM case_')) {
        return [{ id: 'CASE-A', duplicate_keys: { mergedInto: 'CASE-B' } }] as never;
      }
      return [];
    };

    await expect(lockCaseForMutation(q, ' CASE-A ')).resolves.toEqual({
      kind: 'retired',
      caseId: 'case-a',
      mergedInto: 'case-b',
    });
    expect(calls[0]).toContain('pg_advisory_xact_lock');
    expect(calls[1]).toContain('FOR UPDATE');
  });

  it('returns active only after the case row is locked', async () => {
    const q: TxQuery = async (sql) =>
      (sql.includes('FROM case_') ? [{ id: 'case-a', duplicate_keys: null }] : []) as never;
    await expect(lockCaseForMutation(q, 'case-a')).resolves.toEqual({
      kind: 'active',
      caseId: 'case-a',
    });
  });
});

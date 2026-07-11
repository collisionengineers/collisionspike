import { describe, expect, it } from 'vitest';
import {
  acquireCaseMutationLocks,
  deriveCaseMutationLockKeys,
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
});

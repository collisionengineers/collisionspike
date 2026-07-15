import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  query: vi.fn(),
  tx: vi.fn(),
  txQuery: vi.fn(),
}));
vi.mock('./db.js', () => ({
  query: db.query,
  tx: db.tx,
}));

const locks = vi.hoisted(() => ({
  acquire: vi.fn(async () => {}),
}));
vi.mock('./case-mutation-locks.js', () => ({
  acquireCaseMutationLocks: locks.acquire,
  orderedCaseMutationIds: (ids: string[]) =>
    [...new Set(ids.map((id) => id.trim().toLowerCase()))].sort(),
}));

const { withResolvedEvidenceBackfillTarget } = await import('./evidence-backfill-target.js');

beforeEach(() => {
  db.query.mockReset();
  db.tx.mockReset();
  db.txQuery.mockReset();
  locks.acquire.mockClear();
  db.tx.mockImplementation(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => fn(db.txQuery));
});

describe('withResolvedEvidenceBackfillTarget stable optimistic probe', () => {
  it('retries a mixed READ COMMITTED probe when a merge commits between owner and lineage reads', async () => {
    let ownerRead = 0;
    const caseRow = (id: string) => [{
      id,
      duplicate_keys: id === 'case-old' ? { mergedInto: 'case-new' } : null,
    }];
    db.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (/FROM inbound_email/i.test(sql)) {
        ownerRead++;
        // Probe 1 straddles the commit: owner-before is old, owner-after is new.
        // Probe 2 is stable on the survivor.
        return [{ case_id: ownerRead === 1 ? 'case-old' : 'case-new' }];
      }
      if (/SELECT id, duplicate_keys FROM case_/i.test(sql)) {
        return caseRow(String(params?.[0]));
      }
      throw new Error(`unexpected optimistic SQL: ${sql}`);
    });
    db.txQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (/id = ANY/i.test(sql)) {
        return ((params?.[0] as string[]) ?? []).map((id) => ({ id }));
      }
      if (/FROM inbound_email/i.test(sql) && /FOR UPDATE/i.test(sql)) {
        return [{ case_id: 'case-new' }];
      }
      if (/SELECT id, duplicate_keys FROM case_/i.test(sql)) {
        return caseRow(String(params?.[0]));
      }
      throw new Error(`unexpected locked SQL: ${sql}`);
    });
    const work = vi.fn(async () => 'persisted');

    const result = await withResolvedEvidenceBackfillTarget('ie-1', 'case-old', work);

    expect(result).toEqual({ kind: 'resolved', targetCaseId: 'case-new', value: 'persisted' });
    expect(ownerRead).toBe(4); // before/after for the inconsistent probe + stable retry
    expect(db.tx).toHaveBeenCalledTimes(1); // no lock phase for the mixed probe
    expect(work).toHaveBeenCalledWith(db.txQuery, 'case-new');
  });

  it('returns stale only after owner and lineage form a stable unrelated mismatch', async () => {
    db.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (/FROM inbound_email/i.test(sql)) return [{ case_id: 'case-unrelated' }];
      if (/SELECT id, duplicate_keys FROM case_/i.test(sql)) {
        return [{ id: String(params?.[0]), duplicate_keys: null }];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    });

    await expect(
      withResolvedEvidenceBackfillTarget('ie-1', 'case-old', vi.fn()),
    ).resolves.toEqual({ kind: 'stale' });
    expect(db.query.mock.calls.filter(([sql]) => /FROM inbound_email/i.test(String(sql))))
      .toHaveLength(2);
    expect(db.tx).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn(), txQuery: vi.fn() }));
vi.mock('./db.js', () => ({ query: db.query, tx: db.tx }));

const locks = vi.hoisted(() => ({ acquire: vi.fn(async () => {}) }));
vi.mock('./case-mutation-locks.js', () => ({
  acquireCaseMutationLocks: locks.acquire,
  orderedCaseMutationIds: (ids: string[]) => [...new Set(ids)].sort(),
}));

const { withResolvedCaseMutationTarget } = await import('./case-mutation-target.js');

const OLD = '11111111-1111-4111-8111-111111111111';
const MIDDLE = '22222222-2222-4222-8222-222222222222';
const SURVIVOR = '33333333-3333-4333-8333-333333333333';

function row(id: string): Record<string, unknown> {
  return {
    id,
    duplicate_keys: id === OLD
      ? { mergedInto: MIDDLE }
      : id === MIDDLE
        ? { mergedInto: SURVIVOR }
        : null,
    status_code: id === SURVIVOR ? 100000004 : 100000008,
  };
}

beforeEach(() => {
  db.query.mockReset();
  db.tx.mockReset();
  db.txQuery.mockReset();
  locks.acquire.mockClear();
  db.tx.mockImplementation(async (work: (q: typeof db.txQuery) => Promise<unknown>) => work(db.txQuery));
});

describe('merged case mutation target', () => {
  it('locks the full lineage globally before running work on the active survivor', async () => {
    db.query.mockImplementation(async (_sql: string, params?: unknown[]) => [row(String(params?.[0]))]);
    db.txQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('id = ANY')) return ((params?.[0] as string[]) ?? []).map((id) => ({ id }));
      if (sql.includes('duplicate_keys')) return [row(String(params?.[0]))];
      return [];
    });
    const work = vi.fn(async () => 'done');

    await expect(withResolvedCaseMutationTarget(OLD, work)).resolves.toEqual({
      kind: 'resolved',
      targetCaseId: SURVIVOR,
      value: 'done',
    });
    expect(locks.acquire).toHaveBeenCalledWith(db.txQuery, [OLD, MIDDLE, SURVIVOR]);
    expect(work).toHaveBeenCalledWith(db.txQuery, {
      caseId: SURVIVOR,
      statusCode: 100000004,
      lineage: [OLD, MIDDLE, SURVIVOR],
    });
  });

  it('retries when the lineage grows between probe and locked recheck', async () => {
    let transaction = 0;
    db.query.mockImplementation(async (_sql: string, params?: unknown[]) => {
      const id = String(params?.[0]);
      if (transaction === 0 && id === OLD) {
        return [{ id: OLD, duplicate_keys: null, status_code: 100000004 }];
      }
      return [row(id)];
    });
    db.tx.mockImplementation(async (work: (q: typeof db.txQuery) => Promise<unknown>) => {
      transaction++;
      return work(db.txQuery);
    });
    db.txQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('id = ANY')) return ((params?.[0] as string[]) ?? []).map((id) => ({ id }));
      if (sql.includes('duplicate_keys')) return [row(String(params?.[0]))];
      return [];
    });

    const result = await withResolvedCaseMutationTarget(OLD, vi.fn(async () => 'done'));

    expect(result).toMatchObject({ kind: 'resolved', targetCaseId: SURVIVOR });
    expect(db.tx).toHaveBeenCalledTimes(2);
  });

  it('fails closed before uuid-array locking for malformed or cyclic lineage', async () => {
    db.query.mockResolvedValueOnce([{
      id: OLD,
      duplicate_keys: { mergedInto: 'not-a-case-id' },
      status_code: 100000008,
    }]);
    await expect(withResolvedCaseMutationTarget(OLD, vi.fn())).resolves.toEqual({
      kind: 'unresolved',
      reason: 'invalid_lineage',
    });
    expect(db.tx).not.toHaveBeenCalled();

    db.query.mockImplementation(async (_sql: string, params?: unknown[]) => {
      const id = String(params?.[0]);
      return [{
        id,
        duplicate_keys: { mergedInto: id === OLD ? MIDDLE : OLD },
        status_code: 100000008,
      }];
    });
    await expect(withResolvedCaseMutationTarget(OLD, vi.fn())).resolves.toEqual({
      kind: 'unresolved',
      reason: 'cycle_or_too_deep',
    });
    expect(db.tx).not.toHaveBeenCalled();
  });
});

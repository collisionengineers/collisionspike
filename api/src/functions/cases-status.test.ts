/**
 * Transactional status-recompute proof: the staff-facing seam locks and re-reads
 * the case before evaluating, so a terminal/final merge transition that wins the
 * row cannot be overwritten by an older application snapshot.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { statusToInt } from '@cs/domain/codecs';

vi.mock('@azure/functions', () => ({ app: { http: vi.fn() } }));
vi.mock('../lib/auth.js', () => ({
  withRole: (_role: string, handler: Function) => handler,
}));
vi.mock('./internal.js', () => ({ isUniqueViolation: () => false }));
vi.mock('../lib/inspection-prefill.js', () => ({
  isPrefillApplicable: () => false,
  prefillImageBasedInspection: vi.fn(async () => false),
}));
const chase = vi.hoisted(() => vi.fn(async () => false));
vi.mock('../lib/overview-chase.js', () => ({ maybeSuggestOverviewChase: chase }));
vi.mock('../lib/functions-client.js', () => ({ listBoxFolderNames: vi.fn(async () => []) }));

type Rec = Record<string, unknown>;
const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn(), txQuery: vi.fn() }));
vi.mock('../lib/db.js', () => ({
  query: db.query,
  tx: db.tx,
  getPool: () => {
    throw new Error('no pool in tests');
  },
}));

const { markEvaSubmittedIfReady, recomputeStatus } = await import('./cases.js');

const poolSql: string[] = [];
const txSql: string[] = [];
const txParams: unknown[][] = [];
let probeRow: Rec;
let lockedRow: Rec;

function caseRow(status: Parameters<typeof statusToInt>[0], duplicateKeys: unknown = null): Rec {
  return {
    id: 'case-1',
    status_code: statusToInt(status),
    duplicate_keys: duplicateKeys,
    vrm: 'AB12CDE',
    provider_display: '',
    provider_code: '',
    work_provider_id: null,
    on_hold: false,
  };
}

beforeEach(() => {
  poolSql.length = 0;
  txSql.length = 0;
  txParams.length = 0;
  chase.mockClear();
  probeRow = caseRow('ingested');
  lockedRow = caseRow('ingested');

  db.query.mockReset();
  db.tx.mockReset();
  db.txQuery.mockReset();
  db.query.mockImplementation(async (sql: string) => {
    poolSql.push(sql);
    if (/FROM case_ c/i.test(sql)) return [probeRow];
    return [];
  });
  db.txQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    txSql.push(sql);
    txParams.push(params);
    if (/FROM case_ c/i.test(sql) && /FOR UPDATE OF c/i.test(sql)) return [lockedRow];
    if (/UPDATE case_ SET status_code/i.test(sql)) {
      lockedRow.status_code = params[1];
      return [];
    }
    return [];
  });
  db.tx.mockImplementation(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => fn(db.txQuery));
});

describe('recomputeStatus case-row serialization', () => {
  it('locks and re-reads before updating, with the status write and audit in the same transaction', async () => {
    await recomputeStatus('case-1', 'staff-1');

    const locked = txSql.findIndex((sql) => /FROM case_ c/i.test(sql) && /FOR UPDATE OF c/i.test(sql));
    const provenanceRead = txSql.findIndex((sql) => /FROM field_level_provenance/i.test(sql));
    const evidenceRead = txSql.findIndex((sql) => /FROM evidence/i.test(sql));
    const statusWrite = txSql.findIndex((sql) => /UPDATE case_ SET status_code/i.test(sql));
    expect(locked).toBeGreaterThanOrEqual(0);
    expect(locked).toBeLessThan(provenanceRead);
    expect(provenanceRead).toBeLessThan(evidenceRead);
    expect(evidenceRead).toBeLessThan(statusWrite);
    expect(txParams[statusWrite]).toEqual(['case-1', statusToInt('needs_review')]);
    expect(txSql.some((sql) => /INSERT INTO audit_event/i.test(sql))).toBe(true);
    expect(poolSql.some((sql) => /UPDATE case_ SET status_code|INSERT INTO audit_event/i.test(sql))).toBe(false);
    expect(chase).toHaveBeenCalledWith('case-1', 'needs_review', 'staff-1');
  });

  it('does not demote a terminal state that commits after the prefill probe but before the lock', async () => {
    db.tx.mockImplementationOnce(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => {
      lockedRow = caseRow('done');
      return fn(db.txQuery);
    });

    await recomputeStatus('case-1', 'staff-1');

    expect(txSql.some((sql) => /UPDATE case_ SET status_code/i.test(sql))).toBe(false);
    expect(chase).toHaveBeenCalledWith('case-1', 'done', 'staff-1');
  });

  it('does not un-retire a case merged after the prefill probe but before the lock', async () => {
    db.tx.mockImplementationOnce(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => {
      lockedRow = caseRow('linked_to_instruction', { mergedInto: 'case-survivor' });
      return fn(db.txQuery);
    });

    await recomputeStatus('case-1');

    expect(txSql.some((sql) => /UPDATE case_ SET status_code/i.test(sql))).toBe(false);
    expect(chase).toHaveBeenCalledWith('case-1', 'linked_to_instruction', undefined);
  });
});

describe('EVA submission canonical re-check', () => {
  it('rejects a stale ready_for_eva row whose current contract is incomplete', async () => {
    lockedRow = caseRow('ready_for_eva');

    await expect(markEvaSubmittedIfReady('case-1', 'staff-1')).resolves.toBe(false);

    expect(txSql[0]).toMatch(/FOR UPDATE OF c/i);
    expect(txSql.some((sql) => /submitted_at = now\(\)/i.test(sql))).toBe(false);
    expect(lockedRow.status_code).toBe(statusToInt('ready_for_eva'));
  });
});

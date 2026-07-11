/**
 * Atomic merge protocol tests. The DB is a deterministic journal: assertions pin
 * advisory/case/inbound lock order and prove every core mutation uses one tx query.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { statusToInt } from '@cs/domain/codecs';

interface Registration {
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;
}

const registrations = vi.hoisted(() => new Map<string, Registration>());
vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, opts: Registration) => registrations.set(name, opts),
  },
}));

vi.mock('../lib/auth.js', () => ({
  withRole: (_role: string, handler: Function) =>
    (req: HttpRequest, ctx: InvocationContext) => handler(req, ctx, { sub: 'staff-1' }),
}));
vi.mock('./internal.js', () => ({ isUniqueViolation: () => false }));
vi.mock('../lib/inspection-prefill.js', () => ({
  isPrefillApplicable: () => false,
  prefillImageBasedInspection: vi.fn(async () => false),
}));
vi.mock('../lib/overview-chase.js', () => ({ maybeSuggestOverviewChase: vi.fn(async () => false) }));
vi.mock('../lib/functions-client.js', () => ({ listBoxFolderNames: vi.fn(async () => []) }));

type Rec = Record<string, unknown>;
const db = vi.hoisted(() => ({
  query: vi.fn(),
  tx: vi.fn(),
  txQuery: vi.fn(),
}));
vi.mock('../lib/db.js', () => ({
  query: db.query,
  tx: db.tx,
  getPool: () => {
    throw new Error('no pool in tests');
  },
}));

await import('./cases.js');

const merge = registrations.get('mergeCases')!.handler;
const txSql: string[] = [];
const txParams: unknown[][] = [];
const poolSql: string[] = [];
const cases = new Map<string, Rec>();

function caseRow(id: string, overrides: Rec = {}): Rec {
  return {
    id,
    status_code: statusToInt('ingested'),
    duplicate_keys: null,
    provider_display: '',
    work_provider_id: 'wp-shared',
    ...overrides,
  };
}

function request(targetCaseId: string, sourceCaseId: string): HttpRequest {
  return {
    params: { tgt: targetCaseId },
    json: async () => ({ sourceCaseId }),
  } as unknown as HttpRequest;
}

const ctx = { error: vi.fn() } as unknown as InvocationContext;

beforeEach(() => {
  txSql.length = 0;
  txParams.length = 0;
  poolSql.length = 0;
  cases.clear();
  cases.set('case-a', caseRow('case-a'));
  cases.set('case-b', caseRow('case-b'));

  db.query.mockReset();
  db.tx.mockReset();
  db.txQuery.mockReset();
  db.query.mockImplementation(async (sql: string) => {
    poolSql.push(sql);
    // Audit remains best-effort after the atomic core transaction. Returning no
    // case makes recompute a clean no-op while proving it was invoked post-commit.
    return [];
  });
  db.txQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    txSql.push(sql);
    txParams.push(params);
    if (/SELECT id FROM case_ WHERE id = ANY/i.test(sql) && /FOR UPDATE/i.test(sql)) {
      return ((params[0] as string[]) ?? []).filter((id) => cases.has(id)).map((id) => ({ id }));
    }
    if (/FROM case_ c/i.test(sql) && /WHERE c.id = \$1/i.test(sql)) {
      const row = cases.get(params[0] as string);
      return row ? [row] : [];
    }
    if (/SELECT id FROM inbound_email/i.test(sql) && /FOR UPDATE/i.test(sql)) return [{ id: 'ie-1' }];
    if (/UPDATE evidence SET case_id/i.test(sql)) return [{ id: 'ev-1' }];
    if (/UPDATE inbound_email SET case_id/i.test(sql)) return [{ id: 'ie-1' }];
    if (/SELECT id, work_provider_id FROM case_/i.test(sql)) {
      return ((params[0] as string[]) ?? []).map((id) => ({
        id,
        work_provider_id: cases.get(id)?.work_provider_id ?? null,
      }));
    }
    if (/SELECT display_name FROM work_provider/i.test(sql)) return [{ display_name: 'Provider One' }];
    if (/UPDATE case_ SET work_provider_id/i.test(sql)) {
      const target = cases.get(params[0] as string);
      if (target) target.work_provider_id = params[1];
      return [];
    }
    if (/UPDATE case_ SET eva_work_provider/i.test(sql)) return [];
    if (/SET status_code = \$2, duplicate_keys = \$3/i.test(sql)) {
      const source = cases.get(params[0] as string);
      if (source) {
        source.status_code = params[1];
        source.duplicate_keys = JSON.parse(params[2] as string);
      }
      return [];
    }
    return [];
  });
  db.tx.mockImplementation(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => fn(db.txQuery));
});

describe('mergeCases atomic lock protocol', () => {
  it('backfill-first-compatible order: advisory locks, case rows, inbound rows, then all writes in one tx', async () => {
    const res = await merge(request('case-b', 'case-a'), ctx);
    expect(res.status).toBe(200);
    expect(res.jsonBody).toMatchObject({ targetCaseId: 'case-b', movedEvidence: 1 });
    expect(db.tx).toHaveBeenCalledTimes(1);

    const advisory = txSql.findIndex((s) => /pg_advisory_xact_lock/i.test(s));
    const casesLocked = txSql.findIndex((s) => /FROM case_/i.test(s) && /FOR UPDATE/i.test(s));
    const inboundLocked = txSql.findIndex((s) => /FROM inbound_email/i.test(s) && /FOR UPDATE/i.test(s));
    const evidenceMoved = txSql.findIndex((s) => /UPDATE evidence SET case_id/i.test(s));
    const inboundMoved = txSql.findIndex((s) => /UPDATE inbound_email SET case_id/i.test(s));
    const sourceRetired = txSql.findIndex((s) => /duplicate_keys = \$3/i.test(s));
    expect(advisory).toBeGreaterThanOrEqual(0);
    expect(advisory).toBeLessThan(casesLocked);
    expect(casesLocked).toBeLessThan(inboundLocked);
    expect(inboundLocked).toBeLessThan(evidenceMoved);
    expect(evidenceMoved).toBeLessThan(inboundMoved);
    expect(inboundMoved).toBeLessThan(sourceRetired);
    expect(poolSql.some((s) => /UPDATE evidence|UPDATE inbound_email|duplicate_keys = \$3/i.test(s))).toBe(false);
    expect(txSql.some((s) => /INSERT INTO audit_event/i.test(s))).toBe(true);
    expect(poolSql.some((s) => /INSERT INTO audit_event/i.test(s))).toBe(false);
    expect(poolSql.some((s) => /FROM case_ c/i.test(s))).toBe(true); // post-commit recompute attempted
  });

  it('reverse concurrent merge requests derive one lock order and the loser rejects the retired target', async () => {
    expect((await merge(request('case-b', 'case-a'), ctx)).status).toBe(200);
    const writesAfterFirst = txSql.filter((s) => /UPDATE evidence SET case_id/i.test(s)).length;

    const reverse = await merge(request('case-a', 'case-b'), ctx);
    expect(reverse.status).toBe(409);
    expect(reverse.jsonBody).toEqual({
      error: 'One of these cases has already been merged. Refresh and try again.',
    });
    expect(txSql.filter((s) => /UPDATE evidence SET case_id/i.test(s))).toHaveLength(writesAfterFirst);

    const advisoryKeys = txParams
      .filter((_, i) => /pg_advisory_xact_lock/i.test(txSql[i]))
      .map((p) => p[0]);
    expect(advisoryKeys.slice(0, 2)).toEqual(advisoryKeys.slice(2, 4));
  });

  it('preserves provider carry-over and keeps every provider mutation in the merge transaction', async () => {
    cases.set('case-a', caseRow('case-a', { work_provider_id: 'wp-source' }));
    cases.set('case-b', caseRow('case-b', { work_provider_id: null }));
    const res = await merge(request('case-b', 'case-a'), ctx);
    expect(res.status).toBe(200);
    expect(txSql.some((s) => /UPDATE case_ SET work_provider_id/i.test(s))).toBe(true);
    expect(txSql.some((s) => /UPDATE case_ SET eva_work_provider/i.test(s))).toBe(true);
    expect(txSql.some((s) => /INSERT INTO field_level_provenance/i.test(s))).toBe(true);
    expect(
      poolSql.some((s) => /UPDATE case_ SET (work_provider_id|eva_work_provider)|INSERT INTO field_level_provenance/i.test(s)),
    ).toBe(false);
  });

  it('uses plain user language for a finalised target', async () => {
    cases.set('case-b', caseRow('case-b', { status_code: statusToInt('eva_submitted') }));
    const res = await merge(request('case-b', 'case-a'), ctx);
    expect(res.status).toBe(400);
    expect(res.jsonBody).toEqual({ error: 'Cannot merge into a finalised case.' });
  });
});

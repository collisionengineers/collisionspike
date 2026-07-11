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
const evidenceRows: Rec[] = [];
const CASE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CASE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EV_ONE = '11111111-1111-4111-8111-111111111111';
const EV_TARGET = '22222222-2222-4222-8222-222222222222';
const EV_SOURCE_COPY = '33333333-3333-4333-8333-333333333333';
const EV_SOURCE_UNIQUE = '44444444-4444-4444-8444-444444444444';
const EV_SOURCE_SECOND = '55555555-5555-4555-8555-555555555555';

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

const ctx = { error: vi.fn(), warn: vi.fn() } as unknown as InvocationContext;

beforeEach(() => {
  txSql.length = 0;
  txParams.length = 0;
  poolSql.length = 0;
  cases.clear();
  evidenceRows.length = 0;
  cases.set(CASE_A, caseRow(CASE_A));
  cases.set(CASE_B, caseRow(CASE_B));
  evidenceRows.push({
    id: EV_ONE,
    case_id: CASE_A,
    sha256: null,
    created_at: '2026-07-11T10:00:00Z',
  });

  db.query.mockReset();
  db.tx.mockReset();
  db.txQuery.mockReset();
  (ctx.warn as ReturnType<typeof vi.fn>).mockClear();
  db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    poolSql.push(sql);
    if (/FROM case_ c/i.test(sql) && /WHERE c.id = \$1/i.test(sql)) {
      const row = cases.get(params[0] as string);
      return row ? [row] : [];
    }
    if (/status_recompute_completed_generation = GREATEST/i.test(sql)) {
      return [{
        status_recompute_requested_generation: '1',
        status_recompute_completed_generation: '1',
      }];
    }
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
    if (/SELECT id, case_id, sha256, created_at/i.test(sql) && /FROM evidence/i.test(sql) && /FOR UPDATE/i.test(sql)) {
      const ids = (params[0] as string[]) ?? [];
      return evidenceRows.filter((row) => ids.includes(row.case_id as string));
    }
    if (/UPDATE evidence AS survivor/i.test(sql)) return [];
    if (/UPDATE evidence\s+SET case_id/i.test(sql)) {
      const [sourceId, targetId, excludedIds] = params as [string, string, string[]];
      const moved = evidenceRows.filter(
        (row) => row.case_id === sourceId && !excludedIds.includes(row.id as string),
      );
      for (const row of moved) row.case_id = targetId;
      return moved.map((row) => ({ id: row.id }));
    }
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
    if (/UPDATE case_ SET status_code = \$2/i.test(sql)) {
      const target = cases.get(params[0] as string);
      if (target) target.status_code = params[1];
      return [];
    }
    if (/status_recompute_requested_generation = status_recompute_requested_generation \+ 1/i.test(sql)) {
      return [{ status_recompute_requested_generation: '1' }];
    }
    return [];
  });
  db.tx.mockImplementation(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => fn(db.txQuery));
});

describe('mergeCases atomic lock protocol', () => {
  it('backfill-first-compatible order: advisory locks, case rows, inbound rows, then all writes in one tx', async () => {
    const res = await merge(request(CASE_B, CASE_A), ctx);
    expect(res.status).toBe(200);
    expect(res.jsonBody).toMatchObject({ targetCaseId: CASE_B, movedEvidence: 1 });
    expect(db.tx).toHaveBeenCalledTimes(2); // atomic merge + locked immediate recompute

    const advisory = txSql.findIndex((s) => /pg_advisory_xact_lock/i.test(s));
    const casesLocked = txSql.findIndex((s) => /FROM case_/i.test(s) && /FOR UPDATE/i.test(s));
    const inboundLocked = txSql.findIndex((s) => /FROM inbound_email/i.test(s) && /FOR UPDATE/i.test(s));
    const evidenceMoved = txSql.findIndex((s) => /UPDATE evidence\s+SET case_id/i.test(s));
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
    expect(
      txSql.some((s) =>
        /status_recompute_requested_generation = status_recompute_requested_generation \+ 1/i.test(s),
      ),
    ).toBe(true);
    expect(poolSql.some((s) => /INSERT INTO audit_event/i.test(s))).toBe(false);
    expect(poolSql.some((s) => /FROM case_ c/i.test(s))).toBe(true); // post-commit recompute attempted
    expect(poolSql.some((s) => /status_recompute_completed_generation = GREATEST/i.test(s))).toBe(true);
    expect(ctx.warn).not.toHaveBeenCalled();
  });

  it('reverse concurrent merge requests derive one lock order and the loser rejects the retired target', async () => {
    expect((await merge(request(CASE_B, CASE_A), ctx)).status).toBe(200);
    const writesAfterFirst = txSql.filter((s) => /UPDATE evidence\s+SET case_id/i.test(s)).length;

    const reverse = await merge(request(CASE_A, CASE_B), ctx);
    expect(reverse.status).toBe(409);
    expect(reverse.jsonBody).toEqual({
      error: 'One of these cases has already been merged. Refresh and try again.',
    });
    expect(txSql.filter((s) => /UPDATE evidence\s+SET case_id/i.test(s))).toHaveLength(writesAfterFirst);

    const advisoryKeys = txParams
      .filter((_, i) => /pg_advisory_xact_lock/i.test(txSql[i]))
      .map((p) => p[0]);
    expect(advisoryKeys.slice(0, 2)).toEqual(advisoryKeys.slice(2, 4));
  });

  it('preserves provider carry-over and keeps every provider mutation in the merge transaction', async () => {
    cases.set(CASE_A, caseRow(CASE_A, { work_provider_id: 'wp-source' }));
    cases.set(CASE_B, caseRow(CASE_B, { work_provider_id: null }));
    const res = await merge(request(CASE_B, CASE_A), ctx);
    expect(res.status).toBe(200);
    expect(txSql.some((s) => /UPDATE case_ SET work_provider_id/i.test(s))).toBe(true);
    expect(txSql.some((s) => /UPDATE case_ SET eva_work_provider/i.test(s))).toBe(true);
    expect(txSql.some((s) => /INSERT INTO field_level_provenance/i.test(s))).toBe(true);
    expect(
      poolSql.some((s) => /UPDATE case_ SET (work_provider_id|eva_work_provider)|INSERT INTO field_level_provenance/i.test(s)),
    ).toBe(false);
  });

  it('uses plain user language for a finalised target', async () => {
    cases.set(CASE_B, caseRow(CASE_B, { status_code: statusToInt('eva_submitted') }));
    const res = await merge(request(CASE_B, CASE_A), ctx);
    expect(res.status).toBe(400);
    expect(res.jsonBody).toEqual({ error: 'Cannot merge into a finalised case.' });
  });

  it('canonicalises UUID text before self-checks and provider carry-over', async () => {
    cases.set(CASE_A, caseRow(CASE_A, { work_provider_id: 'wp-source' }));
    cases.set(CASE_B, caseRow(CASE_B, { work_provider_id: null }));

    const res = await merge(request(CASE_B.toUpperCase(), CASE_A.toUpperCase()), ctx);
    expect(res.status).toBe(200);
    expect(res.jsonBody).toMatchObject({ targetCaseId: CASE_B });
    expect(txParams.some((p) => p[0] === CASE_B && p[1] === 'wp-source')).toBe(true);

    db.tx.mockClear();
    const self = await merge(request(CASE_A.toUpperCase(), CASE_A), ctx);
    expect(self.status).toBe(400);
    expect(db.tx).not.toHaveBeenCalled();
  });

  it('rejects malformed case identifiers before opening a transaction', async () => {
    const res = await merge(request(CASE_B, 'not-a-uuid'), ctx);
    expect(res.status).toBe(400);
    expect(res.jsonBody).toEqual({ error: 'Case identifiers are invalid.' });
    expect(db.tx).not.toHaveBeenCalled();
  });

  it('absorbs target SHA collisions and moves only non-colliding source evidence', async () => {
    const sha = 'a'.repeat(64);
    evidenceRows.length = 0;
    evidenceRows.push(
      { id: EV_TARGET, case_id: CASE_B, sha256: sha.toUpperCase(), created_at: '2026-07-01' },
      { id: EV_SOURCE_COPY, case_id: CASE_A, sha256: sha, created_at: '2026-07-02' },
      { id: EV_SOURCE_UNIQUE, case_id: CASE_A, sha256: 'b'.repeat(64), created_at: '2026-07-03' },
    );

    const res = await merge(request(CASE_B, CASE_A), ctx);
    expect(res.status).toBe(200);
    expect(res.jsonBody).toMatchObject({ targetCaseId: CASE_B, movedEvidence: 1 });

    const absorb = txSql.findIndex((s) => /UPDATE evidence AS survivor/i.test(s));
    expect(absorb).toBeGreaterThanOrEqual(0);
    expect(txParams[absorb]).toEqual([EV_TARGET, EV_SOURCE_COPY]);
    expect(txSql[absorb]).toContain('storage_path = COALESCE');
    expect(txSql[absorb]).toContain('image_role_source IS NULL');
    expect(txSql[absorb]).toContain('exclusion_decision_source IS NULL');

    const move = txSql.findIndex((s) => /UPDATE evidence\s+SET case_id/i.test(s));
    expect(txParams[move]).toEqual([CASE_A, CASE_B, [EV_SOURCE_COPY]]);
    expect(evidenceRows.find((row) => row.id === EV_SOURCE_COPY)?.case_id).toBe(CASE_A);
    expect(evidenceRows.find((row) => row.id === EV_SOURCE_UNIQUE)?.case_id).toBe(CASE_B);
  });

  it('moves one deterministic source SHA survivor and leaves later source twins retired', async () => {
    const sha = 'c'.repeat(64);
    evidenceRows.length = 0;
    evidenceRows.push(
      { id: EV_SOURCE_COPY, case_id: CASE_A, sha256: sha, created_at: '2026-07-01' },
      { id: EV_SOURCE_SECOND, case_id: CASE_A, sha256: sha.toUpperCase(), created_at: '2026-07-02' },
      { id: EV_SOURCE_UNIQUE, case_id: CASE_A, sha256: 'd'.repeat(64), created_at: '2026-07-03' },
    );

    const res = await merge(request(CASE_B, CASE_A), ctx);
    expect(res.status).toBe(200);
    expect(res.jsonBody).toMatchObject({ targetCaseId: CASE_B, movedEvidence: 2 });

    const absorb = txSql.findIndex((s) => /UPDATE evidence AS survivor/i.test(s));
    expect(txParams[absorb]).toEqual([EV_SOURCE_COPY, EV_SOURCE_SECOND]);
    const move = txSql.findIndex((s) => /UPDATE evidence\s+SET case_id/i.test(s));
    expect(txParams[move]).toEqual([CASE_A, CASE_B, [EV_SOURCE_SECOND]]);
    expect(evidenceRows.find((row) => row.id === EV_SOURCE_COPY)?.case_id).toBe(CASE_B);
    expect(evidenceRows.find((row) => row.id === EV_SOURCE_SECOND)?.case_id).toBe(CASE_A);
  });

  it('returns merge success when the immediate status fast path fails', async () => {
    db.query.mockRejectedValueOnce(new Error('status read unavailable'));
    const res = await merge(request(CASE_B, CASE_A), ctx);

    expect(res.status).toBe(200);
    expect(res.jsonBody).toMatchObject({ targetCaseId: CASE_B, movedEvidence: 1 });
    expect(ctx.warn).toHaveBeenCalledWith(expect.stringContaining('readiness recompute remains pending'));
    expect(
      txSql.some((s) =>
        /status_recompute_requested_generation = status_recompute_requested_generation \+ 1/i.test(s),
      ),
    ).toBe(true);
  });
});

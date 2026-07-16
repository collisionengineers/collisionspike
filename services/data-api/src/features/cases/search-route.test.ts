import { describe, it, expect, beforeEach, vi } from 'vitest';

const sqls: string[] = [];
const params: unknown[][] = [];
const rowsFor = vi.fn<(sql: string, p?: unknown[]) => Record<string, unknown>[]>(() => []);

vi.mock('../../platform/db/client.js', () => ({
  query: vi.fn(async (sql: string, p?: unknown[]) => {
    sqls.push(sql);
    params.push(p ?? []);
    return rowsFor(sql, p);
  }),
  getPool: vi.fn(),
  tx: vi.fn(),
}));

const { runSearch } = await import('./search-route.js');

beforeEach(() => {
  sqls.length = 0;
  params.length = 0;
  rowsFor.mockReset();
  rowsFor.mockReturnValue([]);
});

describe('runSearch (TKT-072)', () => {
  it('short queries short-circuit without touching the DB', async () => {
    const res = await runSearch('a');
    expect(res.tooShort).toBe(true);
    expect(res.cases).toEqual([]);
    expect(sqls.length).toBe(0);
  });

  it('issues SELECT-only SQL for all three arms', async () => {
    await runSearch('smith');
    expect(sqls.length).toBe(3);
    for (const sql of sqls) {
      expect(sql).toMatch(/^\s*SELECT/i);
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i);
    }
  });

  it('matches VRM/Case-PO space-insensitively with a canonical predicate + param', async () => {
    await runSearch('YT13 UTV');
    const caseSql = sqls.find((s) => /FROM case_/i.test(s))!;
    expect(caseSql).toContain("regexp_replace(upper(c.vrm), '[^A-Z0-9]', '', 'g')");
    expect(caseSql).toContain("regexp_replace(upper(c.case_po), '[^A-Z0-9]', '', 'g')");
    const caseParams = params.find((_p, i) => /FROM case_/i.test(sqls[i]))!;
    expect(caseParams).toContain('%YT13UTV%');
  });

  it('a claimant-name query (no VRM shape) omits the canonical predicate', async () => {
    await runSearch('John Smith');
    const caseSql = sqls.find((s) => /FROM case_/i.test(s))!;
    // canonicalizeVrm('John Smith') = 'JOHNSMITH' (len>=2) — so it DOES add the canonical arm,
    // but it can never spuriously match a case_po/vrm, and the ILIKE claimant arm carries the hit.
    expect(caseSql).toMatch(/eva_claimant_name ILIKE/i);
  });

  it('caps each group and flags truncation (LIMIT cap+1 probe)', async () => {
    // 26 case rows (> CASE_CAP 25) → truncated.cases true, 25 returned.
    rowsFor.mockImplementation((sql: string) =>
      /FROM case_/i.test(sql)
        ? Array.from({ length: 26 }, (_v, i) => ({ id: `c${i}`, vrm: 'YT13UTV', status_code: 100000005 }))
        : [],
    );
    const res = await runSearch('YT13UTV');
    expect(res.cases).toHaveLength(25);
    expect(res.truncated.cases).toBe(true);
  });

  it('projects handler-facing queue labels + canonical vrm on case hits', async () => {
    rowsFor.mockImplementation((sql: string) =>
      /FROM case_/i.test(sql)
        ? [{ id: 'c1', case_po: 'CCPY26050', vrm: 'YT13 UTV', status_code: 100000005, on_hold: true }]
        : [],
    );
    const res = await runSearch('CCPY26050');
    expect(res.cases[0].queue).toBe('Held'); // on_hold wins
    expect(res.cases[0].vrmCanonical).toBe('YT13UTV');
  });

  it('case hits carry createdAt (ISO) so the SPA can render a plain age; absent → null', async () => {
    rowsFor.mockImplementation((sql: string) =>
      /FROM case_/i.test(sql)
        ? [
            {
              id: 'c1',
              case_po: 'CCPY26050',
              vrm: 'YT13UTV',
              status_code: 100000005,
              created_at: '2026-06-27T10:43:00.000Z',
            },
            { id: 'c2', vrm: 'YT13UTV', status_code: 100000005 }, // no created_at → null, no throw
          ]
        : [],
    );
    const res = await runSearch('YT13UTV');
    expect(res.cases[0].createdAt).toBe('2026-06-27T10:43:00.000Z');
    expect(res.cases[1].createdAt).toBeNull();
    const caseSql = sqls.find((s) => /FROM case_/i.test(s))!;
    expect(caseSql).toContain('c.created_at');
  });

  it('honest-empty on no match (never throws)', async () => {
    const res = await runSearch('zzzznomatch');
    expect(res.cases).toEqual([]);
    expect(res.emails).toEqual([]);
    expect(res.providers).toEqual([]);
    expect(res.tooShort).toBe(false);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Capture every SQL the tools issue; return canned rows per statement.
const sqls: string[] = [];
const rowsFor = vi.fn<(sql: string, params?: unknown[]) => Record<string, unknown>[]>(() => []);

vi.mock('../lib/db.js', () => ({
  query: vi.fn(async (sql: string, params?: unknown[]) => {
    sqls.push(sql);
    return rowsFor(sql, params);
  }),
  getPool: vi.fn(),
  tx: vi.fn(),
}));

// Import AFTER the mock is registered.
const { execTool, toolsForRequest } = await import('./assistant.js');

const READ_TOOLS = [
  ['lookup_case', { query: 'YT13 UTV' }],
  ['count_cases_by_status', {}],
  ['search_inbound', { query: 'instruction' }],
  ['get_case_detail', { case: 'CCPY26050' }],
  ['case_activity', { case: 'CCPY26050' }],
  ['vrm_twins', { vrm: 'YT13 UTV' }],
  ['list_queue_cases', { queue: 'Review' }],
  ['emails_for_case', { case: 'CCPY26050' }],
  ['aging_exceptions', {}],
] as const;

beforeEach(() => {
  sqls.length = 0;
  rowsFor.mockReset();
  rowsFor.mockReturnValue([]);
});
afterEach(() => {
  delete process.env.ASSISTANT_TOOLSET_V2;
});

describe('assistant read tools (TKT-066/069)', () => {
  it('every tool issues SELECT-only SQL (read-only invariant, TKT-060/069)', async () => {
    for (const [name, args] of READ_TOOLS) {
      await execTool(name, args as Record<string, unknown>);
    }
    expect(sqls.length).toBeGreaterThan(0);
    for (const sql of sqls) {
      expect(sql).toMatch(/^\s*SELECT/i);
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|TRUNCATE)\b/i);
    }
  });

  it('lookup_case builds a space-insensitive canonical VRM/Case-PO predicate (TKT-066)', async () => {
    await execTool('lookup_case', { query: 'YT13 UTV' });
    const sql = sqls.find((s) => /FROM case_/i.test(s))!;
    expect(sql).toContain("regexp_replace(upper(c.vrm), '[^A-Z0-9]', '', 'g')");
    expect(sql).toContain("regexp_replace(upper(c.case_po), '[^A-Z0-9]', '', 'g')");
  });

  it('lookup_case passes the compacted canonical form as the match param', async () => {
    const { query } = (await import('../lib/db.js')) as unknown as {
      query: ReturnType<typeof vi.fn>;
    };
    await execTool('lookup_case', { query: 'yt13 utv' });
    const call = query.mock.calls.find((c) => /FROM case_/i.test(c[0] as string))!;
    const params = call[1] as unknown[];
    expect(params).toContain('%YT13UTV%'); // canonical, compacted, upper-cased
  });

  it('list_queue_cases rejects an unknown queue without any DB call', async () => {
    const res = (await execTool('list_queue_cases', { queue: 'nonsense' })) as { error?: string };
    expect(res.error).toBeTruthy();
    expect(sqls.length).toBe(0);
  });

  it('get_case_detail returns { found:false } when nothing resolves', async () => {
    rowsFor.mockReturnValue([]);
    const res = (await execTool('get_case_detail', { case: 'nope' })) as { found: boolean };
    expect(res.found).toBe(false);
  });

  it('an unknown tool name returns an error object, never throws', async () => {
    const res = (await execTool('definitely_not_a_tool', {})) as { error?: string };
    expect(res.error).toContain('unknown tool');
  });
});

describe('toolsForRequest gating (ASSISTANT_TOOLSET_V2)', () => {
  it('advertises only the three legacy tools when the V2 gate is off', () => {
    delete process.env.ASSISTANT_TOOLSET_V2;
    const names = toolsForRequest().map((t) => t.function.name).sort();
    expect(names).toEqual(['count_cases_by_status', 'lookup_case', 'search_inbound']);
  });

  it('advertises all nine read tools when the V2 gate is on', () => {
    process.env.ASSISTANT_TOOLSET_V2 = 'true';
    const names = toolsForRequest().map((t) => t.function.name);
    expect(names).toHaveLength(9);
    expect(names).toContain('get_case_detail');
    expect(names).toContain('aging_exceptions');
    // archive_lookup is registered but not wired into the assistant yet (TKT-107)
    expect(names).not.toContain('archive_lookup');
  });
});

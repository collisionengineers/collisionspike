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
const { execTool, toolsForRequest, buildExecutor } = await import('./assistant.js');
const domain = await import('@cs/domain');
type ProposedAction = import('@cs/domain').ProposedAction;

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
  delete process.env.ASSISTANT_WRITE_TIER_ENABLED;
});
void domain;

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

  it('returns stable write-target ids from case and inbound searches', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM case_ c/i.test(sql)) {
        return [{ case_id: '11111111-1111-4111-8111-111111111111', case_po: 'QDOS-26-001' }];
      }
      if (/FROM inbound_email/i.test(sql)) {
        return [{ id: '22222222-2222-4222-8222-222222222222', subject: 'Instruction' }];
      }
      return [];
    });
    const cases = await execTool('lookup_case', { query: 'QDOS-26-001' }) as {
      matches: Array<{ caseId: string }>;
    };
    const inbound = await execTool('search_inbound', { query: 'Instruction' }) as {
      matches: Array<{ inboundId: string }>;
    };
    expect(cases.matches[0].caseId).toBe('11111111-1111-4111-8111-111111111111');
    expect(inbound.matches[0].inboundId).toBe('22222222-2222-4222-8222-222222222222');
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
    expect(names).toContain('get_case_detail');
    expect(names).toContain('aging_exceptions');
    // archive_lookup is registered but not wired into the assistant yet (TKT-107)
    expect(names).not.toContain('archive_lookup');
    // no write tool without the write-tier gate
    expect(names).not.toContain('propose_action');
  });

  it('adds propose_action only when the write-tier gate is on (TKT-111)', () => {
    delete process.env.ASSISTANT_WRITE_TIER_ENABLED;
    expect(toolsForRequest().map((t) => t.function.name)).not.toContain('propose_action');
    process.env.ASSISTANT_WRITE_TIER_ENABLED = 'true';
    expect(toolsForRequest().map((t) => t.function.name)).toContain('propose_action');
  });

  it('keeps every capability-specific params schema below the supported nested anyOf', () => {
    process.env.ASSISTANT_WRITE_TIER_ENABLED = 'true';
    const tool = toolsForRequest().find((t) => t.function.name === 'propose_action')!;
    const root = tool.function.parameters as Record<string, unknown>;
    const properties = root.properties as Record<string, Record<string, unknown>>;
    const variants = properties.action.anyOf as Array<Record<string, unknown>>;
    expect(root).toMatchObject({ type: 'object', required: ['action'], additionalProperties: false });
    expect(root).not.toHaveProperty('oneOf');
    expect(variants.length).toBeGreaterThan(0);
    for (const variant of variants) {
      const variantProperties = variant.properties as Record<string, Record<string, unknown>>;
      expect(variantProperties.capability.enum).toHaveLength(1);
      expect(variantProperties.params).toMatchObject({ type: 'object', additionalProperties: false });
    }
  });
});

describe('propose_action executor (TKT-111 write tier)', () => {
  it('captures a validated ProposedAction and never performs a write', async () => {
    process.env.ASSISTANT_WRITE_TIER_ENABLED = 'true';
    const proposals: ProposedAction[] = [];
    const exec = buildExecutor(proposals);
    const res = (await exec('propose_action', {
      action: {
        capability: 'set_on_hold',
        params: { caseId: '11111111-1111-4111-8111-111111111111', onHold: true },
      },
    })) as { proposed: boolean };
    expect(res.proposed).toBe(true);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      capability: 'set_on_hold',
      method: 'POST',
      path: 'cases/11111111-1111-4111-8111-111111111111/hold',
      body: { onHold: true },
    });
    expect(sqls.length).toBe(0); // proposing issues NO SQL — nothing is written
  });

  it('rejects an invalid proposal without capturing it', async () => {
    process.env.ASSISTANT_WRITE_TIER_ENABLED = 'true';
    const proposals: ProposedAction[] = [];
    const exec = buildExecutor(proposals);
    const res = (await exec('propose_action', { capability: 'set_on_hold', params: { caseId: 'c-1' } })) as {
      proposed: boolean;
      error?: string;
    };
    expect(res.proposed).toBe(false);
    expect(proposals).toHaveLength(0);
  });

  it('refuses a human-only / destructive capability (merge_cases) as a proposal', async () => {
    process.env.ASSISTANT_WRITE_TIER_ENABLED = 'true';
    const proposals: ProposedAction[] = [];
    const res = (await buildExecutor(proposals)('propose_action', {
      capability: 'merge_cases',
      params: { targetCaseId: 'a', sourceCaseId: 'b' },
    })) as { proposed: boolean };
    expect(res.proposed).toBe(false);
    expect(proposals).toHaveLength(0);
  });

  it('is switched off when the write-tier gate is off', async () => {
    delete process.env.ASSISTANT_WRITE_TIER_ENABLED;
    const proposals: ProposedAction[] = [];
    const res = (await buildExecutor(proposals)('propose_action', {
      capability: 'set_on_hold',
      params: { caseId: 'c-1', onHold: true },
    })) as { proposed: boolean };
    expect(res.proposed).toBe(false);
    expect(proposals).toHaveLength(0);
  });
});

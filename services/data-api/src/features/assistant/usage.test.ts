import { describe, it, expect, beforeEach, vi } from 'vitest';

const query = vi.fn(async (_sql: string, _params?: unknown[]) => [] as Record<string, unknown>[]);
vi.mock('../../platform/db/client.js', () => ({ query, getPool: vi.fn(), tx: vi.fn() }));

const { recordAiUsage } = await import('./usage.js');

beforeEach(() => query.mockReset().mockResolvedValue([]));

describe('recordAiUsage (TKT-113)', () => {
  it('issues one ATOMIC upsert keyed on (usage_day, actor, surface)', async () => {
    await recordAiUsage({ actor: 'oid-1', surface: 'assistant', model: 'gpt-5', inputTokens: 100, outputTokens: 42 });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO ai_usage_ledger/i);
    expect(sql).toMatch(/ON CONFLICT \(usage_day, actor, surface\) DO UPDATE/i);
    expect(sql).toMatch(/calls\s*=\s*ai_usage_ledger\.calls \+ 1/i);
    expect(params).toEqual(['oid-1', 'assistant', 'gpt-5', 100, 42]);
  });

  it('defaults a blank actor and floors negative/absent token counts', async () => {
    await recordAiUsage({ actor: '   ', surface: 'classifier' });
    const [, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(params).toEqual(['unknown', 'classifier', null, 0, 0]);
  });

  it('never throws when the ledger write fails (best-effort)', async () => {
    query.mockRejectedValueOnce(new Error('db down'));
    await expect(recordAiUsage({ actor: 'x', surface: 'vision' })).resolves.toBeUndefined();
  });
});

import { describe, expect, it, vi } from 'vitest';

const activities = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('durable-functions', () => ({
  app: { activity: (name: string, options: Record<string, unknown>) => activities.set(name, options) },
}));

const { mintCaseNumberV2Core, formatCaseNumber } = await import('./mintCaseNumber.js');

describe('mintCaseNumberV2Core', () => {
  it('shares one sequence-scope key across every email type for a principal+year', () => {
    const standard = mintCaseNumberV2Core({ principalCode: 'QDOS', year: '26', emailType: '1a_standard' });
    const repairable = mintCaseNumberV2Core({ principalCode: 'QDOS', year: '26', emailType: '1b_audit_repairable' });
    expect(standard.sequenceScopeKey).toBe('QDOS26');
    expect(repairable.sequenceScopeKey).toBe('QDOS26');
  });

  it('mints the confirmed lowercase prefixes per email type', () => {
    expect(mintCaseNumberV2Core({ principalCode: 'QDOS', year: '26', emailType: '1a_standard' }).prefix).toBe('');
    expect(
      mintCaseNumberV2Core({ principalCode: 'QDOS', year: '26', emailType: '1b_audit_repairable' }).prefix,
    ).toBe('a.');
    expect(
      mintCaseNumberV2Core({ principalCode: 'QDOS', year: '26', emailType: '1b_audit_total_loss' }).prefix,
    ).toBe('ap.');
    expect(
      mintCaseNumberV2Core({ principalCode: 'QDOS', year: '26', emailType: '1c_inspection_and_audit' }).prefix,
    ).toBe('');
  });

  it('re-exports the pure formatter unchanged', () => {
    expect(formatCaseNumber('QDOS', '26', 1, 'a.')).toBe('a.QDOS26001');
  });
});

describe('mintCaseNumberV2 activity registration', () => {
  it('registers the durable activity and delegates to the core function', async () => {
    expect(activities.has('mintCaseNumberV2')).toBe(true);
    const handler = activities.get('mintCaseNumberV2')!.handler as (
      input: { principalCode: string; year: string; emailType: string },
      ctx: { log: (message: string) => void },
    ) => Promise<{ sequenceScopeKey: string; prefix: string }>;
    const ctx = { log: vi.fn() };
    const result = await handler({ principalCode: 'QDOS', year: '26', emailType: '1a_standard' }, ctx);
    expect(result).toEqual({ sequenceScopeKey: 'QDOS26', prefix: '' });
    expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining('mintCaseNumberV2'));
  });
});

import { describe, expect, it, vi } from 'vitest';

const activities = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('durable-functions', () => ({
  app: { activity: (name: string, options: Record<string, unknown>) => activities.set(name, options) },
}));

const { classifyEmailTypeV2Core } = await import('./classifyEmailType.js');

describe('classifyEmailTypeV2Core', () => {
  it('classifies a QDOS audit instruction with a repairable verdict', () => {
    const result = classifyEmailTypeV2Core({
      principalCode: 'QDOS',
      contentText: 'Please see attached audit instruction — the engineer found the vehicle repairable.',
    });
    expect(result.emailType).toBe('1b_audit_repairable');
  });

  it('classifies plain instruction text as standard', () => {
    const result = classifyEmailTypeV2Core({
      principalCode: 'QDOS',
      contentText: 'Please inspect the attached vehicle and provide your report.',
    });
    expect(result.emailType).toBe('1a_standard');
  });

  it('falls back to the fully-defaulted entry for an unregistered principal code', () => {
    const result = classifyEmailTypeV2Core({
      principalCode: 'NOT-A-REAL-PROVIDER',
      contentText: 'audit report attached',
    });
    // The default entry's auditSignalPhrases list is empty, so no provider-specific
    // audit phrase can ever fire for an unregistered code — it always reads standard.
    expect(result.emailType).toBe('1a_standard');
  });
});

describe('classifyEmailTypeV2 activity registration', () => {
  it('registers the durable activity and delegates to the core function', async () => {
    expect(activities.has('classifyEmailTypeV2')).toBe(true);
    const handler = activities.get('classifyEmailTypeV2')!.handler as (
      input: { principalCode: string; contentText: string },
      ctx: { log: (message: string) => void },
    ) => Promise<{ emailType: string }>;
    const ctx = { log: vi.fn() };
    const result = await handler({ principalCode: 'QDOS', contentText: 'no signals here' }, ctx);
    expect(result.emailType).toBe('1a_standard');
    expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining('classifyEmailTypeV2'));
  });
});

import { describe, expect, it, vi } from 'vitest';

const activities = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('durable-functions', () => ({
  app: { activity: (name: string, options: Record<string, unknown>) => activities.set(name, options) },
}));

const { identifyPrincipalV2Core } = await import('./identifyPrincipal.js');

describe('identifyPrincipalV2Core', () => {
  it('resolves a direct provider from a known domain (QDOS seed data)', () => {
    const result = identifyPrincipalV2Core({ senderAddress: 'claims@qdosassist.co.uk' });
    expect(result).toMatchObject({ outcome: 'matched', principalCode: 'QDOS' });
  });

  it('surfaces an intermediary needing Stage 1b disambiguation (Connexus seed data)', () => {
    const result = identifyPrincipalV2Core({ senderAddress: 'ops@connexus.co.uk' });
    expect(result).toMatchObject({
      outcome: 'intermediary',
      intermediaryCode: 'CNX',
      candidatePrincipalCodes: ['PCH', 'SBL'],
    });
  });

  it('returns unmatched for an unknown domain', () => {
    const result = identifyPrincipalV2Core({ senderAddress: 'someone@totally-unknown-domain.test' });
    expect(result).toMatchObject({ outcome: 'unmatched', matchedDomain: 'totally-unknown-domain.test' });
  });

  it('returns unmatched for an unparseable sender address', () => {
    const result = identifyPrincipalV2Core({ senderAddress: 'not-an-email' });
    expect(result).toMatchObject({ outcome: 'unmatched', matchedDomain: '' });
  });
});

describe('identifyPrincipalV2 activity registration', () => {
  it('registers the durable activity and delegates to the core function', async () => {
    expect(activities.has('identifyPrincipalV2')).toBe(true);
    const handler = activities.get('identifyPrincipalV2')!.handler as (
      input: { senderAddress: string },
      ctx: { log: (message: string) => void },
    ) => Promise<unknown>;
    const ctx = { log: vi.fn() };
    const result = (await handler({ senderAddress: 'someone@totally-unknown-domain.test' }, ctx)) as {
      outcome: string;
    };
    expect(result.outcome).toBe('unmatched');
    expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining('identifyPrincipalV2'));
  });
});

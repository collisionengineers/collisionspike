import { describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

interface Registration {
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;
}

const registrations = vi.hoisted(() => new Map<string, Registration>());
vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, options: Registration) => registrations.set(name, options),
  },
}));

const drain = vi.hoisted(() => vi.fn(async () => ({ published: 3, failed: 1 })));
vi.mock('../assistant/evidence-backfill.js', () => ({ drainEvidenceBackfillRequests: drain }));
vi.mock('../inbound/internal/service-support.js', () => ({
  withServiceAuth: async (
    req: HttpRequest,
    ctx: InvocationContext,
    handler: (request: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>,
  ) => handler(req, ctx),
}));

await import('./backfill-drain-route.js');

describe('evidence backfill request drain service seam', () => {
  it('keeps DB claiming and queue publication in the API for the durable monitor activity', async () => {
    const handler = registrations.get('internalEvidenceBackfillRequestDrain')!.handler;
    const ctx = { log: vi.fn() } as unknown as InvocationContext;
    const response = await handler({} as HttpRequest, ctx);

    expect(drain).toHaveBeenCalledWith(undefined, 50);
    expect(response).toEqual({ status: 200, jsonBody: { published: 3, failed: 1 } });
    expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining('evidenceBackfillRequestDrain'));
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { INBOUND_COUNTS_ZERO } from '@cs/domain';

interface Registration {
  methods: string[];
  authLevel: string;
  route: string;
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;
}

const registrations = vi.hoisted(() => new Map<string, Registration>());
vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, registration: Registration) => registrations.set(name, registration),
  },
}));

const requiredRole = vi.hoisted(() => new WeakMap<Function, string>());
vi.mock('../lib/auth.js', () => ({
  withRole: (role: string, handler: (...args: unknown[]) => Promise<HttpResponseInit>) => {
    const wrapped = (req: HttpRequest, ctx: InvocationContext) =>
      handler(req, ctx, { sub: 'staff-1' });
    requiredRole.set(wrapped, role);
    return wrapped;
  },
}));

const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn() }));
vi.mock('../lib/db.js', () => ({ query: db.query, tx: db.tx }));

await import('./inbound.js');

function registration(name: string): Registration {
  const value = registrations.get(name);
  if (!value) throw new Error(`${name} was not registered`);
  return value;
}

function request(params: Record<string, string> = {}): HttpRequest {
  return {
    params,
    query: new URLSearchParams(),
    headers: { get: () => null },
  } as unknown as HttpRequest;
}

function context(invocationId = '11111111-1111-4111-8111-111111111111'): InvocationContext {
  return {
    invocationId,
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as InvocationContext;
}

beforeEach(() => {
  db.query.mockReset();
  db.tx.mockReset();
});

describe('GET /api/inbound/counts', () => {
  it('keeps the literal counts route separate from the guid-only detail route and requires staff role', () => {
    const counts = registration('inboundEmailCounts');
    const detail = registration('inboundEmailById');

    expect(counts).toMatchObject({ methods: ['GET'], route: 'inbound/counts' });
    expect(detail).toMatchObject({ methods: ['GET'], route: 'inbound/{id:guid}' });
    expect(requiredRole.get(counts.handler)).toBe('CollisionSpike.User');
    expect(requiredRole.get(detail.handler)).toBe('CollisionSpike.User');
  });

  it('returns the complete active count contract for populated production-shaped rows', async () => {
    db.query.mockResolvedValue([
      { category_code: 100000000, triage_state: 'new' },
      { category_code: 100000003, triage_state: 'routed' },
      { category_code: 100000001, triage_state: 'actioned' },
      { category_code: null, triage_state: null },
    ]);

    const response = await registration('inboundEmailCounts').handler(request(), context());

    expect(db.query).toHaveBeenCalledWith(
      'SELECT category_code, triage_state FROM inbound_email',
    );
    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual({
      receiving_work: 1,
      query: 0,
      billing: 1,
      non_actionable: 0,
      other: 0,
      case_update: 0,
      cancellation: 0,
      pre_instruction: 0,
      website_enquiry: 0,
      untriaged: 2,
    });
  });

  it('returns deterministic zeros for an empty inbox', async () => {
    db.query.mockResolvedValue([]);

    const response = await registration('inboundEmailCounts').handler(request(), context());

    expect(response).toMatchObject({ status: 200, jsonBody: INBOUND_COUNTS_ZERO });
  });

  it('fails visibly with a safe correlation id while retaining actionable server telemetry', async () => {
    const error = new Error('database unavailable at a sensitive host');
    db.query.mockRejectedValue(error);
    const ctx = context('22222222-2222-4222-8222-222222222222');

    const response = await registration('inboundEmailCounts').handler(request(), ctx);

    expect(response).toEqual({
      status: 500,
      jsonBody: {
        error: 'internal',
        correlationId: '22222222-2222-4222-8222-222222222222',
      },
      headers: { 'x-correlation-id': '22222222-2222-4222-8222-222222222222' },
    });
    expect(JSON.stringify(response)).not.toContain(error.message);
    expect(ctx.error).toHaveBeenCalledTimes(1);
    expect(String((ctx.error as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain(
      'database unavailable',
    );
  });
});

describe('GET /api/inbound/{id}', () => {
  it('rejects an invalid direct-handler id before it can reach the uuid column', async () => {
    const response = await registration('inboundEmailById').handler(
      request({ id: 'counts' }),
      context(),
    );

    expect(response).toEqual({ status: 400, jsonBody: { error: 'invalid id' } });
    expect(db.query).not.toHaveBeenCalled();
  });
});

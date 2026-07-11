/** TKT-146: exact Box classification stamp + durable status-generation contract. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

interface Reg {
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;
}

const registrations = vi.hoisted(() => new Map<string, Reg>());
vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, opts: Reg) => registrations.set(name, opts),
    timer: () => {},
  },
}));

vi.mock('../lib/auth.js', () => ({
  authenticate: vi.fn(async () => ({})),
  toErrorResponse: vi.fn(() => ({ status: 401 })),
}));

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

await import('./internal.js');

const enumerate = registrations.get('internalEvidenceUnclassifiedBox')!.handler;
const stamp = registrations.get('internalEvidenceBoxClassification')!.handler;
const pending = registrations.get('internalStatusRecomputePending')!.handler;
const complete = registrations.get('internalStatusRecomputeComplete')!.handler;

const ctx = { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;

function req(options: {
  id?: string;
  body?: unknown;
  query?: Record<string, string>;
} = {}): HttpRequest {
  return {
    params: { id: options.id ?? '' },
    query: new URLSearchParams(options.query ?? {}),
    json: async () => options.body ?? {},
  } as unknown as HttpRequest;
}

const classification = {
  caseId: 'case-1',
  boxFileId: 'box-1',
  imageRole: 'overview',
  registrationVisible: true,
  acceptedForEva: true,
  personReflection: false,
};

beforeEach(() => {
  db.query.mockReset();
  db.tx.mockReset();
  db.txQuery.mockReset();
  db.query.mockResolvedValue([]);
  db.tx.mockImplementation(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => fn(db.txQuery));
  db.txQuery.mockImplementation(async (sql: string) => {
    if (sql.startsWith('UPDATE evidence')) return [{ id: 'ev-1' }];
    if (sql.startsWith('UPDATE case_')) {
      return [{ status_recompute_requested_generation: '7' }];
    }
    return [];
  });
});

describe('unclassified Box enumeration', () => {
  it('filters explicit provider opt-outs before the newest-first LIMIT', async () => {
    await enumerate(req({ query: { limit: '25' } }), ctx);
    const sql = String(db.query.mock.calls[0][0]);
    expect(sql).toContain('LEFT JOIN work_provider wp ON wp.id = c.work_provider_id');
    expect(sql).toContain('wp.ai_allowed IS DISTINCT FROM false');
    expect(sql.indexOf('wp.ai_allowed IS DISTINCT FROM false')).toBeLessThan(sql.indexOf('LIMIT $3'));
  });
});

describe('exact Box classification stamp', () => {
  it('updates only a still-unclassified row and increments status work in the same transaction', async () => {
    const response = await stamp(req({ id: 'ev-1', body: classification }), ctx);
    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual({ updated: true, statusGeneration: 7 });
    expect(db.tx).toHaveBeenCalledTimes(1);
    expect(db.txQuery).toHaveBeenCalledTimes(2);

    const updateSql = String(db.txQuery.mock.calls[0][0]);
    expect(updateSql).toContain('image_role_code = $11');
    expect(updateSql).toContain('registration_visible IS NULL');
    expect(updateSql).toContain('excluded = false');
    const requestSql = String(db.txQuery.mock.calls[1][0]);
    expect(requestSql).toContain('status_recompute_requested_generation + 1');
  });

  it('treats a newer manual/classifier stamp as a benign stale no-op', async () => {
    db.txQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE evidence')) return [];
      if (sql.startsWith('SELECT id FROM evidence')) return [{ id: 'ev-1' }];
      throw new Error(`unexpected SQL: ${sql}`);
    });

    const response = await stamp(req({ id: 'ev-1', body: classification }), ctx);
    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual({ updated: false, stale: true });
    expect(
      db.txQuery.mock.calls.some(([sql]) =>
        String(sql).includes('status_recompute_requested_generation + 1'),
      ),
    ).toBe(false);
  });

  it('does not use the event-time route to clear an already-excluded row', async () => {
    db.txQuery.mockImplementation(async (sql: string) => {
      // The compare-and-set finds no row because the live row has excluded=true;
      // the identity probe still finds it and returns the benign stale outcome.
      if (sql.startsWith('UPDATE evidence')) return [];
      if (sql.startsWith('SELECT id FROM evidence')) return [{ id: 'ev-excluded' }];
      throw new Error(`unexpected SQL: ${sql}`);
    });

    const response = await stamp(
      req({ id: 'ev-excluded', body: { ...classification, excluded: false } }),
      ctx,
    );

    expect(response.jsonBody).toEqual({ updated: false, stale: true });
    expect(
      db.txQuery.mock.calls.some(([sql]) =>
        String(sql).includes('status_recompute_requested_generation + 1'),
      ),
    ).toBe(false);
  });

  it('returns 404 only when the exact evidence identity does not exist', async () => {
    db.txQuery.mockResolvedValue([]);
    const response = await stamp(req({ id: 'wrong', body: classification }), ctx);
    expect(response.status).toBe(404);
  });

  it('rejects an unknown role name instead of coercing it to unknown', async () => {
    const response = await stamp(
      req({ id: 'ev-1', body: { ...classification, imageRole: 'sideways' } }),
      ctx,
    );
    expect(response.status).toBe(400);
    expect(db.tx).not.toHaveBeenCalled();
  });

  it("maps the valid non-vehicle 'other' verdict to the stored unknown role", async () => {
    await stamp(
      req({
        id: 'ev-1',
        body: { ...classification, imageRole: 'other', acceptedForEva: false },
      }),
      ctx,
    );
    const params = db.txQuery.mock.calls[0][1] as unknown[];
    expect(params[4]).toBe(100000003);
  });
});

describe('generation-aware status acknowledgement', () => {
  it('lists only requested generations that have not completed', async () => {
    db.query.mockResolvedValue([
      { id: 'case-1', status_recompute_requested_generation: '9' },
    ]);
    const response = await pending(req({ query: { limit: '10' } }), ctx);
    expect(response.jsonBody).toEqual({ rows: [{ caseId: 'case-1', generation: 9 }] });
    expect(String(db.query.mock.calls[0][0])).toContain(
      'status_recompute_completed_generation < status_recompute_requested_generation',
    );
  });

  it('acknowledging generation 1 leaves a concurrently-requested generation 2 pending', async () => {
    db.query.mockResolvedValue([
      {
        status_recompute_requested_generation: '2',
        status_recompute_completed_generation: '1',
      },
    ]);
    const response = await complete(req({ id: 'case-1', body: { generation: 1 } }), ctx);
    expect(response.jsonBody).toEqual({ completed: true, pending: true });
    const sql = String(db.query.mock.calls[0][0]);
    expect(sql).toContain('GREATEST');
    expect(sql).toContain('LEAST($2::bigint, status_recompute_requested_generation)');
  });
});

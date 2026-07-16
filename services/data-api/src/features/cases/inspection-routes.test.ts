import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

interface Registration {
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<{
    status?: number;
    jsonBody?: unknown;
    headers?: Record<string, string>;
  }>;
}

const registrations = vi.hoisted(() => new Map<string, Registration>());
vi.mock('@azure/functions', () => ({
  app: { http: (name: string, registration: Registration) => registrations.set(name, registration) },
}));
vi.mock('../../platform/auth/staff-auth.js', () => ({
  withRole: (_role: string, handler: Function) =>
    (req: HttpRequest, ctx: InvocationContext) => handler(req, ctx, { sub: 'staff-1' }),
}));

const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn() }));
vi.mock('../../platform/db/client.js', () => ({ query: db.query, tx: db.tx }));
const status = vi.hoisted(() => ({ recompute: vi.fn() }));
vi.mock('./case-support.js', () => ({ recomputeStatus: status.recompute }));

await import('./inspection-routes.js');

const CASE_ID = '11111111-1111-4111-8111-111111111111';
const UPDATED_AT = new Date('2026-07-11T12:00:00.000Z');
const VERSION = String(UPDATED_AT.getTime());
const sqlLog: string[] = [];

function req(ifMatch?: string): HttpRequest {
  return {
    params: { id: CASE_ID },
    headers: { get: (name: string) => name.toLowerCase() === 'if-match' ? (ifMatch ?? null) : null },
    json: async () => ({
      decisionMode: 'confirmed_physical',
      addressLines: ['1 Test Road', 'London'],
      postcode: 'SW1A 1AA',
      sourceLabel: 'confirmed:corpus',
      sourceNote: 'Confirmed by staff',
    }),
  } as unknown as HttpRequest;
}

function context(): InvocationContext {
  return { warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;
}

beforeEach(() => {
  sqlLog.length = 0;
  status.recompute.mockReset().mockResolvedValue(true);
  db.query.mockReset();
  db.tx.mockReset();
  db.tx.mockImplementation(async (fn: (q: typeof db.query) => unknown) => fn(db.query));
  db.query.mockImplementation(async (sql: string) => {
    sqlLog.push(sql);
    if (/SELECT case_po, eva_inspection_address/i.test(sql) && /FOR UPDATE/i.test(sql)) {
      return [{
        case_po: 'QDOS-26-001',
        eva_inspection_address: '',
        inspection_decision_code: null,
        updated_at: UPDATED_AT,
      }];
    }
    if (/INSERT INTO inspection_address/i.test(sql)) return [{ id: 'address-1' }];
    if (/SET eva_inspection_address = \$2/i.test(sql)) return [{ updated_at: UPDATED_AT }];
    if (/status_recompute_requested_generation = status_recompute_requested_generation \+ 1/i.test(sql)) {
      return [{ status_recompute_requested_generation: 1 }];
    }
    if (/status_recompute_completed_generation = GREATEST/i.test(sql)) {
      return [{ status_recompute_requested_generation: 1, status_recompute_completed_generation: 1 }];
    }
    if (/SELECT updated_at FROM case_/i.test(sql)) return [{ updated_at: UPDATED_AT }];
    return [];
  });
});

describe('saveInspectionDecision persistence and concurrency', () => {
  it('rejects stale If-Match before either corpus or case mutation', async () => {
    const res = await registrations.get('saveInspectionDecision')!.handler(req('stale-version'), context());
    expect(res.status).toBe(409);
    expect(res.jsonBody).toEqual({ error: 'stale', currentVersion: VERSION });
    expect(sqlLog.some((sql) => /INSERT INTO inspection_address/i.test(sql))).toBe(false);
    expect(sqlLog.some((sql) => /SET eva_inspection_address/i.test(sql))).toBe(false);
  });

  it('writes the case decision and acknowledges its durable status generation', async () => {
    const res = await registrations.get('saveInspectionDecision')!.handler(req(VERSION), context());
    expect(res.status).toBe(200);
    expect(res.jsonBody).toMatchObject({ persisted: true, id: 'address-1', version: VERSION });
    expect(sqlLog.some((sql) => /SET eva_inspection_address = \$2/i.test(sql))).toBe(true);
    expect(sqlLog.some((sql) => /status_recompute_requested_generation = status_recompute_requested_generation \+ 1/i.test(sql))).toBe(true);
    expect(sqlLog.some((sql) => /status_recompute_completed_generation = GREATEST/i.test(sql))).toBe(true);
  });

  it('keeps the primary write successful and pending when fast-path recompute fails', async () => {
    status.recompute.mockRejectedValueOnce(new Error('temporary evaluator failure'));
    const ctx = context();
    const res = await registrations.get('saveInspectionDecision')!.handler(req(VERSION), ctx);
    expect(res.status).toBe(200);
    expect(res.jsonBody).toMatchObject({ persisted: true });
    expect(sqlLog.some((sql) => /SET eva_inspection_address = \$2/i.test(sql))).toBe(true);
    expect(sqlLog.some((sql) => /status_recompute_completed_generation = GREATEST/i.test(sql))).toBe(false);
    expect(ctx.warn).toHaveBeenCalledWith(expect.stringContaining('remains pending'));
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

interface Registration {
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<{ status?: number; jsonBody?: unknown; headers?: Record<string, string> }>;
}

const registrations = vi.hoisted(() => new Map<string, Registration>());
vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, registration: Registration) => registrations.set(name, registration),
    timer: vi.fn(),
  },
}));
vi.mock('../lib/auth.js', () => ({
  withRole: (_role: string, handler: Function) =>
    (req: HttpRequest, ctx: InvocationContext) => handler(req, ctx, { sub: 'staff-1' }),
}));
vi.mock('./internal.js', () => ({ isUniqueViolation: () => false }));
vi.mock('../lib/inspection-prefill.js', () => ({
  isPrefillApplicable: () => false,
  prefillImageBasedInspection: vi.fn(async () => false),
}));
vi.mock('../lib/overview-chase.js', () => ({ maybeSuggestOverviewChase: vi.fn(async () => false) }));
vi.mock('../lib/functions-client.js', () => ({ listBoxFolderNames: vi.fn(async () => []) }));

const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn() }));
vi.mock('../lib/db.js', () => ({ query: db.query, tx: db.tx }));

await import('./cases.js');
await import('./inbound.js');

const CASE_ID = '11111111-1111-4111-8111-111111111111';
const INBOUND_ID = '22222222-2222-4222-8222-222222222222';
const UPDATED_AT = new Date('2026-07-11T12:00:00.000Z');
const VERSION = String(UPDATED_AT.getTime());
const sqlLog: string[] = [];

const baseCaseRow = {
  id: CASE_ID,
  updated_at: UPDATED_AT,
  status_code: 100000001,
  duplicate_keys: null,
  provider_display: 'Provider',
  vrm: 'AB12CDE',
};
const inboundRow = {
  id: INBOUND_ID,
  updated_at: UPDATED_AT,
  name: 'Message',
  category_code: 100000000,
  subtype_code: 100000000,
  suggested_category_code: 100000000,
  suggested_subtype_code: 100000000,
  triage_state: 'new',
  source_message_id: 'message-1',
};

function request(
  params: Record<string, string>,
  body: unknown,
  ifMatch?: string,
): HttpRequest {
  return {
    params,
    json: async () => body,
    headers: { get: (name: string) => name.toLowerCase() === 'if-match' ? (ifMatch ?? null) : null },
  } as unknown as HttpRequest;
}

const ctx = { warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;
let activeCaseRow: Record<string, unknown>;
let inTx = false;
let failNextOutsideCaseRead = false;

beforeEach(() => {
  sqlLog.length = 0;
  activeCaseRow = { ...baseCaseRow };
  inTx = false;
  failNextOutsideCaseRead = false;
  (ctx.warn as ReturnType<typeof vi.fn>).mockClear();
  db.query.mockReset();
  db.tx.mockReset();
  db.tx.mockImplementation(async (fn: (q: typeof db.query) => unknown) => {
    inTx = true;
    try {
      return await fn(db.query);
    } finally {
      inTx = false;
    }
  });
  db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    sqlLog.push(sql);
    if (/FROM case_ c/i.test(sql) && /WHERE c.id = \$1/i.test(sql)) {
      if (!inTx && failNextOutsideCaseRead) {
        failNextOutsideCaseRead = false;
        throw new Error('temporary evaluator read failure');
      }
      return [activeCaseRow];
    }
    if (/UPDATE case_ SET/i.test(sql) && /updated_at = now/i.test(sql)) {
      if (/vrm = \$1/i.test(sql)) activeCaseRow.vrm = params[0];
      return [];
    }
    if (/status_recompute_requested_generation = status_recompute_requested_generation \+ 1/i.test(sql)) {
      return [{ status_recompute_requested_generation: 1 }];
    }
    if (/FROM inbound_email/i.test(sql) && /WHERE inbound_email.id = \$1/i.test(sql)) return [inboundRow];
    if (/FROM inbound_email WHERE id = \$1 FOR UPDATE/i.test(sql)) return [inboundRow];
    return [];
  });
});

describe('assistant write concurrency contracts', () => {
  it('rejects a stale case PATCH under the row lock without mutating', async () => {
    const res = await registrations.get('patchCase')!.handler(
      request({ id: CASE_ID }, { vrm: 'ZZ99ZZZ' }, 'stale-version'),
      ctx,
    );
    expect(res.status).toBe(409);
    expect(res.jsonBody).toEqual({ error: 'stale', currentVersion: VERSION });
    expect(sqlLog.some((sql) => /UPDATE case_ SET/i.test(sql))).toBe(false);
  });

  it('keeps a case PATCH successful with a durable generation when fast-path evaluation fails', async () => {
    failNextOutsideCaseRead = true;
    const res = await registrations.get('patchCase')!.handler(
      request({ id: CASE_ID }, { vrm: 'ZZ99ZZZ' }, VERSION),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(activeCaseRow.vrm).toBe('ZZ99ZZZ');
    expect(sqlLog.some((sql) => /status_recompute_requested_generation = status_recompute_requested_generation \+ 1/i.test(sql))).toBe(true);
    expect(ctx.warn).toHaveBeenCalledWith(expect.stringContaining('remains pending'));
  });

  it('keeps SQL placeholders aligned when an inspection edit is combined with later fields', async () => {
    await registrations.get('patchCase')!.handler(
      request(
        { id: CASE_ID },
        {
          evaFields: { inspectionAddress: '10 Example Road' },
          casePo: 'ABC26001',
          caseType: 'audit',
        },
        VERSION,
      ),
      ctx,
    );
    const call = db.query.mock.calls.find(([sql]) =>
      /UPDATE case_ SET[\s\S]*eva_inspection_address/i.test(String(sql)),
    );
    expect(call).toBeDefined();
    const [sql, params] = call! as [string, unknown[]];
    expect(sql).toContain('eva_inspection_address = $1');
    expect(sql).toContain('inspection_decision_code = NULL');
    expect(sql).toContain('case_po = $2');
    expect(sql).toContain('case_type_code = $3');
    expect(sql).toContain('WHERE id = $4');
    expect(params).toEqual(['10 Example Road', 'ABC26001', expect.any(Number), CASE_ID]);
  });

  it('returns an inbound entity and version from one row snapshot', async () => {
    const res = await registrations.get('inboundEmailById')!.handler(
      request({ id: INBOUND_ID }, {}),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(res.jsonBody).toMatchObject({ id: INBOUND_ID, version: VERSION });
    expect(res.headers?.ETag).toBe(`"${VERSION}"`);
  });

  it('rejects stale inbound triage under the row lock without mutating', async () => {
    const res = await registrations.get('setTriageState')!.handler(
      request({ id: INBOUND_ID }, { state: 'actioned' }, 'stale-version'),
      ctx,
    );
    expect(res.status).toBe(409);
    expect(res.jsonBody).toEqual({ error: 'stale', currentVersion: VERSION });
    expect(sqlLog.some((sql) => /UPDATE inbound_email SET triage_state/i.test(sql))).toBe(false);
  });

  it('rejects an impossible explicit category/subtype pair', async () => {
    const res = await registrations.get('reclassifyInbound')!.handler(
      request(
        { id: INBOUND_ID },
        { category: 'billing', subtype: 'query_existing_work' },
      ),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(res.jsonBody).toEqual({ error: 'category and subtype do not match' });
    expect(sqlLog.some((sql) => /UPDATE inbound_email[\s\S]*classifier_mode/i.test(sql))).toBe(false);
  });
});

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

const CASE_ID = '11111111-1111-4111-8111-111111111111';
const UPDATED_AT = new Date('2026-07-12T12:00:00.000Z');
const VERSION = String(UPDATED_AT.getTime());
const baseRow: Record<string, unknown> = {
  id: CASE_ID,
  updated_at: UPDATED_AT,
  created_at: UPDATED_AT,
  status_code: 100000003,
  duplicate_keys: null,
  provider_display: 'QDOS',
  principal_code: 'QDOS',
  vrm: 'AB12CDE',
  eva_work_provider: 'QDOS',
  eva_vehicle_model: 'Ford Focus',
  eva_claimant_name: '',
  eva_date_of_loss: '01/07/2026',
  eva_date_of_instruction: '02/07/2026',
  eva_accident_circumstances: 'Rear impact',
  eva_inspection_address: '',
  inspection_decision_code: null,
};

const calls: Array<{ sql: string; params: unknown[] }> = [];
let failInspectionWrite = false;
let rolledBack = false;

function request(body: unknown, version?: string): HttpRequest {
  return {
    params: { id: CASE_ID },
    json: async () => body,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'if-match' ? version ?? null : null),
    },
  } as unknown as HttpRequest;
}

function context(): InvocationContext {
  return { warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;
}

beforeEach(() => {
  calls.length = 0;
  failInspectionWrite = false;
  rolledBack = false;
  db.query.mockReset();
  db.tx.mockReset();
  db.tx.mockImplementation(async (work: (q: typeof db.query) => unknown) => {
    try {
      return await work(db.query);
    } catch (error) {
      rolledBack = true;
      throw error;
    }
  });
  db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/FROM case_ c/i.test(sql) && /WHERE c.id = \$1/i.test(sql)) return [{ ...baseRow }];
    if (/FROM field_level_provenance/i.test(sql)) return [];
    if (/FROM evidence/i.test(sql) || /FROM note/i.test(sql) || /FROM chaser/i.test(sql)) return [];
    if (/UPDATE field_level_provenance/i.test(sql)) return [{ id: 'prov-1' }];
    if (/INSERT INTO inspection_address/i.test(sql)) {
      if (failInspectionWrite) throw new Error('inspection write failed');
      return [];
    }
    return [];
  });
});

const physicalSave = {
  editSession: true,
  evaFields: {
    claimantName: 'Jane Example',
    inspectionAddress: '10 Example Road\nLondon',
  },
  inspectionDecision: {
    decisionMode: 'manual',
    sourceLabel: 'manual',
    sourceNote: 'Entered and confirmed by staff',
    addressLines: ['10 Example Road', 'London'],
  },
};

describe('explicit case save transaction', () => {
  it('requires a version before any edit-session mutation', async () => {
    const result = await registrations.get('patchCase')!.handler(request(physicalSave), context());
    expect(result.status).toBe(428);
    expect(calls.some(({ sql }) => /UPDATE case_ SET/i.test(sql))).toBe(false);
  });

  it('rejects a stale draft before either the case or inspection write', async () => {
    const result = await registrations.get('patchCase')!.handler(
      request(physicalSave, 'stale'),
      context(),
    );
    expect(result.status).toBe(409);
    expect(result.jsonBody).toMatchObject({ error: 'stale', currentVersion: VERSION });
    expect(calls.some(({ sql }) => /UPDATE case_ SET/i.test(sql))).toBe(false);
    expect(calls.some(({ sql }) => /INSERT INTO inspection_address/i.test(sql))).toBe(false);
  });

  it('writes fields, address, decision, readiness and one redacted audit in one transaction', async () => {
    const result = await registrations.get('patchCase')!.handler(
      request(physicalSave, VERSION),
      context(),
    );
    expect(result.status).toBe(200);
    const caseUpdate = calls.find(({ sql }) => /UPDATE case_ SET/i.test(sql));
    expect(caseUpdate?.sql).toContain('eva_claimant_name');
    expect(caseUpdate?.sql).toContain('eva_inspection_address');
    expect(caseUpdate?.sql).toMatch(/inspection_decision_code = \$\d+/);
    expect(caseUpdate?.sql).toMatch(/status_code = \$\d+/);
    expect(caseUpdate?.sql).not.toContain('inspection_decision_code = NULL');
    expect(calls.filter(({ sql }) => /INSERT INTO inspection_address/i.test(sql))).toHaveLength(1);
    expect(calls.some(({ sql }) => /status_recompute_requested_generation/i.test(sql))).toBe(false);

    const audits = calls.filter(({ sql }) => /INSERT INTO audit_event/i.test(sql));
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0].params)).toContain('Claimant Name');
    expect(JSON.stringify(audits[0].params)).not.toContain('Jane Example');
    expect(JSON.stringify(audits[0].params)).not.toContain('10 Example Road');
  });

  it('keeps Image Based Assessment and its reason in the same case save', async () => {
    const body = {
      editSession: true,
      evaFields: { inspectionAddress: 'Image Based Assessment' },
      inspectionDecision: {
        decisionMode: 'image_based',
        sourceLabel: 'image_based',
        sourceNote: 'Confirmed by staff',
      },
    };
    const result = await registrations.get('patchCase')!.handler(request(body, VERSION), context());
    expect(result.status).toBe(200);
    const caseUpdate = calls.find(({ sql }) => /UPDATE case_ SET/i.test(sql));
    expect(caseUpdate?.params).toEqual(expect.arrayContaining(['Image Based Assessment', CASE_ID]));
    const inspectionWrite = calls.find(({ sql }) => /INSERT INTO inspection_address/i.test(sql));
    expect(inspectionWrite?.params).toEqual(expect.arrayContaining(['Confirmed by staff']));
  });

  it('rolls back the complete save when the decision write fails and emits no success audit', async () => {
    failInspectionWrite = true;
    await expect(
      registrations.get('patchCase')!.handler(request(physicalSave, VERSION), context()),
    ).rejects.toThrow('inspection write failed');
    expect(rolledBack).toBe(true);
    expect(calls.some(({ sql }) => /INSERT INTO audit_event/i.test(sql))).toBe(false);
  });
});

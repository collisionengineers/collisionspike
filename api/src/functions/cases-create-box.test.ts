import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { EVA_FIELD_ORDER, type EvaFieldKey } from '@cs/domain';

interface Registration {
  methods: string[];
  route: string;
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;
}

const registrations = vi.hoisted(() => new Map<string, unknown>());
vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, opts: unknown) => registrations.set(name, opts),
  },
}));

vi.mock('../lib/auth.js', () => ({
  withRole:
    (_role: string, handler: (...args: unknown[]) => unknown) =>
      (req: unknown, ctx: unknown) =>
        handler(req, ctx, { sub: 'staff-1' }),
}));

const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn() }));
vi.mock('../lib/db.js', () => ({
  query: db.query,
  tx: db.tx,
  getPool: () => {
    throw new Error('no pool in tests');
  },
}));

const box = vi.hoisted(() => ({
  copyFileRequest: vi.fn(),
  getFileRequest: vi.fn(),
  reactivateFileRequest: vi.fn(),
  listFolderNames: vi.fn(),
}));
vi.mock('../lib/functions-client.js', () => ({
  FunctionCallError: class extends Error {
    constructor(message: string, public readonly status?: number) { super(message); }
  },
  callBoxCopyFileRequest: box.copyFileRequest,
  callBoxGetFileRequest: box.getFileRequest,
  callBoxReactivateFileRequest: box.reactivateFileRequest,
  listBoxFolderNames: box.listFolderNames,
}));

import { EVA_COLUMN_BY_KEY } from '../lib/mappers.js';
import './cases.js';

function registration(name: string): Registration {
  const value = registrations.get(name) as Registration | undefined;
  if (!value) throw new Error(`${name} was not registered`);
  return value;
}

function request(
  body: unknown,
  params: Record<string, string> = {},
  headers: Record<string, string> = {},
): HttpRequest {
  return {
    params,
    json: async () => body,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as HttpRequest;
}

function context(): InvocationContext {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as InvocationContext;
}

const callsContaining = (needle: string): unknown[][] =>
  db.query.mock.calls.filter(([sql]) => String(sql).includes(needle));

let boxRows: Array<Record<string, unknown>>;
let outboxRow: Record<string, unknown> | undefined;
let manualOperations: Map<string, {
  actor: string;
  request_hash: string;
  case_id: string | null;
  upload_idempotency_key: string | null;
  expected_file_count: number;
  evidence_completed_at: Date | null;
  instruction_file_index: number | null;
  side_effects_completed_at: Date | null;
}>;

beforeEach(() => {
  vi.unstubAllEnvs();
  db.query.mockReset();
  db.tx.mockReset();
  box.copyFileRequest.mockReset();
  box.getFileRequest.mockReset();
  box.reactivateFileRequest.mockReset();
  box.listFolderNames.mockReset();
  boxRows = [];
  outboxRow = undefined;
  manualOperations = new Map();

  db.tx.mockImplementation(async (fn: (q: typeof db.query) => unknown) => fn(db.query));
  db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('INSERT INTO manual_intake_case_create_operation')) {
      const key = String(params[0]);
      if (!manualOperations.has(key)) {
        manualOperations.set(key, {
          actor: String(params[1]),
          request_hash: String(params[2]),
          case_id: null,
          upload_idempotency_key: params[3] == null ? null : String(params[3]),
          expected_file_count: Number(params[4]),
          evidence_completed_at: null,
          instruction_file_index: params[5] == null ? null : Number(params[5]),
          side_effects_completed_at: null,
        });
      }
      return [];
    }
    if (sql.includes('FROM manual_intake_case_create_operation') && sql.includes('FOR UPDATE')) {
      const operation = manualOperations.get(String(params[0]));
      return operation ? [operation] : [];
    }
    if (sql.includes('SET upload_idempotency_key = $2')) {
      const operation = manualOperations.get(String(params[0]));
      if (operation) {
        operation.upload_idempotency_key = params[1] == null ? null : String(params[1]);
        operation.expected_file_count = Number(params[2]);
        operation.instruction_file_index = params[3] == null ? null : Number(params[3]);
        operation.evidence_completed_at = Number(params[2]) === 0 ? new Date() : null;
      }
      return [];
    }
    if (sql.includes('SET case_id = $2') && sql.includes('manual_intake_case_create_operation')) {
      const operation = manualOperations.get(String(params[0]));
      if (!operation || operation.case_id) return [];
      operation.case_id = String(params[1]);
      if (Number(params[2]) === 0) operation.evidence_completed_at = new Date();
      return [{ idempotency_key: params[0] }];
    }
    if (sql.includes('SET side_effects_completed_at = COALESCE')) {
      const operation = manualOperations.get(String(params[0]));
      if (operation) operation.side_effects_completed_at = new Date();
      return [];
    }
    if (sql.includes('manual_intake_case_create_operation') && sql.includes('AS pending')) {
      const pending = [...manualOperations.values()].some(
        (operation) => operation.case_id === params[0]
          && operation.expected_file_count > 0
          && operation.evidence_completed_at === null,
      );
      return [{ pending }];
    }
    if (sql.includes('SELECT id, duplicate_keys FROM case_')) {
      return boxRows.length ? [{ id: params[0], duplicate_keys: null }] : [];
    }
    if (sql.includes('SELECT box_folder_id FROM case_ WHERE id')) return boxRows;
    if (sql.includes('box_file_request_id') && sql.includes('FOR UPDATE')) return boxRows;
    if (sql.includes('SELECT * FROM box_file_request_outbox')) return outboxRow ? [outboxRow] : [];
    if (sql.includes('INSERT INTO box_file_request_outbox')) {
      outboxRow = {
        case_id: params[0],
        folder_id: params[1],
        template_id: params[2],
        requested_generation: 1,
        completed_generation: 0,
        attempt_count: 0,
        next_attempt_at: new Date(0),
        claim_token: null,
        claim_expires_at: null,
        repair_reason: params[3] ?? null,
      };
      return [];
    }
    if (sql.includes('SET claim_token = $2') && outboxRow) {
      outboxRow = {
        ...outboxRow,
        claim_token: params[1],
        attempt_count: Number(outboxRow.attempt_count) + 1,
      };
      return [outboxRow];
    }
    if (sql.includes('SET completed_generation = $2') && outboxRow) {
      outboxRow = { ...outboxRow, completed_generation: params[1], claim_token: null };
      return [];
    }
    if (sql.includes('SET box_file_request_id')) {
      if (boxRows[0]) {
        boxRows[0].box_file_request_id = params[1];
        boxRows[0].box_file_request_url = params[2];
      }
      return [];
    }
    if (sql.includes('INSERT INTO case_')) return [{ id: 'case-new' }];
    // Recompute after create sees no row in this focused harness and exits cleanly.
    if (sql.includes('FROM case_ c') && sql.includes('WHERE c.id')) return [];
    if (sql.includes('upper(principal_code)')) {
      if (params[0] === 'MISSING') return [];
      return [{ id: 'provider-1', principal_code: 'QDOS', display_name: 'QDOS' }];
    }
    if (sql.includes('SELECT id FROM work_provider')) return [{ id: 'provider-1' }];
    return [];
  });
});

describe('GET case route specificity', () => {
  it('keeps the literal next-po allocator separate from the guid-only detail route', () => {
    expect(registration('caseById')).toMatchObject({ methods: ['GET'], route: 'cases/{id:guid}' });
    expect(registration('nextCasePo')).toMatchObject({ methods: ['GET'], route: 'cases/next-po' });
  });

  it('rejects an invalid direct-handler id before it can reach the uuid column', async () => {
    const response = await registration('caseById').handler(
      request({}, { id: 'next-po' }),
      context(),
    );

    expect(response).toEqual({ status: 400, jsonBody: { error: 'invalid id' } });
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('POST /api/cases — assistant create_case normalization', () => {
  it('keeps the existing POST route registration', () => {
    const reg = registration('createCase');
    expect(reg.methods).toEqual(['POST']);
    expect(reg.route).toBe('cases');
  });

  it('expands the strict minimal proposal, maps claimantName, and persists safe defaults', async () => {
    const res = await registration('createCase').handler(
      request({ vrm: ' ab12 cde ', providerCode: 'qdos', claimantName: '  Jane Driver  ' }),
      context(),
    );

    expect(res.status).toBe(201);
    expect(res.jsonBody).toEqual({ id: 'case-new' });

    const insert = callsContaining('INSERT INTO case_')[0];
    expect(insert).toBeDefined();
    const sql = String(insert[0]);
    const params = insert[1] as unknown[];
    const columns = sql
      .match(/INSERT INTO case_ \(([^)]+)\)/)?.[1]
      .split(',')
      .map((column) => column.trim()) ?? [];
    const persisted = Object.fromEntries(columns.map((column, index) => [column, params[index]]));

    expect(persisted.vrm).toBe('AB12CDE');
    expect(persisted.source_mailbox).toBe('Staff-confirmed case creation');
    expect(persisted.status_code).toBe(100000002); // needs_review: no evidence / incomplete fields
    expect(persisted.work_provider_id).toBe('provider-1');
    expect(persisted.eva_work_provider).toBe('QDOS');
    expect(persisted.eva_claimant_name).toBe('Jane Driver');
    for (const desc of EVA_FIELD_ORDER) {
      expect(columns).toContain(EVA_COLUMN_BY_KEY[desc.key]);
      expect(persisted[EVA_COLUMN_BY_KEY[desc.key]]).not.toBeUndefined();
    }

    const provenance = callsContaining('INSERT INTO field_level_provenance');
    expect(provenance).toHaveLength(12);
    const claimant = provenance.find((call) => (call[1] as unknown[])[2] === 'claimantName');
    expect(claimant?.[1]).toEqual([
      'case-new:claimantName',
      'case-new',
      'claimantName',
      'Jane Driver',
      100000000, // staff
      'Confirmed by staff',
      null,
      100000002, // reviewed
    ]);
  });

  it('preserves a complete Manual Intake body and its field values', async () => {
    const evaFields = Object.fromEntries(
      EVA_FIELD_ORDER.map((desc) => [
        desc.key,
        {
          value:
            desc.key === 'vatStatus'
              ? 'Yes'
              : desc.key === 'mileageUnit'
                ? 'Miles'
                : desc.key === 'mileage'
                  ? '50,000'
                : `${desc.key} value`,
          provenance: { sourceType: 'pdf_extraction', sourceLabel: 'Reviewed instruction' },
          reviewState: 'reviewed',
        },
      ]),
    ) as Record<EvaFieldKey, unknown>;

    const res = await registration('createCase').handler(
      request({
        vrm: 'ZX99ZZZ',
        status: 'ingested',
        sourceLabel: 'Desk intake',
        evaFields,
      }),
      context(),
    );
    expect(res.status).toBe(201);

    const insert = callsContaining('INSERT INTO case_')[0];
    const sql = String(insert[0]);
    const params = insert[1] as unknown[];
    const columns = sql
      .match(/INSERT INTO case_ \(([^)]+)\)/)?.[1]
      .split(',')
      .map((column) => column.trim()) ?? [];
    const persisted = Object.fromEntries(columns.map((column, index) => [column, params[index]]));
    expect(persisted.source_mailbox).toBe('Desk intake');
    expect(persisted.eva_claimant_name).toBe('claimantName value');
    expect(persisted.eva_vat_status).toBe('Yes');
    expect(persisted.eva_mileage_unit).toBe('Miles');
    expect(persisted.eva_mileage).toBe('50000');
  });

  it('persists current and conflicting field sources with deterministic names and exact mappings', async () => {
    const evaFields = Object.fromEntries(
      EVA_FIELD_ORDER.map((desc) => [
        desc.key,
        {
          value:
            desc.key === 'vatStatus'
              ? 'Yes'
              : desc.key === 'mileageUnit'
                ? 'Miles'
                : desc.key === 'mileage'
                  ? '50000'
                  : `${desc.key} current`,
          provenance: {
            sourceType: desc.key === 'claimantName' ? 'pdf_extraction' : 'corpus',
            sourceLabel: `${desc.key} current source`,
            ...(desc.key === 'claimantName' ? { confidence: 0.91 } : {}),
          },
          reviewState: 'reviewed',
          ...(desc.key === 'claimantName'
            ? {
                conflicts: [
                  {
                    candidateValue: 'Jane from email',
                    provenance: {
                      sourceType: 'email_text',
                      sourceLabel: 'Instruction email body',
                      confidence: 0.72,
                    },
                  },
                  {
                    candidateValue: 'Jane from second document',
                    provenance: {
                      sourceType: 'manual_upload',
                      sourceLabel: 'Second instruction',
                    },
                  },
                ],
              }
            : desc.key === 'vehicleModel'
              ? {
                  conflicts: [{
                    candidateValue: 'Other model',
                    provenance: {
                      sourceType: 'ai',
                      sourceLabel: 'Vehicle comparison',
                      confidence: 0.66,
                    },
                  }],
                }
              : {}),
        },
      ]),
    ) as Record<EvaFieldKey, unknown>;

    const response = await registration('createCase').handler(
      request({
        vrm: 'ZX99ZZZ',
        status: 'ingested',
        sourceLabel: 'Desk intake',
        writeProvenance: false,
        evaFields,
      }),
      context(),
    );

    expect(response).toEqual({ status: 201, jsonBody: { id: 'case-new' } });
    const provenance = callsContaining('INSERT INTO field_level_provenance');
    expect(provenance).toHaveLength(5);
    expect(provenance.map((call) => call[1])).toEqual(expect.arrayContaining([
      [
        'case-new:claimantName',
        'case-new',
        'claimantName',
        'claimantName current',
        100000001,
        'claimantName current source',
        0.91,
        100000002,
      ],
      [
        'case-new:claimantName:conflict:01',
        'case-new',
        'claimantName',
        'Jane from email',
        100000002,
        'Instruction email body',
        0.72,
        100000003,
      ],
      [
        'case-new:claimantName:conflict:02',
        'case-new',
        'claimantName',
        'Jane from second document',
        100000010,
        'Second instruction',
        null,
        100000003,
      ],
      [
        'case-new:vehicleModel',
        'case-new',
        'vehicleModel',
        'vehicleModel current',
        100000003,
        'vehicleModel current source',
        null,
        100000002,
      ],
      [
        'case-new:vehicleModel:conflict:01',
        'case-new',
        'vehicleModel',
        'Other model',
        100000004,
        'Vehicle comparison',
        0.66,
        100000003,
      ],
    ]));

    const sqlCalls = db.query.mock.calls.map(([sql]) => String(sql));
    const caseInsert = sqlCalls.findIndex((sql) => sql.includes('INSERT INTO case_'));
    const claimantCurrent = db.query.mock.calls.findIndex(
      ([sql, params]) => String(sql).includes('INSERT INTO field_level_provenance')
        && (params as unknown[])[2] === 'claimantName'
        && (params as unknown[])[0] === 'case-new:claimantName',
    );
    const otherField = db.query.mock.calls.findIndex(
      ([sql, params]) => String(sql).includes('INSERT INTO field_level_provenance')
        && (params as unknown[])[2] === 'vehicleModel',
    );
    expect(caseInsert).toBeGreaterThanOrEqual(0);
    expect(claimantCurrent).toBeGreaterThan(caseInsert);
    expect(otherField).toBeGreaterThan(claimantCurrent);
  });

  it.each([
    { label: 'without an operation binding', headers: {} },
    {
      label: 'with an operation binding',
      headers: { 'idempotency-key': 'manual-create-claimant-source-only' },
    },
  ])('always commits the claimant source with writeProvenance false $label', async ({ headers }) => {
    const evaFields = Object.fromEntries(
      EVA_FIELD_ORDER.map((desc) => [
        desc.key,
        {
          value:
            desc.key === 'claimantName'
              ? 'Jane Driver'
              : desc.key === 'mileage'
                ? '50000'
              : desc.key === 'vatStatus' || desc.key === 'mileageUnit'
                ? ''
                : `${desc.key} value`,
          provenance: {
            sourceType: desc.key === 'claimantName' ? 'pdf_extraction' : 'manual_upload',
            sourceLabel: `${desc.key} source`,
          },
          reviewState: 'reviewed',
        },
      ]),
    ) as Record<EvaFieldKey, unknown>;

    const response = await registration('createCase').handler(
      request(
        {
          vrm: 'ZX99ZZZ',
          status: 'ingested',
          sourceLabel: 'Desk intake',
          writeProvenance: false,
          evaFields,
        },
        {},
        headers as Record<string, string>,
      ),
      context(),
    );

    expect(response.status).toBe(201);
    const provenance = callsContaining('INSERT INTO field_level_provenance');
    expect(provenance).toHaveLength(1);
    expect(provenance[0]?.[1]).toEqual([
      'case-new:claimantName',
      'case-new',
      'claimantName',
      'Jane Driver',
      100000001,
      'claimantName source',
      null,
      100000002,
    ]);
  });

  it('returns 400 for a malformed full body instead of dereferencing missing evaFields', async () => {
    const res = await registration('createCase').handler(
      request({ vrm: 'AB12CDE', status: 'ingested' }),
      context(),
    );
    expect(res.status).toBe(400);
    expect(res.jsonBody).toEqual({ error: 'invalid case create payload' });
    expect(callsContaining('INSERT INTO case_')).toHaveLength(0);
  });

  it('rejects an invalid minimal proposal before any database call', async () => {
    const res = await registration('createCase').handler(
      request({ vrm: 'AB12CDE', providerCode: 'not a code', claimantName: 'x'.repeat(201) }),
      context(),
    );
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects a syntactically valid but unknown provider code before case creation', async () => {
    const res = await registration('createCase').handler(
      request({ vrm: 'AB12CDE', providerCode: 'MISSING', claimantName: 'Jane Driver' }),
      context(),
    );
    expect(res.status).toBe(400);
    expect(res.jsonBody).toEqual({ error: 'unknown provider principal code' });
    expect(callsContaining('INSERT INTO case_')).toHaveLength(0);
  });

  it('returns the same case for an exact Manual Intake replay without another mint or create audit', async () => {
    const body = { vrm: 'AB12CDE', providerCode: 'QDOS', claimantName: 'Jane Driver' };
    const headers = {
      'idempotency-key': 'manual-create-operation-0001',
      'x-manual-intake-upload-key': 'manual-upload-operation-0001',
      'x-manual-intake-file-count': '1',
      'x-manual-intake-instruction-index': '0',
    };

    const first = await registration('createCase').handler(request(body, {}, headers), context());
    const replay = await registration('createCase').handler(request(body, {}, headers), context());

    expect(first).toEqual({ status: 201, jsonBody: { id: 'case-new' } });
    expect(replay).toEqual({ status: 200, jsonBody: { id: 'case-new', replayed: true } });
    expect(callsContaining('INSERT INTO case_')).toHaveLength(1);
    expect(callsContaining('INSERT INTO audit_event')).toHaveLength(1);
    expect(callsContaining('INSERT INTO field_level_provenance')).toHaveLength(12);
  });

  it('reconciles missing post-create effects on response-loss retry without duplicating the case or audit', async () => {
    const body = { vrm: 'AB12CDE', providerCode: 'QDOS', claimantName: 'Jane Driver' };
    const headers = {
      'idempotency-key': 'manual-create-operation-0009',
      'x-manual-intake-upload-key': 'manual-upload-operation-0009',
      'x-manual-intake-file-count': '1',
      'x-manual-intake-instruction-index': '0',
    };
    const normal = db.query.getMockImplementation()!;
    let failSideEffect = true;
    db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (
        failSideEffect
        && sql.includes('INSERT INTO field_level_provenance')
        && params[2] !== 'claimantName'
      ) {
        failSideEffect = false;
        throw new Error('simulated response-loss boundary');
      }
      return normal(sql, params);
    });

    await expect(registration('createCase').handler(request(body, {}, headers), context()))
      .rejects.toThrow('simulated response-loss boundary');
    const retry = await registration('createCase').handler(request(body, {}, headers), context());

    expect(retry).toEqual({ status: 200, jsonBody: { id: 'case-new', replayed: true } });
    expect(callsContaining('INSERT INTO case_')).toHaveLength(1);
    expect(callsContaining('INSERT INTO audit_event')).toHaveLength(1);
    expect(callsContaining('INSERT INTO field_level_provenance')).toHaveLength(13);
    expect(manualOperations.get('manual-create-operation-0009')?.side_effects_completed_at)
      .toBeInstanceOf(Date);
  });

  it.each([
    { label: 'without an operation binding', headers: {} },
    {
      label: 'with an operation binding',
      headers: {
        'idempotency-key': 'manual-create-operation-claimant-failure',
        'x-manual-intake-upload-key': 'manual-upload-operation-claimant-failure',
        'x-manual-intake-file-count': '1',
        'x-manual-intake-instruction-index': '0',
      },
    },
  ])('fails the original case transaction when claimant provenance fails $label', async ({ headers }) => {
    const normal = db.query.getMockImplementation()!;
    db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (
        sql.includes('INSERT INTO field_level_provenance')
        && params[2] === 'claimantName'
      ) {
        throw new Error('simulated claimant provenance failure');
      }
      return normal(sql, params);
    });

    await expect(registration('createCase').handler(
      request(
        { vrm: 'AB12CDE', providerCode: 'QDOS', claimantName: 'Jane Driver' },
        {},
        headers as Record<string, string>,
      ),
      context(),
    )).rejects.toThrow('simulated claimant provenance failure');

    expect(callsContaining('INSERT INTO case_')).toHaveLength(1);
    expect(callsContaining('INSERT INTO field_level_provenance')).toHaveLength(1);
    expect(callsContaining('SET case_id = $2')).toHaveLength(0);
    expect(callsContaining('INSERT INTO audit_event')).toHaveLength(0);
    expect(callsContaining('SET side_effects_completed_at')).toHaveLength(0);
    const operation = manualOperations.get('manual-create-operation-claimant-failure');
    if (operation) expect(operation.case_id).toBeNull();
  });

  it('refuses one operation key reused for changed case details before another case is inserted', async () => {
    const headers = {
      'idempotency-key': 'manual-create-operation-0002',
      'x-manual-intake-upload-key': 'manual-upload-operation-0002',
      'x-manual-intake-file-count': '1',
    };
    await registration('createCase').handler(
      request({ vrm: 'AB12CDE', providerCode: 'QDOS', claimantName: 'Jane Driver' }, {}, headers),
      context(),
    );
    const conflict = await registration('createCase').handler(
      request({ vrm: 'ZZ99ZZZ', providerCode: 'QDOS', claimantName: 'Jane Driver' }, {}, headers),
      context(),
    );
    expect(conflict.status).toBe(409);
    expect(callsContaining('INSERT INTO case_')).toHaveLength(1);
  });

  it('rejects malformed operation/file bindings before any database write', async () => {
    const response = await registration('createCase').handler(
      request(
        { vrm: 'AB12CDE', providerCode: 'QDOS', claimantName: 'Jane Driver' },
        {},
        {
          'idempotency-key': 'too-short',
          'x-manual-intake-file-count': '1',
        },
      ),
      context(),
    );
    expect(response.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('requeues terminal Manual Intake archive failures and clears their dead-letter state', async () => {
    boxRows = [{ id: 'case-1' }];
    const normal = db.query.getMockImplementation()!;
    db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.startsWith('UPDATE archive_mirror_outbox o')) {
        return [{ evidence_id: 'evidence-1' }, { evidence_id: 'evidence-2' }];
      }
      if (sql.includes('status_recompute_requested_generation')) {
        return [{ status_recompute_requested_generation: 1 }];
      }
      return normal(sql, params);
    });

    const response = await registration('retryManualIntakeArchive').handler(
      request({}, { id: 'case-1' }),
      context(),
    );
    expect(response).toEqual({ status: 200, jsonBody: { requeued: 2 } });
    const update = callsContaining('UPDATE archive_mirror_outbox o')[0];
    expect(String(update[0])).toContain('dead_lettered_at = NULL');
    expect(String(update[0])).toContain('staff_evidence_upload_item item');
    expect(String(update[0])).toContain("batch.source = 'manual_intake'");
    expect(String(update[0])).not.toContain('source_message_id LIKE');
    expect(callsContaining('INSERT INTO audit_event')).toHaveLength(1);
  });
});

describe('POST /api/cases/{id}/box/copy-file-request', () => {
  beforeEach(() => {
    vi.stubEnv('BOX_API_ENABLED', 'true');
    vi.stubEnv('BOX_FILEREQUEST_ENABLED', 'true');
    vi.stubEnv('BOX_FILE_REQUEST_TEMPLATE_ID', '8001');
    boxRows = [
      {
        box_folder_id: '398564730902',
        box_file_request_id: null,
        box_file_request_url: null,
      },
    ];
  });

  it('registers the staff POST route', () => {
    const reg = registration('caseBoxCopyFileRequest');
    expect(reg.methods).toEqual(['POST']);
    expect(reg.route).toBe('cases/{id}/box/copy-file-request');
  });

  it('copies through the facade, stamps id/url, returns fileRequestUrl, and audits', async () => {
    box.copyFileRequest.mockResolvedValue({
      id: '9001',
      url: '/f/abc',
      folder: { id: '398564730902', type: 'folder' },
      status: 'active',
      expires_at: '2026-08-13T12:00:00.000Z',
    });
    const ctx = context();
    const res = await registration('caseBoxCopyFileRequest').handler(
      request({}, { id: 'case-1' }),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual({
      status: 'ok',
      data: {
        fileRequestUrl: 'https://app.box.com/f/abc',
        expiresAt: '2026-08-13T12:00:00.000Z',
      },
    });
    expect(box.copyFileRequest).toHaveBeenCalledOnce();
    expect(box.copyFileRequest).toHaveBeenCalledWith('8001', '398564730902');

    const update = callsContaining('SET box_file_request_id')[0];
    expect(update?.[1]).toEqual([
      'case-1',
      '9001',
      'https://app.box.com/f/abc',
    ]);
    const audit = callsContaining('INSERT INTO audit_event')[0];
    expect((audit?.[1] as unknown[])[3]).toBe(100000020); // box_file_request_copied
    expect((audit?.[1] as unknown[])[0]).toBe('Image-upload link created');
    expect(ctx.error).not.toHaveBeenCalled();
  });

  it('revalidates and returns an existing active link without copying another request', async () => {
    boxRows = [
      {
        box_folder_id: '398564730902',
        box_file_request_id: '9002',
        box_file_request_url: 'https://app.box.com/f/existing',
      },
    ];
    box.getFileRequest.mockResolvedValue({
      id: '9002',
      url: '/f/existing',
      folder: { id: '398564730902', type: 'folder' },
      status: 'active',
      expires_at: '2026-08-13T12:00:00.000Z',
    });
    const res = await registration('caseBoxCopyFileRequest').handler(
      request({}, { id: 'case-1' }),
      context(),
    );
    expect(res.jsonBody).toEqual({
      status: 'ok',
      data: {
        fileRequestUrl: 'https://app.box.com/f/existing',
        expiresAt: '2026-08-13T12:00:00.000Z',
      },
    });
    expect(box.copyFileRequest).not.toHaveBeenCalled();
    expect(box.getFileRequest).toHaveBeenCalledWith('9002', '398564730902');
    expect(
      db.query.mock.calls.filter(([sql]) => /UPDATE case_[\s\S]*SET box_file_request_id/.test(String(sql))),
    ).toHaveLength(0);
    expect(callsContaining('INSERT INTO audit_event')).toHaveLength(0);
  });

  it.each([
    ['malformed response', async () => ({ id: '9001' })],
    ['transport failure', async () => { throw new Error('facade unavailable'); }],
  ])('fails honestly on %s and stamps nothing', async (_label, implementation) => {
    box.copyFileRequest.mockImplementation(implementation);
    const ctx = context();
    const res = await registration('caseBoxCopyFileRequest').handler(
      request({}, { id: 'case-1' }),
      ctx,
    );
    expect(res.jsonBody).toEqual({
      status: 'error',
      message: 'The image-upload link is still being created. Please try again shortly.',
    });
    expect(callsContaining('SET box_file_request_id')).toHaveLength(0);
    expect(callsContaining('INSERT INTO audit_event')).toHaveLength(0);
    expect(outboxRow).toMatchObject({ requested_generation: 1, completed_generation: 0 });
    expect(ctx.error).not.toHaveBeenCalled();
  });

  it('reports folder_not_ready without calling the facade', async () => {
    boxRows = [{ box_folder_id: null, box_file_request_id: null, box_file_request_url: null }];
    const res = await registration('caseBoxCopyFileRequest').handler(
      request({}, { id: 'case-1' }),
      context(),
    );
    expect(res.jsonBody).toEqual({
      status: 'folder_not_ready',
      message: 'This case has no archive folder yet.',
    });
    expect(box.copyFileRequest).not.toHaveBeenCalled();
  });
});

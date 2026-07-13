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

function request(body: unknown, params: Record<string, string> = {}): HttpRequest {
  return {
    params,
    json: async () => body,
    headers: { get: () => null },
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

  db.tx.mockImplementation(async (fn: (q: typeof db.query) => unknown) => fn(db.query));
  db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
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

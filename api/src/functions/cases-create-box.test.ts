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

const box = vi.hoisted(() => ({ copyFileRequest: vi.fn(), listFolderNames: vi.fn() }));
vi.mock('../lib/functions-client.js', () => ({
  callBoxCopyFileRequest: box.copyFileRequest,
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

beforeEach(() => {
  vi.unstubAllEnvs();
  db.query.mockReset();
  db.tx.mockReset();
  box.copyFileRequest.mockReset();
  box.listFolderNames.mockReset();
  boxRows = [];

  db.tx.mockImplementation(async (fn: (q: typeof db.query) => unknown) => fn(db.query));
  db.query.mockImplementation(async (sql: string) => {
    if (sql.includes('box_file_request_id') && sql.includes('FOR UPDATE')) return boxRows;
    if (sql.includes('INSERT INTO case_')) return [{ id: 'case-new' }];
    // Recompute after create sees no row in this focused harness and exits cleanly.
    if (sql.includes('FROM case_ c') && sql.includes('WHERE c.id')) return [];
    if (sql.includes('SELECT id FROM work_provider')) return [{ id: 'provider-1' }];
    return [];
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
});

describe('POST /api/cases/{id}/box/copy-file-request', () => {
  beforeEach(() => {
    vi.stubEnv('BOX_API_ENABLED', 'true');
    vi.stubEnv('BOX_FILEREQUEST_ENABLED', 'true');
    vi.stubEnv('BOX_FILE_REQUEST_TEMPLATE_ID', 'template-1');
    boxRows = [
      {
        box_folder_id: 'folder-1',
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
      id: 'file-request-1',
      url: 'https://upload.box.com/request/abc',
      status: 'active',
    });
    const ctx = context();
    const res = await registration('caseBoxCopyFileRequest').handler(
      request({}, { id: 'case-1' }),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual({
      status: 'ok',
      data: { fileRequestUrl: 'https://upload.box.com/request/abc' },
    });
    expect(box.copyFileRequest).toHaveBeenCalledOnce();
    expect(box.copyFileRequest).toHaveBeenCalledWith('template-1', 'folder-1');

    const update = callsContaining('SET box_file_request_id')[0];
    expect(update?.[1]).toEqual([
      'case-1',
      'file-request-1',
      'https://upload.box.com/request/abc',
    ]);
    const audit = callsContaining('INSERT INTO audit_event')[0];
    expect((audit?.[1] as unknown[])[3]).toBe(100000020); // box_file_request_copied
    expect((audit?.[1] as unknown[])[0]).toBe('Image-upload link created');
    expect(ctx.error).not.toHaveBeenCalled();
  });

  it('returns an existing stamped link without calling or updating Box', async () => {
    boxRows = [
      {
        box_folder_id: 'folder-1',
        box_file_request_id: 'file-request-existing',
        box_file_request_url: 'https://upload.box.com/request/existing',
      },
    ];
    const res = await registration('caseBoxCopyFileRequest').handler(
      request({}, { id: 'case-1' }),
      context(),
    );
    expect(res.jsonBody).toEqual({
      status: 'ok',
      data: { fileRequestUrl: 'https://upload.box.com/request/existing' },
    });
    expect(box.copyFileRequest).not.toHaveBeenCalled();
    expect(callsContaining('SET box_file_request_id')).toHaveLength(0);
    expect(callsContaining('INSERT INTO audit_event')).toHaveLength(0);
  });

  it.each([
    ['malformed response', async () => ({ id: 'file-request-1' })],
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
      message: 'The image-upload link could not be created. Please try again.',
    });
    expect(callsContaining('SET box_file_request_id')).toHaveLength(0);
    expect(callsContaining('INSERT INTO audit_event')).toHaveLength(0);
    expect(ctx.error).toHaveBeenCalledOnce();
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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

interface Reg {
  handler: (
    req: HttpRequest,
    ctx: InvocationContext,
    claims: Record<string, unknown>,
  ) => Promise<HttpResponseInit>;
}

const registrations = vi.hoisted(() => new Map<string, Reg>());
const requiredRoles = vi.hoisted(() => [] as string[]);
vi.mock('@azure/functions', () => ({
  app: { http: (name: string, opts: Reg) => registrations.set(name, opts) },
}));
vi.mock('../lib/auth.js', () => ({
  withRole: (role: string, handler: Reg['handler']) => {
    requiredRoles.push(role);
    return handler;
  },
}));

const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn(), txQuery: vi.fn() }));
vi.mock('../lib/db.js', () => ({ query: db.query, tx: db.tx }));
const blob = vi.hoisted(() => ({ uploadEvidenceBytes: vi.fn() }));
vi.mock('../lib/blob.js', () => ({
  uploadEvidenceBytes: blob.uploadEvidenceBytes,
  evidenceBlobPath: (prefix: string, name: string) => `${prefix}/${name}`,
}));
vi.mock('../lib/audit.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/audit.js')>();
  return { ...actual, actorFromClaims: vi.fn(() => 'staff-1') };
});

const evidenceUploadModule = await import('./evidence-upload.js');
const upload = registrations.get('uploadCaseEvidence')!.handler;
const uploadFromMcp = evidenceUploadModule.handleEvidenceUpload;
const ctx = { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;

const KEY = '00000000-0000-4000-8000-000000000165';
const JPEG = new Uint8Array(Buffer.from(
  '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAB//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AI4BJH7/2Q==',
  'base64',
));
function pdfFixture(objectBody = '<<>>'): ArrayBuffer {
  const prefix = `%PDF-1.7\n1 0 obj\n${objectBody}\nendobj\n`;
  const xrefOffset = new TextEncoder().encode(prefix).length;
  const encoded = new TextEncoder().encode(
    `${prefix}xref\n0 1\n0000000000 65535 f\ntrailer\n` +
    `<< /Size 1 >>\nstartxref\n${xrefOffset}\n%%EOF`,
  );
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
}
const PDF = pdfFixture();

interface BatchRow {
  case_id: string;
  actor: string;
  source: string;
  registration: string | null;
  manifest_hash: string;
}
interface EvidenceRow {
  id: string;
  case_id: string;
  sha256: string;
  source_message_id: string;
  excluded: boolean;
  storage_path: string;
  box_file_id: null;
  kind_code: number;
}
interface ItemRow {
  id: string;
  idempotency_key: string;
  item_index: number;
  case_id: string;
  sha256: string;
  file_name: string;
  content_type: string;
  blob_path: string;
  state: string;
  evidence_id: string | null;
  upload_claim_token: string | null;
}

const state = {
  batches: new Map<string, BatchRow>(),
  evidence: [] as EvidenceRow[],
  items: [] as ItemRow[],
  audits: 0,
  archiveRequests: 0,
  statusRequests: 0,
  nextEvidence: 1,
  statusCode: 100000001,
  mergedInto: '' as string,
  caseMissing: false,
  archiveFailure: false,
  hideTwinUntilUpload: false,
  mergeAfterUpload: false,
  manualCompletionAttempts: 0,
  manualCompletionMode: 'completed' as 'completed' | 'already_complete' | 'not_bound',
  lastManualUploadKey: KEY,
  lastManualFileCount: 0,
  recoveryAuditClaimed: false,
  blobPaths: new Set<string>(),
  registrationCaseIds: ['case-1'] as string[],
};

function restore(snapshot: ReturnType<typeof snapshotState>): void {
  state.batches = new Map(snapshot.batches);
  state.evidence = snapshot.evidence.map((row) => ({ ...row }));
  state.items = snapshot.items.map((row) => ({ ...row }));
  state.audits = snapshot.audits;
  state.archiveRequests = snapshot.archiveRequests;
  state.statusRequests = snapshot.statusRequests;
  state.nextEvidence = snapshot.nextEvidence;
  state.manualCompletionAttempts = snapshot.manualCompletionAttempts;
  state.manualCompletionMode = snapshot.manualCompletionMode;
  state.lastManualUploadKey = snapshot.lastManualUploadKey;
  state.lastManualFileCount = snapshot.lastManualFileCount;
  state.recoveryAuditClaimed = snapshot.recoveryAuditClaimed;
}

function snapshotState() {
  return {
    batches: new Map(state.batches),
    evidence: state.evidence.map((row) => ({ ...row })),
    items: state.items.map((row) => ({ ...row })),
    audits: state.audits,
    archiveRequests: state.archiveRequests,
    statusRequests: state.statusRequests,
    nextEvidence: state.nextEvidence,
    manualCompletionAttempts: state.manualCompletionAttempts,
    manualCompletionMode: state.manualCompletionMode,
    lastManualUploadKey: state.lastManualUploadKey,
    lastManualFileCount: state.lastManualFileCount,
    recoveryAuditClaimed: state.recoveryAuditClaimed,
  };
}

function requestWith(
  files: File[],
  options: {
    caseId?: string;
    key?: string;
    source?: string;
    legacy?: boolean;
    roles?: Array<'instruction' | 'extra'>;
    manualIntakeOperation?: boolean;
    instructionIndex?: number;
  } = {},
): HttpRequest {
  const form = new FormData();
  for (const file of files) form.append('file', file);
  if (!options.legacy) form.append('source', options.source ?? 'add_evidence');
  const roles = options.roles ?? (options.manualIntakeOperation
    ? files.map((_file, index) => index === (options.instructionIndex ?? 0) ? 'instruction' : 'extra')
    : []);
  for (const role of roles) form.append('fileRole', role);
  if (options.manualIntakeOperation) {
    form.append('manualIntakeOperation', 'true');
    form.append('manualIntakeInstructionIndex', String(options.instructionIndex ?? 0));
  }
  return {
    params: { id: options.caseId ?? 'case-1' },
    headers: new Headers(options.legacy ? {} : { 'idempotency-key': options.key ?? KEY }),
    formData: async () => form,
  } as unknown as HttpRequest;
}

beforeEach(() => {
  state.batches = new Map();
  state.evidence = [];
  state.items = [];
  state.audits = 0;
  state.archiveRequests = 0;
  state.statusRequests = 0;
  state.nextEvidence = 1;
  state.statusCode = 100000001;
  state.mergedInto = '';
  state.caseMissing = false;
  state.archiveFailure = false;
  state.hideTwinUntilUpload = false;
  state.mergeAfterUpload = false;
  state.manualCompletionAttempts = 0;
  state.manualCompletionMode = 'completed';
  state.lastManualUploadKey = KEY;
  state.lastManualFileCount = 1;
  state.recoveryAuditClaimed = false;
  state.blobPaths = new Set();
  state.registrationCaseIds = ['case-1'];
  db.query.mockReset();
  db.tx.mockReset();
  db.txQuery.mockReset();
  blob.uploadEvidenceBytes.mockReset();

  db.tx.mockImplementation(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => {
    const snapshot = snapshotState();
    try {
      return await fn(db.txQuery);
    } catch (error) {
      restore(snapshot);
      throw error;
    }
  });
  db.txQuery.mockImplementation(async (sqlValue: string, params: unknown[] = []) => {
    const sql = String(sqlValue);
    if (sql.includes('pg_advisory_xact_lock')) return [];
    if (sql.includes("regexp_replace(upper(vrm)")) {
      return state.registrationCaseIds.map((id) => ({
        id,
        status_code: state.statusCode,
        duplicate_keys: null,
      }));
    }
    if (sql.startsWith('SELECT id, duplicate_keys FROM case_')) {
      if (state.caseMissing) return [];
      return [{
        id: String(params[0]),
        duplicate_keys: state.mergedInto ? JSON.stringify({ mergedInto: state.mergedInto }) : null,
      }];
    }
    if (sql === 'SELECT status_code FROM case_ WHERE id = $1') return [{ status_code: state.statusCode }];
    if (sql.includes('INSERT INTO staff_evidence_upload_item')) {
      const key = String(params[0]);
      const index = Number(params[1]);
      if (!state.items.some((item) => item.idempotency_key === key && item.item_index === index)) {
        state.items.push({
          id: `item-${state.items.length + 1}`,
          idempotency_key: key,
          item_index: index,
          case_id: String(params[2]),
          sha256: String(params[3]),
          file_name: String(params[4]),
          content_type: String(params[5]),
          blob_path: String(params[6]),
          state: 'reserved',
          evidence_id: null,
          upload_claim_token: null,
        });
      }
      return [];
    }
    if (sql.includes('INSERT INTO staff_evidence_upload')) {
      const key = String(params[0]);
      if (!state.batches.has(key)) {
        state.batches.set(key, {
          case_id: String(params[1]),
          actor: String(params[2]),
          source: String(params[3]),
          registration: params[4] == null ? null : String(params[4]),
          manifest_hash: String(params[5]),
        });
      }
      return [];
    }
    if (
      sql.includes('FROM staff_evidence_upload')
      && !sql.includes('FROM staff_evidence_upload_item')
      && sql.includes('FOR UPDATE')
    ) {
      const row = state.batches.get(String(params[0]));
      return row ? [row] : [];
    }
    if (sql.includes('FROM staff_evidence_upload_item') && sql.includes('idempotency_key = $1')) {
      const item = state.items.find(
        (row) => row.idempotency_key === String(params[0]) && row.item_index === Number(params[1]),
      );
      return item ? [item] : [];
    }
    if (sql.includes("SET state = 'uploading'")) {
      const item = state.items.find((row) => row.id === params[0]);
      if (!item || !['reserved', 'cleaned'].includes(item.state)) return [];
      item.state = 'uploading';
      item.upload_claim_token = String(params[1]);
      item.blob_path = String(params[2]);
      return [{ id: item.id, blob_path: item.blob_path }];
    }
    if (sql.includes('FROM staff_evidence_upload_item') && sql.includes("state = 'uploading'")) {
      const token = params.length >= 3 ? params[2] : params[1];
      const item = state.items.find(
        (row) => row.id === params[0] && row.upload_claim_token === token && row.state === 'uploading',
      );
      return item ? [item] : [];
    }
    if (sql.includes('WHERE source_message_id = $1')) {
      const row = state.evidence.find((item) => item.source_message_id === params[0]);
      return row ? [row] : [];
    }
    if (sql.includes('WHERE case_id = $1 AND sha256 = $2')) {
      if (state.hideTwinUntilUpload) return [];
      const row = state.evidence.find(
        (item) => item.case_id === params[0] && item.sha256 === params[1],
      );
      return row ? [{ id: row.id, storage_path: row.storage_path, kind_code: row.kind_code }] : [];
    }
    if (sql.includes('FROM evidence WHERE storage_path = $1')) {
      const row = state.evidence.find((item) => item.storage_path === params[0]);
      return row ? [{ id: row.id }] : [];
    }
    if (sql.includes('INSERT INTO evidence')) {
      const row: EvidenceRow = {
        id: `ev-${state.nextEvidence++}`,
        case_id: String(params[1]),
        sha256: String(params[3]),
        source_message_id: String(params[7]),
        excluded: params[10] === true,
        storage_path: String(params[6]),
        box_file_id: null,
        kind_code: Number(params[2]),
      };
      state.evidence.push(row);
      return [row];
    }
    if (sql.includes('INSERT INTO archive_mirror_outbox')) {
      if (state.archiveFailure) throw new Error('archive outbox unavailable');
      state.archiveRequests++;
      return [{ requested_generation: 1 }];
    }
    if (sql.includes('status_recompute_requested_generation')) {
      state.statusRequests++;
      return [{ status_recompute_requested_generation: state.statusRequests }];
    }
    if (sql.includes('INSERT INTO audit_event')) {
      state.audits++;
      return [];
    }
    if (sql.includes('UPDATE staff_evidence_upload_item')) {
      const item = state.items.find((row) => row.id === params[0]);
      if (!item) return [];
      if (sql.includes("state = 'complete'")) {
        item.state = 'complete';
        item.evidence_id = String(params[1] ?? params[2]);
        item.upload_claim_token = null;
      } else if (sql.includes("state = 'cleanup_pending'")) {
        item.state = 'cleanup_pending';
        item.upload_claim_token = null;
      } else if (sql.includes('SET state = $2')) {
        item.state = String(params[1]);
        item.evidence_id = String(params[2]);
        item.upload_claim_token = null;
      }
      return [];
    }
    if (sql.includes('UPDATE staff_evidence_upload')) return [];
    if (sql.includes('response_loss_recovery_audited_at = now()')) {
      if (state.manualCompletionMode !== 'already_complete' || state.recoveryAuditClaimed) return [];
      state.recoveryAuditClaimed = true;
      return [{ idempotency_key: 'manual-create-operation' }];
    }
    if (sql.includes('UPDATE manual_intake_case_create_operation')) {
      state.manualCompletionAttempts++;
      state.lastManualUploadKey = String(params[1]);
      state.lastManualFileCount = Number(params[2]);
      if (state.manualCompletionMode !== 'completed') return [];
      state.manualCompletionMode = 'already_complete';
      return [{ idempotency_key: 'manual-create-operation' }];
    }
    if (sql.includes('SELECT upload_idempotency_key') && sql.includes('manual_intake_case_create_operation')) {
      return state.manualCompletionMode === 'already_complete'
        ? [{
            upload_idempotency_key: state.lastManualUploadKey,
            expected_file_count: state.lastManualFileCount,
            instruction_file_index: 0,
            evidence_completed_at: new Date(),
          }]
        : state.manualCompletionMode === 'completed'
          ? [{
            upload_idempotency_key: state.lastManualUploadKey,
            expected_file_count: state.lastManualFileCount,
            instruction_file_index: 0,
            evidence_completed_at: null,
          }]
          : [{
            upload_idempotency_key: 'different-upload-key-0001',
            expected_file_count: state.lastManualFileCount,
            instruction_file_index: 0,
            evidence_completed_at: null,
          }];
    }
    return [];
  });
  blob.uploadEvidenceBytes.mockImplementation(async (prefix: string, name: string, bytes: Buffer) => {
    state.hideTwinUntilUpload = false;
    if (state.mergeAfterUpload) state.mergedInto = 'case-2';
    const blobPath = `${prefix}/${name}`;
    state.blobPaths.add(blobPath);
    return { blobPath, size: bytes.length };
  });
});

describe('canonical staff evidence upload', () => {
  it('is registered behind the staff app role', () => {
    expect(requiredRoles).toContain('CollisionSpike.User');
  });

  it('accepts the MCP source only through the internal role-checked seam and writes an agent audit', async () => {
    const staffRequest = requestWith(
      [new File([JPEG], 'photo.jpg', { type: 'image/jpeg' })],
      { source: 'mcp_agent' },
    );
    const forged = await upload(staffRequest, ctx, {});
    expect(forged.status).toBe(400);
    expect(blob.uploadEvidenceBytes).not.toHaveBeenCalled();

    const baseRequest = requestWith(
      [new File([JPEG], 'photo.jpg', { type: 'image/jpeg' })],
      { source: 'mcp_agent' },
    );
    const request = {
      params: baseRequest.params,
      headers: baseRequest.headers,
      formData: async () => {
        const form = await baseRequest.formData();
        form.append('registration', 'SP23OBX');
        return form;
      },
    } as unknown as HttpRequest;
    const response = await uploadFromMcp(request, ctx, { oid: 'sp-image-agent' }, {
      allowMcpAgentSource: true,
    });
    expect(response.status).toBe(201);
    expect(db.txQuery.mock.calls.some(([sql]) => String(sql) === 'LOCK TABLE case_ IN SHARE MODE')).toBe(true);
    expect(state.evidence[0].source_message_id).toContain('staff:mcp_agent:');
    const audit = db.txQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO audit_event'))!;
    expect(audit[1][3]).toBe(100000051);
    expect(audit[1][6]).toContain('"registration":"SP23OBX"');
    expect(audit[1][6]).toContain('"idempotencyKey"');
  });

  it('refuses an MCP upload when the registration no longer matches under the transaction lock', async () => {
    state.registrationCaseIds = [];
    const baseRequest = requestWith(
      [new File([JPEG], 'photo.jpg', { type: 'image/jpeg' })],
      { source: 'mcp_agent' },
    );
    const request = {
      params: baseRequest.params,
      headers: baseRequest.headers,
      formData: async () => {
        const form = await baseRequest.formData();
        form.append('registration', 'SP23OBX');
        return form;
      },
    } as unknown as HttpRequest;

    const response = await uploadFromMcp(request, ctx, { oid: 'sp-image-agent' }, {
      allowMcpAgentSource: true,
    });
    expect(response.status).toBe(409);
    expect(response.jsonBody).toMatchObject({
      added: [],
      rejected: [{ reason: expect.stringContaining('no longer identifies one current case') }],
    });
    expect(blob.uploadEvidenceBytes).not.toHaveBeenCalled();
  });

  it('refuses an MCP upload when a second active case appears before binding', async () => {
    state.registrationCaseIds = ['case-1', 'case-2'];
    const baseRequest = requestWith(
      [new File([JPEG], 'photo.jpg', { type: 'image/jpeg' })],
      { source: 'mcp_agent' },
    );
    const request = {
      params: baseRequest.params,
      headers: baseRequest.headers,
      formData: async () => {
        const form = await baseRequest.formData();
        form.append('registration', 'SP23OBX');
        return form;
      },
    } as unknown as HttpRequest;

    const response = await uploadFromMcp(request, ctx, { oid: 'sp-image-agent' }, {
      allowMcpAgentSource: true,
    });
    expect(response.status).toBe(409);
    expect(blob.uploadEvidenceBytes).not.toHaveBeenCalled();
  });

  it('persists an Add evidence photo in a classifier-owned pending state with one audit and readiness request', async () => {
    const response = await upload(
      requestWith([new File([JPEG], 'photo.jpg', { type: 'image/jpeg' })]),
      ctx,
      {},
    );

    expect(response.status).toBe(201);
    expect(response.jsonBody).toMatchObject({
      added: [{ fileName: 'photo.jpg', evidenceId: 'ev-1', duplicate: false }],
      rejected: [],
    });
    const insert = db.txQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO evidence'))!;
    expect(insert[1]).toEqual(expect.arrayContaining([
      'staff_add_evidence', false, true, 'Image check pending', 'classifier',
    ]));
    expect(state.archiveRequests).toBe(1); // inert until the classifier releases a later generation
    expect(state.statusRequests).toBe(1);
    expect(state.audits).toBe(1);
  });

  it('archives a PDF durably and labels it as Add evidence rather than assistant work', async () => {
    const response = await upload(
      requestWith([new File([PDF], 'instruction.pdf', { type: 'application/pdf' })]),
      ctx,
      {},
    );

    expect(response.status).toBe(201);
    expect(state.archiveRequests).toBe(1);
    expect(state.statusRequests).toBe(1);
    const insert = db.txQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO evidence'))!;
    expect(insert[1]).toContain('staff_add_evidence');
    const audit = db.txQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO audit_event'))!;
    expect(audit[1]?.[0]).toContain('through Add evidence');
    expect(audit[1]?.[0]).not.toMatch(/assistant/i);
  });

  it('binds Manual Intake roles into the manifest and persists only the selected PDF as instruction', async () => {
    const response = await upload(
      requestWith(
        [
          new File([PDF], 'instruction.pdf', { type: 'application/pdf' }),
          new File([pdfFixture('<< /Extra true >>')], 'estimate.pdf', { type: 'application/pdf' }),
          new File([JPEG], 'overview.jpg', { type: 'image/jpeg' }),
        ],
        {
          source: 'manual_intake',
          roles: ['instruction', 'extra', 'extra'],
        },
      ),
      ctx,
      {},
    );
    expect(response.status).toBe(201);
    const inserts = db.txQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO evidence'));
    expect(inserts.map((call) => call[1]?.[2])).toEqual([
      100000002, // selected instruction
      100000006, // extra PDF -> other document
      100000000, // photo
    ]);

    const changedRole = await upload(
      requestWith(
        [
          new File([PDF], 'instruction.pdf', { type: 'application/pdf' }),
          new File([pdfFixture('<< /Extra true >>')], 'estimate.pdf', { type: 'application/pdf' }),
          new File([JPEG], 'overview.jpg', { type: 'image/jpeg' }),
        ],
        {
          source: 'manual_intake',
          roles: ['extra', 'instruction', 'extra'],
        },
      ),
      ctx,
      {},
    );
    expect(changedRole.status).toBe(409);
    expect(blob.uploadEvidenceBytes).toHaveBeenCalledTimes(3);
  });

  it('rejects missing, multiple, or inconsistent Manual Intake roles before Blob writes', async () => {
    const pdf = new File([PDF], 'instruction.pdf', { type: 'application/pdf' });
    const missing = await upload(requestWith([pdf], {
      source: 'manual_intake', manualIntakeOperation: true, roles: [],
    }), ctx, {});
    expect(missing.status).toBe(400);

    const multipleInstructions = await upload(requestWith([
      pdf,
      new File([pdfFixture('<< /Other true >>')], 'other.pdf', { type: 'application/pdf' }),
    ], {
      source: 'manual_intake', manualIntakeOperation: true,
      roles: ['instruction', 'instruction'], instructionIndex: 0,
    }), ctx, {});
    expect(multipleInstructions.status).toBe(400);
    expect(blob.uploadEvidenceBytes).not.toHaveBeenCalled();
  });

  it('releases the Manual Intake readiness blocker only after every selected file is confirmed', async () => {
    const complete = await upload(
      requestWith(
        [new File([PDF], 'instruction.pdf', { type: 'application/pdf' })],
        {
          source: 'manual_intake',
          roles: ['instruction'],
          manualIntakeOperation: true,
        },
      ),
      ctx,
      {},
    );
    expect(complete.status).toBe(201);
    expect(state.manualCompletionAttempts).toBe(1);
    expect(state.statusRequests).toBe(2); // file persisted, then source-batch blocker released
    expect(db.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO audit_event'))?.[1])
      .toEqual(expect.arrayContaining([
        expect.stringContaining('New case files confirmed'),
        'case-1',
        'staff-1',
        100000055,
      ]));

    state.manualCompletionAttempts = 0;
    db.query.mockClear();
    const partial = await upload(
      requestWith(
        [
          new File([PDF], 'instruction-2.pdf', { type: 'application/pdf' }),
          new File(['not an image'], 'broken.jpg', { type: 'image/jpeg' }),
        ],
        { source: 'manual_intake', key: '00000000-0000-4000-8000-000000000199' },
      ),
      ctx,
      {},
    );
    expect(partial.status).toBe(207);
    expect(state.manualCompletionAttempts).toBe(0);
    expect(db.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO audit_event'))?.[1]?.[0])
      .toContain('need attention');
  });

  it('audits eventual recovery distinctly from the first persisted evidence result', async () => {
    const makeRequest = () => requestWith(
      [new File([PDF], 'instruction.pdf', { type: 'application/pdf' })],
      {
        source: 'manual_intake',
        roles: ['instruction'],
        manualIntakeOperation: true,
      },
    );
    await upload(makeRequest(), ctx, {});
    db.query.mockClear();

    const replay = await upload(makeRequest(), ctx, {});
    expect(replay.status).toBe(200);
    const firstRecoveryAudits = db.txQuery.mock.calls.filter(([sql, params]) =>
      String(sql).includes('INSERT INTO audit_event')
      && String(params?.[0]).includes('after response loss'));
    expect(firstRecoveryAudits).toHaveLength(1);

    await upload(makeRequest(), ctx, {});
    const recoveryAudits = db.txQuery.mock.calls.filter(([sql, params]) =>
      String(sql).includes('INSERT INTO audit_event')
      && String(params?.[0]).includes('after response loss'));
    expect(recoveryAudits).toHaveLength(1);
  });

  it('returns an honest conflict when files persisted but a rebound Manual Intake operation did not complete', async () => {
    state.manualCompletionMode = 'not_bound';
    const response = await upload(
      requestWith(
        [new File([PDF], 'instruction.pdf', { type: 'application/pdf' })],
        {
          source: 'manual_intake',
          roles: ['instruction'],
          manualIntakeOperation: true,
        },
      ),
      ctx,
      {},
    );
    expect(response.status).toBe(409);
    expect(response.jsonBody).toMatchObject({
      added: [],
      rejected: [{ reason: 'This retry no longer matches the selected files.' }],
      manualIntakeCompletion: 'not_bound',
    });
    expect(state.statusRequests).toBe(0); // stale binding is rejected before Blob/evidence writes
  });

  it('treats an exact already-completed Manual Intake replay as successful', async () => {
    state.manualCompletionMode = 'already_complete';
    const response = await upload(
      requestWith(
        [new File([PDF], 'instruction.pdf', { type: 'application/pdf' })],
        {
          source: 'manual_intake',
          roles: ['instruction'],
          manualIntakeOperation: true,
        },
      ),
      ctx,
      {},
    );
    expect(response.status).toBe(201);
    expect(response.jsonBody).toMatchObject({ manualIntakeCompletion: 'already_complete' });
  });

  it('replays an exact idempotency key without another Blob write, row, archive request or audit', async () => {
    const makeRequest = () => requestWith([new File([PDF], 'instruction.pdf', { type: 'application/pdf' })]);
    const first = await upload(makeRequest(), ctx, {});
    const second = await upload(makeRequest(), ctx, {});

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.jsonBody).toMatchObject({
      added: [{ evidenceId: 'ev-1', duplicate: true }],
      rejected: [],
    });
    expect(blob.uploadEvidenceBytes).toHaveBeenCalledTimes(1);
    expect(state.evidence).toHaveLength(1);
    expect(state.archiveRequests).toBe(1);
    expect(state.audits).toBe(1);
  });

  it('deduplicates the same content on the same case even under a fresh retry key', async () => {
    const first = await upload(
      requestWith([new File([PDF], 'one.pdf', { type: 'application/pdf' })]),
      ctx,
      {},
    );
    const second = await upload(
      requestWith(
        [new File([PDF], 'renamed.pdf', { type: 'application/pdf' })],
        { key: '00000000-0000-4000-8000-000000000166' },
      ),
      ctx,
      {},
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(state.evidence).toHaveLength(1);
    expect(blob.uploadEvidenceBytes).toHaveBeenCalledTimes(1);
    expect(state.audits).toBe(1);
  });

  it('binds an idempotency key to one case and manifest before any bytes are stored', async () => {
    const first = await upload(
      requestWith([new File([PDF], 'one.pdf', { type: 'application/pdf' })]),
      ctx,
      {},
    );
    const changedTarget = await upload(
      requestWith([new File([PDF], 'one.pdf', { type: 'application/pdf' })], { caseId: 'case-2' }),
      ctx,
      {},
    );
    const changedManifest = await upload(
      requestWith([
        new File([pdfFixture('<< /Changed true >>')], 'changed.pdf', {
          type: 'application/pdf',
        }),
      ]),
      ctx,
      {},
    );

    expect(first.status).toBe(201);
    expect(changedTarget.status).toBe(409);
    expect(changedManifest.status).toBe(409);
    expect(blob.uploadEvidenceBytes).toHaveBeenCalledTimes(1);
    expect(state.evidence).toHaveLength(1);
  });

  it('rejects merged and terminal targets before Blob storage', async () => {
    state.mergedInto = 'case-2';
    const merged = await upload(
      requestWith([new File([JPEG], 'photo.jpg', { type: 'image/jpeg' })]),
      ctx,
      {},
    );
    expect(merged.status).toBe(409);
    expect(merged.jsonBody).toMatchObject({ targetCaseId: 'case-2' });
    expect(blob.uploadEvidenceBytes).not.toHaveBeenCalled();

    state.mergedInto = '';
    state.statusCode = 100000011; // removed
    const removed = await upload(
      requestWith([new File([JPEG], 'photo.jpg', { type: 'image/jpeg' })]),
      ctx,
      {},
    );
    expect(removed.status).toBe(409);
    expect(blob.uploadEvidenceBytes).not.toHaveBeenCalled();

    state.statusCode = 100000010; // error
    const errorCase = await upload(
      requestWith([new File([JPEG], 'photo.jpg', { type: 'image/jpeg' })]),
      ctx,
      {},
    );
    expect(errorCase.status).toBe(409);
    expect(blob.uploadEvidenceBytes).not.toHaveBeenCalled();
  });

  it('uses byte signatures to refuse masquerading content while preserving a valid file in a mixed batch', async () => {
    const response = await upload(
      requestWith([
        new File([new TextEncoder().encode('<script>')], 'fake.jpg', { type: 'image/jpeg' }),
        new File([PDF], 'good.pdf', { type: 'application/pdf' }),
      ]),
      ctx,
      {},
    );

    expect(response.status).toBe(207);
    expect(response.jsonBody).toMatchObject({
      added: [{ fileName: 'good.pdf', evidenceId: 'ev-1' }],
      rejected: [{ fileName: 'fake.jpg' }],
    });
    expect(blob.uploadEvidenceBytes).toHaveBeenCalledTimes(1);
  });

  it('returns original indexes so duplicate filenames remain distinguishable', async () => {
    const response = await upload(
      requestWith([
        new File([new TextEncoder().encode('<script>')], 'photo.jpg', { type: 'image/jpeg' }),
        new File([JPEG], 'photo.jpg', { type: 'image/jpeg' }),
      ]),
      ctx,
      {},
    );

    expect(response.status).toBe(207);
    expect(response.jsonBody).toMatchObject({
      added: [{ fileIndex: 1, fileName: 'photo.jpg', evidenceId: 'ev-1' }],
      rejected: [{ fileIndex: 0, fileName: 'photo.jpg' }],
    });
  });

  it('rolls back evidence, audit and readiness if durable archive work cannot commit', async () => {
    state.archiveFailure = true;
    const response = await upload(
      requestWith([new File([PDF], 'instruction.pdf', { type: 'application/pdf' })]),
      ctx,
      {},
    );

    expect(response.status).toBe(400);
    expect(response.jsonBody).toMatchObject({ added: [], rejected: [{ fileName: 'instruction.pdf' }] });
    expect(state.evidence).toHaveLength(0);
    expect(state.audits).toBe(0);
    expect(state.statusRequests).toBe(0);
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ state: 'cleanup_pending', evidence_id: null });
    expect(state.items[0].blob_path).toContain('instruction.pdf');
  });

  it('keeps a stale-target Blob discoverable for durable cleanup', async () => {
    state.mergeAfterUpload = true;
    const response = await upload(
      requestWith([new File([PDF], 'instruction.pdf', { type: 'application/pdf' })]),
      ctx,
      {},
    );

    expect(response.status).toBe(409);
    expect(response.jsonBody).toMatchObject({ targetCaseId: 'case-2' });
    expect(state.evidence).toHaveLength(0);
    expect(state.items[0]).toMatchObject({ state: 'cleanup_pending', evidence_id: null });
  });

  it('records a fresh-key same-SHA race as cleanup-owned rather than orphaning its Blob', async () => {
    const first = await upload(
      requestWith([new File([PDF], 'one.pdf', { type: 'application/pdf' })]),
      ctx,
      {},
    );
    state.hideTwinUntilUpload = true;
    const second = await upload(
      requestWith(
        [new File([PDF], 'raced.pdf', { type: 'application/pdf' })],
        { key: '00000000-0000-4000-8000-000000000166' },
      ),
      ctx,
      {},
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(state.evidence).toHaveLength(1);
    expect(blob.uploadEvidenceBytes).toHaveBeenCalledTimes(2);
    expect(state.items[1]).toMatchObject({ state: 'cleanup_pending', evidence_id: 'ev-1' });
    expect(state.items[1].blob_path).not.toBe(state.evidence[0].storage_path);

    const retryWhileCleanupOwnsPath = await upload(
      requestWith(
        [new File([PDF], 'raced.pdf', { type: 'application/pdf' })],
        { key: '00000000-0000-4000-8000-000000000166' },
      ),
      ctx,
      {},
    );
    expect(retryWhileCleanupOwnsPath.status).toBe(400);
    expect(state.items[1].state).toBe('cleanup_pending');
    expect(blob.uploadEvidenceBytes).toHaveBeenCalledTimes(2);
  });

  it('allows only one exact-key concurrent request to own the Blob write', async () => {
    let releaseUpload!: () => void;
    const held = new Promise<void>((resolve) => { releaseUpload = resolve; });
    blob.uploadEvidenceBytes.mockImplementationOnce(async (prefix: string, name: string, bytes: Buffer) => {
      await held;
      return { blobPath: `${prefix}/${name}`, size: bytes.length };
    });
    const makeRequest = () => requestWith([
      new File([PDF], 'instruction.pdf', { type: 'application/pdf' }),
    ]);
    const firstPromise = upload(makeRequest(), ctx, {});
    await vi.waitFor(() => expect(blob.uploadEvidenceBytes).toHaveBeenCalledTimes(1));
    const second = await upload(makeRequest(), ctx, {});
    releaseUpload();
    const first = await firstPromise;

    expect(first.status).toBe(201);
    expect(second.status).toBe(400);
    expect(blob.uploadEvidenceBytes).toHaveBeenCalledTimes(1);
    expect(state.evidence).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ state: 'complete', evidence_id: 'ev-1' });
  });

  it('fences an expired upload from a reclaimed retry and a stale cleanup delete', async () => {
    // Generation A writes bytes but its durable transaction fails, leaving cleanup ownership.
    state.archiveFailure = true;
    const makeRequest = () => requestWith([
      new File([PDF], 'instruction.pdf', { type: 'application/pdf' }),
    ]);
    const failedA = await upload(makeRequest(), ctx, {});
    expect(failedA.status).toBe(400);
    const pathA = state.items[0].blob_path;
    expect(state.blobPaths.has(pathA)).toBe(true);

    // Cleanup claim A expires; worker B reclaims and completes that old-path cleanup.
    const staleWorkerAPath = pathA;
    state.blobPaths.delete(pathA);
    state.items[0].state = 'cleaned';
    state.archiveFailure = false;

    // The browser retries with the same idempotency key. Generation B must write elsewhere.
    const successfulB = await upload(makeRequest(), ctx, {});
    expect(successfulB.status).toBe(201);
    const pathB = state.items[0].blob_path;
    expect(pathB).not.toBe(pathA);
    expect(state.blobPaths.has(pathB)).toBe(true);
    expect(state.evidence[0].storage_path).toBe(pathB);

    // Stale worker A finally issues its already-authorised delete. It can touch only A.
    state.blobPaths.delete(staleWorkerAPath);
    expect(state.blobPaths.has(pathB)).toBe(true);
    expect(state.evidence[0].storage_path).toBe(pathB);
  });

  it('derives stable identity for a cached legacy client and returns evidence ids on replay', async () => {
    const makeRequest = () => requestWith(
      [new File([PDF], 'instruction.pdf', { type: 'application/pdf' })],
      { legacy: true },
    );
    const first = await upload(makeRequest(), ctx, {});
    const second = await upload(makeRequest(), ctx, {});

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.jsonBody).toMatchObject({
      added: [{ evidenceId: 'ev-1', duplicate: true }],
      rejected: [],
    });
    expect(state.batches.size).toBe(1);
    expect([...state.batches.keys()][0]).toMatch(/^legacy-[0-9a-f]{64}$/u);
    expect(state.evidence[0].source_message_id).toContain('staff:legacy_upload:legacy-');
    expect(blob.uploadEvidenceBytes).toHaveBeenCalledTimes(1);
  });
});

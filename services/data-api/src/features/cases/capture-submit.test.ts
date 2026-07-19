import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { request, sessionRow } from './capture.harness.js';

interface Registration {
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;
}

const registrations = vi.hoisted(() => new Map<string, Registration>());
vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, options: Registration) => registrations.set(name, options),
  },
}));

vi.mock('../../platform/auth/staff-auth.js', () => ({
  withRole: (_role: string, handler: (
    req: HttpRequest,
    ctx: InvocationContext,
    claims: Record<string, unknown>,
  ) => Promise<HttpResponseInit>) =>
    (req: HttpRequest, ctx: InvocationContext) => handler(req, ctx, { oid: 'staff-1' } as never),
}));

const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn() }));
vi.mock('../../platform/db/client.js', () => ({
  query: db.query,
  tx: db.tx,
}));

const captureAuth = vi.hoisted(() => ({
  mintCaptureAccessToken: vi.fn(),
  newBootstrapSecret: vi.fn(() => 'secret'),
  newResumeSecret: vi.fn(() => 'r'.repeat(43)),
  verifyCaptureAccessToken: vi.fn(async () => ({
    sub: '11111111-1111-4111-8111-111111111111',
    generation: 1,
    kind: 'capture',
  })),
}));
vi.mock('./capture-auth.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./capture-auth.js')>()),
  ...captureAuth,
}));

const blobs = vi.hoisted(() => ({
  createCaptureUploadSas: vi.fn(),
  deleteCaptureStagingBlob: vi.fn(),
  downloadCaptureBlobBytes: vi.fn(),
  getCaptureBlobProperties: vi.fn(),
  promoteCaptureBlob: vi.fn(),
}));
vi.mock('../evidence/blob-store.js', () => ({
  ...blobs,
  captureStagingBlobPath: (sessionId: string, assetId: string) => `capture/${sessionId}/${assetId}`,
}));

const uploadValidation = vi.hoisted(() => ({
  classify: vi.fn(() => ({ ok: true, kind: 'image', contentType: 'image/jpeg' })),
  validate: vi.fn(async () => ({ ok: true, kind: 'image', contentType: 'image/jpeg' })),
  dimensions: vi.fn(async () => ({ width: 100, height: 80 })),
}));
vi.mock('../evidence/upload-validate.js', () => ({
  MAX_UPLOAD_BYTES: 15 * 1024 * 1024,
  classifyUpload: uploadValidation.classify,
  validateUploadContent: uploadValidation.validate,
  validatedImageDimensions: uploadValidation.dimensions,
}));

const rateLimit = vi.hoisted(() => ({
  caller: vi.fn(async (_req: unknown, _scope?: unknown): Promise<HttpResponseInit | undefined> => undefined),
  session: vi.fn(async (_scope: unknown, _sessionId: unknown): Promise<HttpResponseInit | undefined> => undefined),
}));
vi.mock('./capture-rate-limit.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./capture-rate-limit.js')>()),
  callerRateLimitResponse: rateLimit.caller,
  sessionRateLimitResponse: rateLimit.session,
}));

const locks = vi.hoisted(() => ({ lockCaseForMutation: vi.fn() }));
vi.mock('./mutation-locks.js', () => locks);
const targets = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('./case-mutation-target.js', () => ({
  withResolvedCaseMutationTarget: targets.resolve,
}));
const archive = vi.hoisted(() => ({ requestArchiveMirror: vi.fn() }));
vi.mock('../archive/mirror-outbox.js', () => ({
  requestArchiveMirror: archive.requestArchiveMirror,
}));
const status = vi.hoisted(() => ({ requestStatusRecompute: vi.fn() }));
vi.mock('./status-recompute.js', () => status);
const audit = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock('../../shared/audit.js', () => ({
  actorFromClaims: vi.fn(() => 'staff-1'),
  AUDIT_ACTION: {
    capture_session_created: 100000056,
    capture_session_rotated: 100000057,
    capture_session_revoked: 100000058,
    capture_asset_validated: 100000059,
    capture_session_completed: 100000060,
    capture_session_retargeted: 100000061,
    capture_session_locked: 100000062,
  },
  writeAuditStrict: audit.write,
}));

await import('./capture.js');

const ctx = { error: vi.fn(), warn: vi.fn() } as unknown as InvocationContext;

beforeEach(() => {
  process.env.CAPTURE_SESSIONS_ENABLED = 'true';
  process.env.PUBLIC_CAPTURE_ENABLED = 'true';
  process.env.CAPTURE_PUBLIC_BASE_URL = 'https://capture.example.test';
  delete process.env.CAPTURE_GUIDANCE_MODE;
  delete process.env.CAPTURE_DIRECT_UPLOAD_ENABLED;
  delete process.env.CAPTURE_DECODE_CONCURRENCY;
  db.query.mockReset();
  db.tx.mockReset();
  rateLimit.caller.mockReset();
  rateLimit.caller.mockResolvedValue(undefined);
  rateLimit.session.mockReset();
  rateLimit.session.mockResolvedValue(undefined);
  locks.lockCaseForMutation.mockReset();
  locks.lockCaseForMutation.mockImplementation(async (_q: unknown, caseId: string) => ({
    kind: 'active',
    caseId,
  }));
  targets.resolve.mockReset();
  targets.resolve.mockImplementation(async (
    caseId: string,
    work: (q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>, target: {
      caseId: string;
      statusCode: number;
      lineage: string[];
    }) => Promise<unknown>,
  ) => ({
    kind: 'resolved',
    targetCaseId: caseId,
    value: await db.tx((q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>) =>
      work(q, { caseId, statusCode: 100000000, lineage: [caseId] })),
  }));
  archive.requestArchiveMirror.mockReset();
  status.requestStatusRecompute.mockReset();
  audit.write.mockReset();
  captureAuth.mintCaptureAccessToken.mockReset();
  captureAuth.mintCaptureAccessToken.mockResolvedValue({
    token: 'short-lived-access-token',
    expiresAt: '2026-07-13T12:15:00.000Z',
  });
  captureAuth.newBootstrapSecret.mockClear();
  captureAuth.newResumeSecret.mockReset();
  captureAuth.newResumeSecret.mockReturnValue('r'.repeat(43));
  captureAuth.verifyCaptureAccessToken.mockClear();
  for (const mock of Object.values(blobs)) mock.mockReset();
  uploadValidation.classify.mockClear();
  uploadValidation.validate.mockClear();
  uploadValidation.dimensions.mockClear();
  vi.mocked(ctx.error).mockReset();
  vi.mocked(ctx.warn).mockReset();
});

describe('capture submission', () => {
  it('allows only submit to replay the immediately previous generation with the same key', async () => {
    const submittedAt = new Date('2026-07-13T12:30:00.000Z');
    db.query.mockResolvedValueOnce([sessionRow({
      status: 'complete',
      token_generation: 2,
      submitted_at: submittedAt,
      submit_idempotency_key: 'submit-1234567890',
    })]);
    const response = await registrations.get('submitCaptureSession')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { 'idempotency-key': 'submit-1234567890' },
      }),
      ctx,
    );
    expect(response).toMatchObject({
      status: 200,
      headers: { 'Set-Cookie': expect.stringContaining('Max-Age=0') },
      jsonBody: { status: 'complete', completedAt: submittedAt.toISOString() },
    });
    expect(targets.resolve).not.toHaveBeenCalled();
    expect(db.tx).not.toHaveBeenCalled();
  });

  it('rejects submit when rotation wins between bearer precheck and the locked session read', async () => {
    db.query.mockResolvedValueOnce([sessionRow({ token_generation: 1 })]);
    const sqls: string[] = [];
    db.tx.mockImplementationOnce(async (fn: (q: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string) => {
        sqls.push(sql);
        if (sql.includes('submit_idempotency_key')) {
          return [{
            case_id: 'case-1', status: 'open', submit_idempotency_key: null, submitted_at: null,
            token_generation: 2, expires_at: new Date(Date.now() + 60_000),
          }];
        }
        return [];
      }));

    const response = await registrations.get('submitCaptureSession')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { 'idempotency-key': 'submit-1234567890' },
      }),
      ctx,
    );

    expect(response).toMatchObject({ status: 401, jsonBody: { error: 'capture_unauthorized' } });
    expect(sqls.some((sql) => sql.includes('INSERT INTO evidence') || sql.includes('SET case_id = $2'))).toBe(false);
  });

  it('rejects submit when expiry crosses after bearer precheck but before the locked read', async () => {
    db.query.mockResolvedValueOnce([sessionRow({ token_generation: 1 })]);
    db.tx.mockImplementationOnce(async (fn: (q: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string) => {
        if (sql.includes('submit_idempotency_key')) {
          return [{
            case_id: 'case-1', status: 'open', submit_idempotency_key: null, submitted_at: null,
            token_generation: 1, expires_at: new Date(Date.now() - 1_000),
          }];
        }
        return [];
      }));

    const response = await registrations.get('submitCaptureSession')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { 'idempotency-key': 'submit-1234567890' },
      }),
      ctx,
    );

    expect(response).toMatchObject({ status: 410, jsonBody: { error: 'capture_expired' } });
  });

  it('persistently locks and audits a session whose resolved survivor is terminal', async () => {
    db.query.mockResolvedValueOnce([sessionRow()]);
    const sqls: string[] = [];
    targets.resolve.mockImplementationOnce(async (
      caseId: string,
      work: (q: (sql: string) => Promise<Record<string, unknown>[]>, target: {
        caseId: string; statusCode: number; lineage: string[];
      }) => Promise<unknown>,
    ) => ({
      kind: 'resolved',
      targetCaseId: caseId,
      value: await db.tx((q: (sql: string) => Promise<Record<string, unknown>[]>) =>
        work(q, { caseId, statusCode: 100000012, lineage: [caseId] })),
    }));
    db.tx.mockImplementation(async (fn: (q: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string) => {
        sqls.push(sql);
        if (sql.includes('submit_idempotency_key')) {
          return [{
            case_id: 'case-1', status: 'open', submit_idempotency_key: null, submitted_at: null,
            token_generation: 1, expires_at: new Date(Date.now() + 60_000),
          }];
        }
        if (sql.includes("SET status = 'locked'")) return [{ case_id: 'case-1' }];
        return [];
      }));
    const response = await registrations.get('submitCaptureSession')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { 'idempotency-key': 'submit-1234567890' },
      }),
      ctx,
    );
    expect(response).toMatchObject({ status: 423, jsonBody: { error: 'capture_locked' } });
    expect(sqls.some((sql) => sql.includes("SET status = 'locked'") && sql.includes('token_generation + 1'))).toBe(true);
    expect(sqls.some((sql) => sql.includes('INSERT INTO evidence'))).toBe(false);
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
      action: 100000062,
      after: expect.objectContaining({ reason: 'terminal_survivor' }),
    }), expect.any(Function));
  });

  it('reparents a merged session to the locked active survivor before materialising', async () => {
    db.query.mockResolvedValueOnce([sessionRow({ case_id: 'case-old' })]);
    targets.resolve.mockImplementationOnce(async (
      _caseId: string,
      work: (q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>, target: {
        caseId: string; statusCode: number; lineage: string[];
      }) => Promise<unknown>,
    ) => ({
      kind: 'resolved',
      targetCaseId: 'case-survivor',
      value: await db.tx((q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>) =>
        work(q, {
          caseId: 'case-survivor',
          statusCode: 100000000,
          lineage: ['case-old', 'case-survivor'],
        })),
    }));
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    db.tx.mockImplementation(async (fn: (q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        if (sql.includes('submit_idempotency_key')) {
          return [{
            case_id: 'case-old', status: 'open', submit_idempotency_key: null, submitted_at: null,
            token_generation: 1, expires_at: new Date(Date.now() + 60_000),
          }];
        }
        if (sql.includes('SET case_id = $2')) return [{ id: 'session-1' }];
        if (sql.includes('FROM capture_session_shot sh') && sql.includes('NOT EXISTS')) return [];
        if (sql.includes('JOIN capture_session_shot sh')) return [];
        if (sql.includes("SET status = 'complete'")) {
          return [{ submitted_at: new Date('2026-07-13T14:00:00.000Z') }];
        }
        return [];
      }));

    const response = await registrations.get('submitCaptureSession')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { 'idempotency-key': 'submit-1234567890' },
      }),
      ctx,
    );

    expect(response.status).toBe(200);
    expect(calls.find(({ sql }) => sql.includes('SET case_id = $2'))?.params).toEqual([
      '11111111-1111-4111-8111-111111111111',
      'case-survivor',
      'case-old',
    ]);
    expect(status.requestStatusRecompute).toHaveBeenCalledWith(expect.any(Function), 'case-survivor');
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
      action: 100000061,
      caseId: 'case-survivor',
    }), expect.any(Function));
  });

  it('commits a merge retarget before reporting an incomplete shot so completion can recover', async () => {
    db.query.mockResolvedValueOnce([sessionRow({ case_id: 'case-old' })]);
    let retargetCommitted = false;
    targets.resolve.mockImplementationOnce(async (
      _caseId: string,
      work: (q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>, target: {
        caseId: string; statusCode: number; lineage: string[];
      }) => Promise<unknown>,
    ) => {
      const value = await db.tx((q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>) =>
        work(q, {
          caseId: 'case-survivor',
          statusCode: 100000000,
          lineage: ['case-old', 'case-survivor'],
        }));
      retargetCommitted = true;
      return { kind: 'resolved', targetCaseId: 'case-survivor', value };
    });
    db.tx.mockImplementationOnce(async (fn: (q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string) => {
        if (sql.includes('submit_idempotency_key')) {
          return [{
            case_id: 'case-old', status: 'open', submit_idempotency_key: null, submitted_at: null,
            token_generation: 1, expires_at: new Date(Date.now() + 60_000),
          }];
        }
        if (sql.includes('SET case_id = $2')) return [{ id: 'session-1' }];
        if (sql.includes('FROM capture_session_shot sh') && sql.includes('NOT EXISTS')) {
          return [{ shot_id: 'overview' }];
        }
        return [];
      }));

    const submit = await registrations.get('submitCaptureSession')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { 'idempotency-key': 'submit-1234567890' },
      }),
      ctx,
    );

    expect(submit).toMatchObject({ status: 409, jsonBody: { error: 'capture_conflict' } });
    expect(retargetCommitted).toBe(true);
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
      action: 100000061,
      caseId: 'case-survivor',
    }), expect.any(Function));

    const bytes = Buffer.from('photo');
    const sha = (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
    db.query.mockReset();
    db.tx.mockReset();
    db.query.mockResolvedValueOnce([sessionRow({ case_id: 'case-survivor' })]);
    let validationAttempt = '';
    let transaction = 0;
    db.tx.mockImplementation(async (fn: (q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<unknown>) => {
      transaction++;
      return fn(async (sql: string, params?: unknown[]) => {
        if (transaction === 1 && sql.includes('FROM capture_asset a')) {
          return [{
            id: 'asset-1', shot_id: 'overview', state: 'upload_pending',
            blob_path: 'capture/session/asset', file_name: 'photo.jpg',
            declared_content_type: 'image/jpeg', declared_size_bytes: bytes.length,
            declared_sha256: sha, session_status: 'open',
            session_expires_at: new Date(Date.now() + 60_000), session_token_generation: 1,
            validation_lease_expires_at: null,
          }];
        }
        if (transaction === 1 && sql.includes('validation_attempt = $2')) {
          validationAttempt = String(params?.[1]);
          return [];
        }
        if (transaction === 2 && sql.includes('FROM capture_asset a')) {
          return [{
            case_id: 'case-survivor', status: 'open', expires_at: new Date(Date.now() + 60_000),
            token_generation: 1, asset_state: 'validating', validation_attempt: validationAttempt,
          }];
        }
        if (transaction === 2 && sql.includes("SET state = 'pending_review'")) return [{ id: 'asset-1' }];
        return [];
      });
    });
    blobs.getCaptureBlobProperties.mockResolvedValue({
      contentLength: bytes.length,
      contentType: 'image/jpeg',
    });
    blobs.downloadCaptureBlobBytes.mockResolvedValue(bytes);
    blobs.promoteCaptureBlob.mockResolvedValue(`capture-validated/session/asset/${sha}`);
    blobs.deleteCaptureStagingBlob.mockResolvedValue(undefined);

    const completed = await registrations.get('completeCaptureUpload')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111', assetId: 'asset-1' },
        body: { sizeBytes: bytes.length, sha256: sha },
      }),
      ctx,
    );

    expect(completed).toMatchObject({
      status: 200,
      jsonBody: { assetId: 'asset-1', shotId: 'overview', status: 'pending_review' },
    });
    expect(targets.resolve).toHaveBeenLastCalledWith('case-survivor', expect.any(Function));
    expect(db.query.mock.calls.some(([sql, params]) =>
      String(sql).includes('staging_deleted_at') && (params as unknown[])?.[0] === 'asset-1')).toBe(true);
  });

  it('persistently locks and audits a session when its merge survivor is missing', async () => {
    db.query
      .mockResolvedValueOnce([sessionRow({ case_id: 'case-old' })])
      .mockResolvedValueOnce([{ case_id: 'case-old', status: 'open' }]);
    targets.resolve.mockResolvedValueOnce({ kind: 'unresolved', reason: 'missing' });
    const sqls: string[] = [];
    const order: string[] = [];
    locks.lockCaseForMutation.mockImplementationOnce(async (_q: unknown, caseId: string) => {
      order.push('case');
      return { kind: 'retired', caseId, mergedInto: 'missing-survivor' };
    });
    db.tx.mockImplementationOnce(async (fn: (q: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string) => {
        sqls.push(sql);
        if (sql.includes("SET status = 'locked'")) {
          order.push('session');
          return [{ case_id: 'case-old' }];
        }
        return [];
      }));

    const response = await registrations.get('submitCaptureSession')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { 'idempotency-key': 'submit-1234567890' },
      }),
      ctx,
    );

    expect(response).toMatchObject({ status: 423, jsonBody: { error: 'capture_locked' } });
    expect(sqls.some((sql) => sql.includes("SET status = 'locked'") && sql.includes('RETURNING case_id'))).toBe(true);
    expect(order).toEqual(['case', 'session']);
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
      action: 100000062,
      caseId: 'case-old',
      after: expect.objectContaining({ reason: 'missing' }),
    }), expect.any(Function));
  });

  it('materialises identical selected bytes once and links the duplicate asset to that evidence', async () => {
    db.query.mockResolvedValueOnce([sessionRow()]);
    archive.requestArchiveMirror.mockResolvedValue(1);
    status.requestStatusRecompute.mockResolvedValue(1);
    const sqls: string[] = [];
    let twinChecks = 0;
    db.tx.mockImplementation(async (fn: (q: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string) => {
        sqls.push(sql);
        if (sql.includes('submit_idempotency_key')) {
          return [{
            case_id: 'case-1', status: 'open', submit_idempotency_key: null, submitted_at: null,
            token_generation: 1, expires_at: new Date(Date.now() + 60_000),
          }];
        }
        if (sql.includes('FROM capture_session_shot sh') && sql.includes('NOT EXISTS')) return [];
        if (sql.includes('FROM capture_asset a') && sql.includes('JOIN capture_session_shot sh')) {
          const base = {
            shot_id: 'overview', evidence_role: 'overview', sequence: 10, file_name: 'photo.jpg',
            server_content_type: 'image/jpeg', server_size_bytes: 100, server_sha256: 'c'.repeat(64),
            blob_path: 'capture-validated/session/asset/hash', evidence_id: null,
          };
          return [{ ...base, id: 'asset-1' }, { ...base, id: 'asset-2', shot_id: 'additional' }];
        }
        if (sql.includes('SELECT id FROM evidence')) {
          twinChecks += 1;
          return twinChecks === 1 ? [] : [{ id: 'evidence-1' }];
        }
        if (sql.includes('INSERT INTO evidence')) {
          return [{
            id: 'evidence-1', case_id: 'case-1', excluded: true,
            storage_path: 'capture-validated/session/asset/hash', box_file_id: null,
          }];
        }
        if (sql.includes("UPDATE capture_session\n            SET status = 'complete'")) {
          return [{ submitted_at: new Date('2026-07-13T12:30:00.000Z') }];
        }
        return [];
      }));
    const response = await registrations.get('submitCaptureSession')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { 'idempotency-key': 'submit-1234567890' },
      }),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(sqls.filter((sql) => sql.includes('INSERT INTO evidence'))).toHaveLength(1);
    expect(sqls.filter((sql) => sql.includes('SET evidence_id = $2'))).toHaveLength(2);
    expect(sqls.some((sql) => sql.includes('DELETE FROM capture_session_resume_token'))).toBe(true);
    expect(response.headers).toMatchObject({
      'Set-Cookie': expect.stringContaining('Max-Age=0'),
    });
    expect(archive.requestArchiveMirror).toHaveBeenCalledOnce();
  });
});

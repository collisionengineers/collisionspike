import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { clientObservation, request, sessionRow } from './capture.harness.js';

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

describe('capture upload completion', () => {
  it('rejects an invalid completion size before the asset transaction', async () => {
    db.query.mockResolvedValueOnce([sessionRow()]);
    const response = await registrations.get('completeCaptureUpload')!.handler(
      request({
        params: {
          id: '11111111-1111-4111-8111-111111111111',
          assetId: '22222222-2222-4222-8222-222222222222',
        },
        body: { sizeBytes: (15 * 1024 * 1024) + 1, sha256: 'b'.repeat(64) },
      }),
      ctx,
    );
    expect(response).toMatchObject({ status: 400, jsonBody: { error: 'capture_validation' } });
    expect(db.tx).not.toHaveBeenCalled();
  });

  it('HEAD-checks an oversized staging object and never downloads it', async () => {
    const maxBytes = 15 * 1024 * 1024;
    db.query.mockResolvedValueOnce([sessionRow()]).mockResolvedValueOnce([]);
    db.tx.mockImplementationOnce(async (fn: (q: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string) => {
        if (sql.includes('FROM capture_asset a') && sql.includes('JOIN capture_session s')) {
          return [{
            id: '22222222-2222-4222-8222-222222222222',
            shot_id: 'overview',
            state: 'upload_pending',
            blob_path: 'capture/session/staging',
            file_name: 'photo.jpg',
            declared_content_type: 'image/jpeg',
            declared_size_bytes: maxBytes,
            declared_sha256: 'b'.repeat(64),
            session_status: 'open',
            session_expires_at: new Date(Date.now() + 60_000),
            session_token_generation: 1,
          }];
        }
        return [];
      }));
    blobs.getCaptureBlobProperties.mockResolvedValue({
      contentLength: maxBytes + 1,
      contentType: 'image/jpeg',
    });
    const response = await registrations.get('completeCaptureUpload')!.handler(
      request({
        params: {
          id: '11111111-1111-4111-8111-111111111111',
          assetId: '22222222-2222-4222-8222-222222222222',
        },
        body: { sizeBytes: maxBytes, sha256: 'b'.repeat(64) },
      }),
      ctx,
    );
    expect(response).toMatchObject({ status: 422, jsonBody: { error: 'capture_validation' } });
    expect(blobs.getCaptureBlobProperties).toHaveBeenCalledWith('capture/session/staging');
    expect(blobs.downloadCaptureBlobBytes).not.toHaveBeenCalled();
    expect(blobs.promoteCaptureBlob).not.toHaveBeenCalled();
    const rejection = db.query.mock.calls.find(([sql]) => String(sql).includes("state = 'rejected'"));
    expect(String(rejection?.[0])).toContain('server_quality = $4::jsonb');
    expect(JSON.parse(String((rejection?.[1] as unknown[])?.[3]))).toMatchObject({
      version: 'structural-v1',
      result: 'blob_properties_mismatch',
      propertiesMatch: false,
      contentType: 'image/jpeg',
      sizeBytes: maxBytes,
    });
  });

  it('returns retryable while a live validation lease owns the asset', async () => {
    db.query.mockResolvedValueOnce([sessionRow()]);
    db.tx.mockImplementationOnce(async (fn: (q: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string) => {
        if (sql.includes('FROM capture_asset a')) {
          return [{
            id: 'asset-1', shot_id: 'overview', state: 'validating',
            blob_path: 'capture/session/asset', file_name: 'photo.jpg',
            declared_content_type: 'image/jpeg', declared_size_bytes: 5,
            declared_sha256: 'a'.repeat(64), session_status: 'open',
            session_expires_at: new Date(Date.now() + 60_000), session_token_generation: 1,
            validation_lease_expires_at: new Date(Date.now() + 60_000),
          }];
        }
        return [];
      }));

    const response = await registrations.get('completeCaptureUpload')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111', assetId: 'asset-1' },
        body: { sizeBytes: 5, sha256: 'a'.repeat(64) },
      }),
      ctx,
    );

    expect(response).toMatchObject({ status: 409, jsonBody: { error: 'capture_retryable' } });
    expect(blobs.getCaptureBlobProperties).not.toHaveBeenCalled();
  });

  it('reclaims a stale lease and releases its fenced attempt after transient Blob failure', async () => {
    db.query.mockResolvedValueOnce([sessionRow()]).mockResolvedValueOnce([]);
    const txSql: string[] = [];
    db.tx.mockImplementationOnce(async (fn: (q: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string) => {
        txSql.push(sql);
        if (sql.includes('FROM capture_asset a')) {
          return [{
            id: 'asset-1', shot_id: 'overview', state: 'validating',
            blob_path: 'capture/session/asset', file_name: 'photo.jpg',
            declared_content_type: 'image/jpeg', declared_size_bytes: 5,
            declared_sha256: 'a'.repeat(64), session_status: 'open',
            session_expires_at: new Date(Date.now() + 60_000), session_token_generation: 1,
            validation_lease_expires_at: new Date(Date.now() - 1_000),
          }];
        }
        return [];
      }));
    blobs.getCaptureBlobProperties.mockRejectedValue(Object.assign(
      new Error('https://storage.example/capture/session/asset?sig=secret-token'),
      { statusCode: 503, code: 'ServiceUnavailable' },
    ));

    const response = await registrations.get('completeCaptureUpload')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111', assetId: 'asset-1' },
        body: { sizeBytes: 5, sha256: 'a'.repeat(64) },
      }),
      ctx,
    );

    expect(response).toMatchObject({ status: 503, jsonBody: { error: 'capture_retryable' } });
    expect(txSql.some((sql) => sql.includes('validation_attempt = $2') && sql.includes('make_interval'))).toBe(true);
    expect(String(db.query.mock.calls[1]?.[0])).toContain('validation_attempt = $2');
    const logged = vi.mocked(ctx.error).mock.calls.flat().map(String).join(' ');
    expect(logged).toContain('[capture-complete] staging_head_failed status=503 code=ServiceUnavailable');
    expect(logged).not.toContain('capture/session/asset');
    expect(logged).not.toContain('secret-token');
  });

  it.each([
    { stage: 'read', category: '[capture-complete] staging_read_failed' },
    { stage: 'promotion', category: '[capture-complete] promotion_failed' },
  ])('logs only sanitized storage metadata when $stage fails', async ({ stage, category }) => {
    const bytes = Buffer.from('photo');
    const sha = (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
    db.query.mockResolvedValueOnce([sessionRow()]).mockResolvedValueOnce([]);
    db.tx.mockImplementationOnce(async (fn: (q: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string) => {
        if (sql.includes('FROM capture_asset a')) {
          return [{
            id: 'asset-1', shot_id: 'overview', state: 'upload_pending',
            blob_path: 'capture/session/asset', file_name: 'photo.jpg',
            declared_content_type: 'image/jpeg', declared_size_bytes: bytes.length,
            declared_sha256: sha, session_status: 'open',
            session_expires_at: new Date(Date.now() + 60_000), session_token_generation: 1,
            validation_lease_expires_at: null,
          }];
        }
        return [];
      }));
    blobs.getCaptureBlobProperties.mockResolvedValue({
      contentLength: bytes.length,
      contentType: 'image/jpeg',
    });
    const storageError = Object.assign(
      new Error('https://storage.example/capture/session/asset?sig=secret-token'),
      { statusCode: 503, code: 'ServerBusy' },
    );
    if (stage === 'read') {
      blobs.downloadCaptureBlobBytes.mockRejectedValue(storageError);
    } else {
      blobs.downloadCaptureBlobBytes.mockResolvedValue(bytes);
      blobs.promoteCaptureBlob.mockRejectedValue(storageError);
    }

    const response = await registrations.get('completeCaptureUpload')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111', assetId: 'asset-1' },
        body: { sizeBytes: bytes.length, sha256: sha },
      }),
      ctx,
    );

    expect(response).toMatchObject({ status: 503, jsonBody: { error: 'capture_retryable' } });
    const logged = vi.mocked(ctx.error).mock.calls.flat().map(String).join(' ');
    expect(logged).toContain(`${category} status=503 code=ServerBusy`);
    expect(logged).not.toContain('capture/session/asset');
    expect(logged).not.toContain('secret-token');
  });

  it('prevents an old validator from persisting after another attempt reclaims the lease', async () => {
    const bytes = Buffer.from('photo');
    const sha = (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
    db.query.mockResolvedValueOnce([sessionRow()]).mockResolvedValueOnce([]);
    let transaction = 0;
    const txSql: string[] = [];
    const finalOrder: string[] = [];
    targets.resolve.mockImplementationOnce(async (
      caseId: string,
      work: (q: (sql: string) => Promise<Record<string, unknown>[]>, target: {
        caseId: string; statusCode: number; lineage: string[];
      }) => Promise<unknown>,
    ) => {
      finalOrder.push('case');
      return {
        kind: 'resolved',
        targetCaseId: caseId,
        value: await db.tx((q: (sql: string) => Promise<Record<string, unknown>[]>) =>
          work(q, { caseId, statusCode: 100000000, lineage: [caseId] })),
      };
    });
    db.tx.mockImplementation(async (fn: (q: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<unknown>) => {
      transaction++;
      return fn(async (sql: string) => {
        txSql.push(sql);
        if (sql.includes('FROM capture_asset a') && transaction === 1) {
          return [{
            id: 'asset-1', shot_id: 'overview', state: 'upload_pending',
            blob_path: 'capture/session/asset', file_name: 'photo.jpg',
            declared_content_type: 'image/jpeg', declared_size_bytes: bytes.length,
            declared_sha256: sha, session_status: 'open',
            session_expires_at: new Date(Date.now() + 60_000), session_token_generation: 1,
            validation_lease_expires_at: null,
          }];
        }
        if (sql.includes('FROM capture_asset a') && transaction === 2) {
          finalOrder.push('session-asset');
          return [{
            case_id: 'case-1', status: 'open', expires_at: new Date(Date.now() + 60_000),
            token_generation: 1, asset_state: 'validating', validation_attempt: 'new-worker-attempt',
          }];
        }
        return [];
      });
    });
    blobs.getCaptureBlobProperties.mockResolvedValue({
      contentLength: bytes.length,
      contentType: 'image/jpeg',
    });
    blobs.downloadCaptureBlobBytes.mockResolvedValue(bytes);
    blobs.promoteCaptureBlob.mockResolvedValue(`capture-validated/session/asset/${sha}`);

    const response = await registrations.get('completeCaptureUpload')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111', assetId: 'asset-1' },
        body: { sizeBytes: bytes.length, sha256: sha },
      }),
      ctx,
    );

    expect(response).toMatchObject({ status: 409, jsonBody: { error: 'capture_retryable' } });
    expect(finalOrder).toEqual(['case', 'session-asset']);
    expect(txSql.some((sql) => sql.includes("SET state = 'pending_review'"))).toBe(false);
    expect(audit.write).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 100000059 }),
      expect.anything(),
    );
  });

  it('keeps client-ready guidance advisory while completion retargets an in-flight upload', async () => {
    const bytes = Buffer.from('photo');
    const sha = (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
    db.query.mockResolvedValueOnce([sessionRow({ case_id: 'case-old' })]);
    let validationAttempt = '';
    let transaction = 0;
    const order: string[] = [];
    const retargetParams: unknown[][] = [];
    let persistedServerQuality: string | undefined;
    targets.resolve.mockImplementationOnce(async (
      _caseId: string,
      work: (q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>, target: {
        caseId: string; statusCode: number; lineage: string[];
      }) => Promise<unknown>,
    ) => {
      order.push('case-lineage');
      const value = await db.tx((q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>) =>
        work(q, {
          caseId: 'case-survivor',
          statusCode: 100000000,
          lineage: ['case-old', 'case-survivor'],
        }));
      return { kind: 'resolved', targetCaseId: 'case-survivor', value };
    });
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
            validation_lease_expires_at: null, client_quality: clientObservation(),
          }];
        }
        if (transaction === 1 && sql.includes('validation_attempt = $2')) {
          validationAttempt = String(params?.[1]);
          return [];
        }
        if (transaction === 2 && sql.includes('FROM capture_asset a')) {
          order.push('session-asset');
          return [{
            case_id: 'case-old', status: 'open', expires_at: new Date(Date.now() + 60_000),
            token_generation: 1, asset_state: 'validating', validation_attempt: validationAttempt,
          }];
        }
        if (transaction === 2 && sql.includes('SET case_id = $2')) {
          retargetParams.push(params ?? []);
          return [{ id: 'session-1' }];
        }
        if (transaction === 2 && sql.includes("SET state = 'pending_review'")) {
          persistedServerQuality = String(params?.[8]);
          return [{ id: 'asset-1' }];
        }
        return [];
      });
    });
    blobs.getCaptureBlobProperties.mockResolvedValue({
      contentLength: bytes.length,
      contentType: 'image/jpeg',
    });
    blobs.downloadCaptureBlobBytes.mockResolvedValue(bytes);
    blobs.promoteCaptureBlob.mockResolvedValue(`capture-validated/session/asset/${sha}`);
    blobs.deleteCaptureStagingBlob.mockRejectedValueOnce(new Error('staging delete failed'));

    const response = await registrations.get('completeCaptureUpload')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111', assetId: 'asset-1' },
        body: { sizeBytes: bytes.length, sha256: sha },
      }),
      ctx,
    );

    expect(response).toMatchObject({
      status: 200,
      jsonBody: { assetId: 'asset-1', shotId: 'overview', status: 'pending_review' },
    });
    expect(targets.resolve).toHaveBeenCalledWith('case-old', expect.any(Function));
    expect(order).toEqual(['case-lineage', 'session-asset']);
    expect(retargetParams[0]).toEqual([
      '11111111-1111-4111-8111-111111111111',
      'case-survivor',
      'case-old',
    ]);
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
      action: 100000061,
      caseId: 'case-survivor',
    }), expect.any(Function));
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
      action: 100000059,
      caseId: 'case-survivor',
    }), expect.any(Function));
    expect(JSON.parse(persistedServerQuality ?? '')).toEqual({
      version: 'structural-v1',
      result: 'passed',
      propertiesMatch: true,
      contentType: 'image/jpeg',
      sizeBytes: bytes.length,
      hashMatches: true,
      magicBytesValid: true,
      decodable: true,
      width: 100,
      height: 80,
    });
    expect(uploadValidation.validate).toHaveBeenCalled();
    expect(uploadValidation.dimensions).toHaveBeenCalled();
    expect(ctx.warn).toHaveBeenCalledWith('[capture-complete] staging cleanup deferred');
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('staging_deleted_at'))).toBe(false);
  });
});

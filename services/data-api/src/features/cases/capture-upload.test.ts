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

describe('capture upload intent', () => {
  it.each([
    {
      label: 'the resume token',
      sessionExpiresAt: new Date(Date.now() + 60_000),
      tokenExpiresAt: new Date(Date.now() - 1_000),
    },
    {
      label: 'the capture session',
      sessionExpiresAt: new Date(Date.now() - 1_000),
      tokenExpiresAt: new Date(Date.now() + 60_000),
    },
  ])('rejects renewal after $label expires', async ({ sessionExpiresAt, tokenExpiresAt }) => {
    db.tx.mockImplementationOnce(async (fn: (q: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string) => {
        if (sql.includes('SELECT session_id FROM capture_session_resume_token')) {
          return [{ session_id: '11111111-1111-4111-8111-111111111111' }];
        }
        if (sql.includes('SELECT id, status, expires_at, token_generation')) {
          return [sessionRow({ expires_at: sessionExpiresAt })];
        }
        if (sql.includes('SELECT token_generation, expires_at')) {
          return [{ token_generation: 1, expires_at: tokenExpiresAt }];
        }
        return [];
      }));

    const response = await registrations.get('renewCaptureAccess')!.handler(
      request({ headers: { cookie: `__Host-collisioncapture-resume=${'r'.repeat(43)}` } }),
      ctx,
    );

    expect(response).toMatchObject({ status: 410, jsonBody: { error: 'capture_expired' } });
    expect(captureAuth.mintCaptureAccessToken).not.toHaveBeenCalled();
  });

  it('authenticates the session then fails upload intent closed when direct upload is disabled', async () => {
    db.query.mockResolvedValueOnce([sessionRow()]);
    const response = await registrations.get('createCaptureUpload')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { 'idempotency-key': 'attempt-1234567890' },
        body: {
          shotId: 'overview',
          fileName: 'overview.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 1024,
          sha256: 'b'.repeat(64),
          clientObservation: clientObservation(),
        },
      }),
      ctx,
    );
    expect(response.status).toBe(503);
    expect(response.jsonBody).toEqual({
      error: 'capture_retryable',
      message: 'Photo uploads are not available yet.',
    });
    expect(db.tx).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'a missing observation', value: undefined },
    { label: 'an unknown observation field', value: clientObservation({ extra: true }) },
    { label: 'a mismatched rules version', value: clientObservation({ rulesVersion: 'other-rules' }) },
    {
      label: 'an out-of-range normalized signal',
      value: clientObservation({
        signals: { brightness: 2, contrast: 0.2, sharpness: 0.1, motion: 0.01 },
      }),
    },
    { label: 'a ready observation with an issue', value: clientObservation({ issue: 'too-dark' }) },
    {
      label: 'an assessed unassessed observation',
      value: clientObservation({ disposition: 'unassessed', stableFrames: 0 }),
    },
    { label: 'an unstable guided-ready observation', value: clientObservation({ stableFrames: 0 }) },
  ])('rejects $label before reserving storage', async ({ value }) => {
    db.query.mockResolvedValueOnce([sessionRow()]);

    const response = await registrations.get('createCaptureUpload')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { 'idempotency-key': 'attempt-1234567890' },
        body: {
          shotId: 'overview', fileName: 'overview.jpg', contentType: 'image/jpeg',
          sizeBytes: 1024, sha256: 'b'.repeat(64), clientObservation: value,
        },
      }),
      ctx,
    );

    expect(response).toMatchObject({ status: 400, jsonBody: { error: 'capture_validation' } });
    expect(db.tx).not.toHaveBeenCalled();
  });

  it('rejects an oversized observation before reserving storage', async () => {
    db.query.mockResolvedValueOnce([sessionRow()]);

    const response = await registrations.get('createCaptureUpload')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { 'idempotency-key': 'attempt-1234567890' },
        body: {
          shotId: 'overview', fileName: 'overview.jpg', contentType: 'image/jpeg',
          sizeBytes: 1024, sha256: 'b'.repeat(64),
          clientObservation: clientObservation({ padding: 'x'.repeat(1100) }),
        },
      }),
      ctx,
    );

    expect(response).toMatchObject({ status: 400, jsonBody: { error: 'capture_validation' } });
    expect(db.tx).not.toHaveBeenCalled();
  });

  it('keeps take-anyway available even when the pinned session mode is enforced', async () => {
    db.query.mockResolvedValueOnce([sessionRow({ guidance_mode: 'enforced' })]);

    const response = await registrations.get('createCaptureUpload')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { 'idempotency-key': 'attempt-1234567890' },
        body: {
          shotId: 'overview', fileName: 'overview.jpg', contentType: 'image/jpeg',
          sizeBytes: 1024, sha256: 'b'.repeat(64),
          clientObservation: clientObservation({ disposition: 'take_anyway', issue: 'too-dark' }),
        },
      }),
      ctx,
    );

    expect(response).toMatchObject({ status: 503, jsonBody: { error: 'capture_retryable' } });
    expect(db.tx).not.toHaveBeenCalled();
  });

  it('returns payload-too-large for an oversized declared upload', async () => {
    db.query.mockResolvedValueOnce([sessionRow()]);

    const response = await registrations.get('createCaptureUpload')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { 'idempotency-key': 'attempt-1234567890' },
        body: {
          shotId: 'overview',
          fileName: 'overview.jpg',
          contentType: 'image/jpeg',
          sizeBytes: (15 * 1024 * 1024) + 1,
          sha256: 'b'.repeat(64),
        },
      }),
      ctx,
    );

    expect(response).toMatchObject({
      status: 413,
      jsonBody: { error: 'capture_validation', message: 'This photo is too large. Choose a smaller photo.' },
    });
    expect(db.tx).not.toHaveBeenCalled();
  });

  it('rejects an upload reservation when the link rotates after bearer precheck', async () => {
    process.env.CAPTURE_DIRECT_UPLOAD_ENABLED = 'true';
    db.query.mockResolvedValueOnce([sessionRow({ token_generation: 1 })]);
    const sqls: string[] = [];
    db.tx.mockImplementationOnce(async (fn: (q: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string) => {
        sqls.push(sql);
        if (sql.includes('SELECT case_id, status, token_generation')) {
          return [{
            status: 'open', token_generation: 2, expires_at: new Date(Date.now() + 60_000),
          }];
        }
        return [];
      }));

    const response = await registrations.get('createCaptureUpload')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { 'idempotency-key': 'attempt-1234567890' },
        body: {
          shotId: 'overview', fileName: 'overview.jpg', contentType: 'image/jpeg',
          sizeBytes: 1024, sha256: 'b'.repeat(64), clientObservation: clientObservation(),
        },
      }),
      ctx,
    );

    expect(response).toMatchObject({ status: 409, jsonBody: { error: 'capture_conflict' } });
    expect(sqls.some((sql) => sql.includes('INSERT INTO capture_asset'))).toBe(false);
    expect(blobs.createCaptureUploadSas).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'shot', shotAttempts: 8, sessionAttempts: 8 },
    { label: 'session', shotAttempts: 2, sessionAttempts: 60 },
  ])('atomically locks and audits a session when the $label reservation limit is exhausted', async ({
    label,
    shotAttempts,
    sessionAttempts,
  }) => {
    process.env.CAPTURE_DIRECT_UPLOAD_ENABLED = 'true';
    db.query.mockResolvedValueOnce([sessionRow()]);
    const sqls: string[] = [];
    db.tx.mockImplementationOnce(async (fn: (
      q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>,
    ) => Promise<unknown>) => fn(async (sql: string) => {
      sqls.push(sql);
      if (sql.includes('SELECT case_id, status, token_generation')) {
        return [{
          case_id: 'case-1', status: 'open', token_generation: 1,
          expires_at: new Date(Date.now() + 60_000),
          rules_version: 'deterministic-quality-v1', guidance_mode: 'advisory',
        }];
      }
      if (sql.includes('FROM capture_session_shot')) return [{ shot_id: 'overview' }];
      if (sql.includes('FROM capture_asset WHERE')) return [];
      if (sql.includes('COUNT(*) FILTER')) return [{ shot_attempts: shotAttempts, session_attempts: sessionAttempts }];
      if (sql.includes("SET status = 'locked'")) return [{ case_id: 'case-1' }];
      return [];
    }));

    const response = await registrations.get('createCaptureUpload')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { 'idempotency-key': 'fresh-attempt-123456' },
        body: {
          shotId: 'overview', fileName: 'overview.jpg', contentType: 'image/jpeg',
          sizeBytes: 1024, sha256: 'b'.repeat(64), clientObservation: clientObservation(),
        },
      }),
      ctx,
    );

    expect(response).toMatchObject({
      status: 423,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: { error: 'capture_locked' },
    });
    expect(sqls.findIndex((sql) => sql.includes('FOR UPDATE')))
      .toBeLessThan(sqls.findIndex((sql) => sql.includes('COUNT(*) FILTER')));
    expect(sqls.some((sql) => sql.includes('INSERT INTO capture_asset'))).toBe(false);
    expect(sqls.some((sql) => sql.includes('DELETE FROM capture_session_resume_token'))).toBe(true);
    expect(blobs.createCaptureUploadSas).not.toHaveBeenCalled();
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
      action: 100000062,
      caseId: 'case-1',
      actor: 'System',
      after: expect.objectContaining({
        reason: 'upload_reservation_limit',
        scope: label,
        shotAttempts,
        sessionAttempts,
        perShotLimit: 8,
        sessionLimit: 60,
      }),
    }), expect.any(Function));
  });

  it('replays a matching stable upload key without consuming another reservation at the limit', async () => {
    process.env.CAPTURE_DIRECT_UPLOAD_ENABLED = 'true';
    db.query.mockResolvedValueOnce([sessionRow()]);
    let transaction = 0;
    const sqls: string[] = [];
    db.tx.mockImplementation(async (fn: (
      q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>,
    ) => Promise<unknown>) => {
      transaction++;
      return fn(async (sql: string) => {
        sqls.push(sql);
        if (transaction === 1 && sql.includes('SELECT case_id, status, token_generation')) {
          return [{
            case_id: 'case-1', status: 'open', token_generation: 1,
            expires_at: new Date(Date.now() + 60_000),
            rules_version: 'deterministic-quality-v1', guidance_mode: 'advisory',
          }];
        }
        if (transaction === 1 && sql.includes('FROM capture_session_shot')) return [{ shot_id: 'overview' }];
        if (transaction === 1 && sql.includes('FROM capture_asset WHERE')) {
          return [{
            id: 'asset-existing', shot_id: 'overview', state: 'upload_pending', file_name: 'overview.jpg',
            declared_content_type: 'image/jpeg', declared_size_bytes: 1024,
            declared_sha256: 'b'.repeat(64), blob_path: 'capture/session/asset-existing',
            client_quality: clientObservation(),
          }];
        }
        if (sql.includes('COUNT(*) FILTER')) throw new Error('replay must not read reservation counters');
        if (transaction === 2 && sql.includes('FROM capture_session s')) {
          return [{
            session_status: 'open', token_generation: 1,
            expires_at: new Date(Date.now() + 60_000), asset_state: 'upload_pending',
          }];
        }
        if (transaction === 2 && sql.includes('UPDATE capture_asset')) return [{ id: 'asset-existing' }];
        return [];
      });
    });
    blobs.createCaptureUploadSas.mockResolvedValue({
      uploadUrl: 'https://storage.example.test/evidence/object?retry-sas',
      headers: { 'x-ms-blob-type': 'BlockBlob' },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const response = await registrations.get('createCaptureUpload')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { 'idempotency-key': 'attempt-1234567890' },
        body: {
          shotId: 'overview', fileName: 'overview.jpg', contentType: 'image/jpeg',
          sizeBytes: 1024, sha256: 'b'.repeat(64), clientObservation: clientObservation(),
        },
      }),
      ctx,
    );

    expect(response).toMatchObject({
      status: 201,
      jsonBody: { uploadId: 'asset-existing', assetId: 'asset-existing' },
    });
    expect(sqls.some((sql) => sql.includes('COUNT(*) FILTER'))).toBe(false);
    expect(sqls.some((sql) => sql.includes('INSERT INTO capture_asset'))).toBe(false);
    expect(blobs.createCaptureUploadSas).toHaveBeenCalledOnce();
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('serialises concurrent fresh keys at the shot ceiling and fails the session closed', async () => {
    process.env.CAPTURE_DIRECT_UPLOAD_ENABLED = 'true';
    db.query.mockImplementation(async () => [sessionRow()]);

    type Asset = {
      id: string; shot_id: string; state: string; file_name: string; declared_content_type: string;
      declared_size_bytes: number; declared_sha256: string; blob_path: string; client_quality: unknown;
      idempotency_key: string;
    };
    const assets: Asset[] = Array.from({ length: 7 }, (_, index) => ({
      id: `old-${index}`, shot_id: 'overview', state: 'rejected', file_name: `old-${index}.jpg`,
      declared_content_type: 'image/jpeg', declared_size_bytes: 1024,
      declared_sha256: 'a'.repeat(64), blob_path: `capture/session/old-${index}`,
      client_quality: clientObservation(), idempotency_key: `old-key-${index}`,
    }));
    let sessionStatus = 'open';
    let tail = Promise.resolve();
    let releaseLocked!: () => void;
    const locked = new Promise<void>((resolve) => { releaseLocked = resolve; });

    db.tx.mockImplementation(async (fn: (
      q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>,
    ) => Promise<unknown>) => {
      const prior = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => { release = resolve; });
      await prior;
      try {
        return await fn(async (sql: string, params: unknown[] = []) => {
          if (sql.includes('SELECT case_id, status, token_generation')) {
            return [{
              case_id: 'case-1', status: sessionStatus, token_generation: sessionStatus === 'open' ? 1 : 2,
              expires_at: new Date(Date.now() + 60_000),
              rules_version: 'deterministic-quality-v1', guidance_mode: 'advisory',
            }];
          }
          if (sql.includes('FROM capture_session_shot')) return [{ shot_id: 'overview' }];
          if (sql.includes('FROM capture_asset WHERE')) {
            return assets.filter((asset) => asset.idempotency_key === params[1]);
          }
          if (sql.includes('COUNT(*) FILTER')) {
            return [{
              shot_attempts: assets.filter((asset) => asset.shot_id === params[1]).length,
              session_attempts: assets.length,
            }];
          }
          if (sql.includes('INSERT INTO capture_asset')) {
            const asset: Asset = {
              id: String(params[0]), shot_id: String(params[2]), state: 'upload_pending',
              idempotency_key: String(params[3]), file_name: String(params[4]),
              declared_content_type: String(params[5]), declared_size_bytes: Number(params[6]),
              declared_sha256: String(params[7]), blob_path: String(params[8]),
              client_quality: JSON.parse(String(params[9])),
            };
            assets.push(asset);
            return [asset];
          }
          if (sql.includes("SET status = 'locked'")) {
            sessionStatus = 'locked';
            releaseLocked();
            return [{ case_id: 'case-1' }];
          }
          if (sql.includes('FROM capture_session s')) {
            return [{
              session_status: sessionStatus, token_generation: sessionStatus === 'open' ? 1 : 2,
              expires_at: new Date(Date.now() + 60_000), asset_state: 'upload_pending',
            }];
          }
          if (sql.includes('UPDATE capture_asset')) return [{ id: params[0] }];
          return [];
        });
      } finally {
        release();
      }
    });
    blobs.createCaptureUploadSas.mockImplementation(async (path: string) => {
      await locked;
      return {
        uploadUrl: `https://storage.example.test/${path}?secret-sas`,
        headers: { 'x-ms-blob-type': 'BlockBlob' },
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      };
    });

    const invoke = (key: string) => registrations.get('createCaptureUpload')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { 'idempotency-key': key },
        body: {
          shotId: 'overview', fileName: `${key}.jpg`, contentType: 'image/jpeg',
          sizeBytes: 1024, sha256: 'b'.repeat(64), clientObservation: clientObservation(),
        },
      }),
      ctx,
    );
    const responses = await Promise.all([
      invoke('fresh-concurrent-key-1'),
      invoke('fresh-concurrent-key-2'),
    ]);

    expect(assets).toHaveLength(8);
    expect(sessionStatus).toBe('locked');
    expect(responses.map((response) => response.status).sort()).toEqual([409, 423]);
    expect(JSON.stringify(responses)).not.toContain('secret-sas');
    expect(audit.write).toHaveBeenCalledOnce();
  });

  it('rejects an idempotent replay when the client observation differs', async () => {
    process.env.CAPTURE_DIRECT_UPLOAD_ENABLED = 'true';
    db.query.mockResolvedValueOnce([sessionRow()]);
    db.tx.mockImplementationOnce(async (fn: (q: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string) => {
        if (sql.includes('SELECT case_id, status, token_generation')) {
          return [{
            status: 'open', token_generation: 1, expires_at: new Date(Date.now() + 60_000),
            rules_version: 'deterministic-quality-v1', guidance_mode: 'advisory',
          }];
        }
        if (sql.includes('FROM capture_session_shot')) return [{ shot_id: 'overview' }];
        if (sql.includes('FROM capture_asset WHERE')) {
          return [{
            id: 'asset-1', shot_id: 'overview', state: 'upload_pending', file_name: 'overview.jpg',
            declared_content_type: 'image/jpeg', declared_size_bytes: 1024,
            declared_sha256: 'b'.repeat(64), blob_path: 'capture/session/asset-1',
            client_quality: clientObservation({ disposition: 'take_anyway', issue: 'too-dark' }),
          }];
        }
        return [];
      }));

    const response = await registrations.get('createCaptureUpload')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { 'idempotency-key': 'attempt-1234567890' },
        body: {
          shotId: 'overview', fileName: 'overview.jpg', contentType: 'image/jpeg',
          sizeBytes: 1024, sha256: 'b'.repeat(64), clientObservation: clientObservation(),
        },
      }),
      ctx,
    );

    expect(response).toMatchObject({ status: 409, jsonBody: { error: 'capture_conflict' } });
    expect(blobs.createCaptureUploadSas).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'rotation', status: 'open', generation: 2 },
    { label: 'revocation', status: 'revoked', generation: 2 },
  ])('does not disclose a minted SAS when $label wins after reservation', async ({ status: lockedStatus, generation }) => {
    process.env.CAPTURE_DIRECT_UPLOAD_ENABLED = 'true';
    db.query.mockResolvedValueOnce([sessionRow({ token_generation: 1 })]);
    let transaction = 0;
    db.tx.mockImplementation(async (fn: (q: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<unknown>) => {
      transaction++;
      return fn(async (sql: string) => {
        if (transaction === 1 && sql.includes('SELECT case_id, status, token_generation')) {
          return [{
            status: 'open', token_generation: 1, expires_at: new Date(Date.now() + 60_000),
            rules_version: 'deterministic-quality-v1', guidance_mode: 'advisory',
          }];
        }
        if (transaction === 1 && sql.includes('FROM capture_session_shot')) return [{ shot_id: 'overview' }];
        if (transaction === 1 && sql.includes('FROM capture_asset WHERE')) {
          return [{
            id: 'asset-1', shot_id: 'overview', state: 'upload_pending', file_name: 'overview.jpg',
            declared_content_type: 'image/jpeg', declared_size_bytes: 1024,
            declared_sha256: 'b'.repeat(64), blob_path: 'capture/session/asset-1',
            client_quality: clientObservation(),
          }];
        }
        if (transaction === 2 && sql.includes('FROM capture_session s')) {
          return [{
            session_status: lockedStatus,
            token_generation: generation,
            expires_at: new Date(Date.now() + 60_000),
            asset_state: 'upload_pending',
          }];
        }
        return [];
      });
    });
    blobs.createCaptureUploadSas.mockResolvedValue({
      uploadUrl: 'https://storage.example.test/evidence/object?secret-sas',
      headers: { 'x-ms-blob-type': 'BlockBlob' },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const response = await registrations.get('createCaptureUpload')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { 'idempotency-key': 'attempt-1234567890' },
        body: {
          shotId: 'overview', fileName: 'overview.jpg', contentType: 'image/jpeg',
          sizeBytes: 1024, sha256: 'b'.repeat(64), clientObservation: clientObservation(),
        },
      }),
      ctx,
    );

    expect(blobs.createCaptureUploadSas).toHaveBeenCalledOnce();
    expect(response).toMatchObject({ status: 409, jsonBody: { error: 'capture_conflict' } });
    expect(JSON.stringify(response)).not.toContain('secret-sas');
  });

  it('logs only a sanitized category when managed-identity SAS minting fails', async () => {
    process.env.CAPTURE_DIRECT_UPLOAD_ENABLED = 'true';
    db.query.mockResolvedValueOnce([sessionRow()]);
    let persistedObservation: string | undefined;
    db.tx.mockImplementationOnce(async (fn: (q: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('SELECT case_id, status, token_generation')) {
          return [{
            status: 'open', token_generation: 1, expires_at: new Date(Date.now() + 60_000),
            rules_version: 'deterministic-quality-v1', guidance_mode: 'advisory',
          }];
        }
        if (sql.includes('FROM capture_session_shot')) return [{ shot_id: 'overview' }];
        if (sql.includes('FROM capture_asset WHERE')) return [];
        if (sql.includes('COUNT(*) FILTER')) return [{ shot_attempts: 0, session_attempts: 0 }];
        if (sql.includes('INSERT INTO capture_asset')) {
          persistedObservation = String(params[9]);
          return [{
            id: 'asset-1', shot_id: 'overview', state: 'upload_pending', file_name: 'overview.jpg',
            declared_content_type: 'image/jpeg', declared_size_bytes: 1024,
            declared_sha256: 'b'.repeat(64), blob_path: 'capture/session/asset-1',
            client_quality: clientObservation(),
          }];
        }
        return [];
      }));
    blobs.createCaptureUploadSas.mockRejectedValue(Object.assign(
      new Error('https://storage.example/capture/session/asset-1?sig=secret-token'),
      { statusCode: 403, code: 'AuthorizationPermissionMismatch' },
    ));

    const response = await registrations.get('createCaptureUpload')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { 'idempotency-key': 'attempt-1234567890' },
        body: {
          shotId: 'overview', fileName: 'overview.jpg', contentType: 'image/jpeg',
          sizeBytes: 1024, sha256: 'b'.repeat(64), clientObservation: clientObservation(),
        },
      }),
      ctx,
    );

    expect(response).toMatchObject({ status: 503, jsonBody: { error: 'capture_retryable' } });
    const logged = vi.mocked(ctx.error).mock.calls.flat().map(String).join(' ');
    expect(logged).toContain(
      '[capture-upload-intent] sas_unavailable status=403 code=AuthorizationPermissionMismatch',
    );
    expect(logged).not.toContain('capture/session/asset-1');
    expect(logged).not.toContain('secret-token');
    expect(JSON.parse(persistedObservation ?? '')).toEqual(clientObservation());
  });
});

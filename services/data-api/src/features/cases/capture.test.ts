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

describe('capture route foundation and staff sessions', () => {
  it('registers the complete staff and public route surface', () => {
    expect([...registrations.keys()].sort()).toEqual([
      'captureManifest',
      'completeCaptureUpload',
      'createCaptureSession',
      'createCaptureUpload',
      'exchangeCaptureSecret',
      'listCaptureSessions',
      'renewCaptureAccess',
      'revokeCaptureSession',
      'rotateCaptureSession',
      'submitCaptureSession',
    ]);
  });

  it('hides every public route while the capture feature is off', async () => {
    process.env.PUBLIC_CAPTURE_ENABLED = 'false';
    const response = await registrations.get('exchangeCaptureSecret')!.handler(
      request({ body: { bootstrapSecret: 'x'.repeat(43) } }),
      ctx,
    );
    expect(response).toMatchObject({
      status: 404,
      jsonBody: { error: 'capture_missing', message: 'Capture is not available.' },
    });
    expect(response.headers).toMatchObject({ 'Cache-Control': 'no-store' });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('keeps the staff and public kill switches independent', async () => {
    process.env.CAPTURE_SESSIONS_ENABLED = 'false';
    const staff = await registrations.get('listCaptureSessions')!.handler(
      request({ params: { id: 'case-1' } }),
      ctx,
    );
    expect(staff).toMatchObject({ status: 404, jsonBody: { error: 'capture_missing' } });
    expect(db.query).not.toHaveBeenCalled();

    process.env.CAPTURE_SESSIONS_ENABLED = 'true';
    process.env.PUBLIC_CAPTURE_ENABLED = 'false';
    const publicResponse = await registrations.get('exchangeCaptureSecret')!.handler(
      request({ body: { bootstrapSecret: 'x'.repeat(43) } }),
      ctx,
    );
    expect(publicResponse).toMatchObject({ status: 404, jsonBody: { error: 'capture_missing' } });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('validates the public URL before creating a session transaction', async () => {
    delete process.env.CAPTURE_PUBLIC_BASE_URL;
    const response = await registrations.get('createCaptureSession')!.handler(
      request({ params: { id: 'case-1' }, body: { shotPlanId: 'essential-v1', expiresInHours: 72 } }),
      ctx,
    );
    expect(response).toMatchObject({
      status: 503,
      jsonBody: { error: 'capture_retryable' },
    });
    expect(db.tx).not.toHaveBeenCalled();
  });

  it('validates the public URL before rotating or invalidating the old link', async () => {
    delete process.env.CAPTURE_PUBLIC_BASE_URL;
    const response = await registrations.get('rotateCaptureSession')!.handler(
      request({ params: { id: '11111111-1111-4111-8111-111111111111' } }),
      ctx,
    );
    expect(response).toMatchObject({
      status: 503,
      jsonBody: { error: 'capture_retryable' },
    });
    expect(db.query).not.toHaveBeenCalled();
    expect(db.tx).not.toHaveBeenCalled();
  });

  it.each([
    { registration: 'rotateCaptureSession', status: 'open' },
    { registration: 'revokeCaptureSession', status: 'revoked' },
  ])('deletes resume tokens when $registration invalidates session access', async ({ registration, status }) => {
    const sqls: string[] = [];
    db.query
      .mockResolvedValueOnce([{ case_id: 'case-1', status: 'open' }])
      .mockResolvedValueOnce([{
        ...sessionRow({ status }),
        required_total: 2,
        required_completed: 0,
      }]);
    db.tx.mockImplementationOnce(async (fn: (q: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string) => {
        sqls.push(sql);
        if (sql.includes('UPDATE capture_session')) {
          return [{ id: '11111111-1111-4111-8111-111111111111' }];
        }
        return [];
      }));

    const response = await registrations.get(registration)!.handler(
      request({ params: { id: '11111111-1111-4111-8111-111111111111' } }),
      ctx,
    );

    expect(response.status).toBe(200);
    expect(sqls.some((sql) => sql.includes('DELETE FROM capture_session_resume_token'))).toBe(true);
  });

  it('pins guidance and applies documented plan and expiry defaults to a new session', async () => {
    process.env.CAPTURE_GUIDANCE_MODE = 'shadow';
    locks.lockCaseForMutation.mockResolvedValue({ kind: 'active', caseId: 'case-1' });
    const inserts: unknown[][] = [];
    db.tx.mockImplementationOnce(async (fn: (q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('SELECT status_code FROM case_')) return [{ status_code: 100000000 }];
        if (sql.includes('INSERT INTO capture_session\n')) {
          inserts.push(params ?? []);
          return [{ id: '11111111-1111-4111-8111-111111111111' }];
        }
        return [];
      }));
    db.query.mockResolvedValueOnce([{
      ...sessionRow({ guidance_mode: 'shadow' }),
      required_total: 2,
      required_completed: 0,
    }]);

    const response = await registrations.get('createCaptureSession')!.handler(
      request({ params: { id: 'case-1' } }),
      ctx,
    );

    expect(response).toMatchObject({ status: 201 });
    expect(inserts[0]?.[1]).toBe('essential-v1');
    expect(inserts[0]?.[3]).toBe('shadow');
    expect(inserts[0]?.[7]).toBe(168);
    expect((response.jsonBody as { session: { guidanceMode: string } }).session.guidanceMode).toBe('shadow');
  });

  it('fails session creation closed for an invalid guidance override', async () => {
    process.env.CAPTURE_GUIDANCE_MODE = 'automatic';
    const response = await registrations.get('createCaptureSession')!.handler(
      request({ params: { id: 'case-1' }, body: { shotPlanId: 'essential-v1' } }),
      ctx,
    );
    expect(response).toMatchObject({ status: 503, jsonBody: { error: 'capture_retryable' } });
    expect(db.tx).not.toHaveBeenCalled();
  });

  it.each([
    { shotId: '', fileName: 'photo.jpg', sizeBytes: 1 },
    { shotId: 'x'.repeat(81), fileName: 'photo.jpg', sizeBytes: 1 },
    { shotId: 'overview', fileName: '', sizeBytes: 1 },
    { shotId: 'overview', fileName: 'x'.repeat(256), sizeBytes: 1 },
    { shotId: 'overview', fileName: 'photo.jpg', sizeBytes: 0 },
    { shotId: 'overview', fileName: 'photo.jpg', sizeBytes: 1.5 },
  ])('rejects upload boundary violations before the asset transaction: %j', async (invalid) => {
    db.query.mockResolvedValueOnce([sessionRow()]);
    const response = await registrations.get('createCaptureUpload')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { 'idempotency-key': 'attempt-1234567890' },
        body: {
          ...invalid,
          contentType: 'image/jpeg',
          sha256: 'b'.repeat(64),
        },
      }),
      ctx,
    );
    expect(response).toMatchObject({ status: 400, jsonBody: { error: 'capture_validation' } });
    expect(db.tx).not.toHaveBeenCalled();
  });
});

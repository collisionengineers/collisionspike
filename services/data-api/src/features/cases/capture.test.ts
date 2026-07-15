import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

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

function sessionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    case_id: 'case-1',
    status: 'open',
    shot_plan_id: 'essential-v1',
    shot_plan_label: 'Essential vehicle photos',
    guidance_mode: 'advisory',
    rules_version: 'deterministic-quality-v1',
    model_version: null,
    token_generation: 1,
    expires_at: new Date(Date.now() + 60_000),
    created_at: new Date(),
    submitted_at: null,
    submit_idempotency_key: null,
    revoked_at: null,
    ...overrides,
  };
}

function request(input: {
  params?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
} = {}): HttpRequest {
  return {
    params: input.params ?? {},
    headers: new Headers(input.headers),
    json: async () => input.body ?? {},
  } as unknown as HttpRequest;
}

function clientObservation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    route: 'guided',
    disposition: 'ready',
    signals: { brightness: 0.5, contrast: 0.2, sharpness: 0.1, motion: 0.01 },
    stableFrames: 3,
    rulesVersion: 'deterministic-quality-v1',
    ...overrides,
  };
}

beforeEach(() => {
  process.env.CAPTURE_SESSIONS_ENABLED = 'true';
  process.env.PUBLIC_CAPTURE_ENABLED = 'true';
  process.env.CAPTURE_PUBLIC_BASE_URL = 'https://capture.example.test';
  delete process.env.CAPTURE_GUIDANCE_MODE;
  delete process.env.CAPTURE_DIRECT_UPLOAD_ENABLED;
  db.query.mockReset();
  db.tx.mockReset();
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

describe('capture route foundation', () => {
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

  it('rejects bootstrap values that are not exactly one 256-bit base64url secret', async () => {
    const response = await registrations.get('exchangeCaptureSecret')!.handler(
      request({ body: { bootstrapSecret: 'x'.repeat(44) } }),
      ctx,
    );
    expect(response).toMatchObject({
      status: 401,
      jsonBody: { error: 'capture_unauthorized' },
    });
    expect(db.query).not.toHaveBeenCalled();
    expect(db.tx).not.toHaveBeenCalled();
  });

  it('returns the documented conflict shape when a bootstrap session is complete', async () => {
    db.tx.mockImplementationOnce(async (fn: (q: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string) => sql.includes('FROM capture_session')
        ? [sessionRow({ status: 'complete' })]
        : []));

    const response = await registrations.get('exchangeCaptureSecret')!.handler(
      request({ body: { bootstrapSecret: 'x'.repeat(43) } }),
      ctx,
    );

    expect(response).toMatchObject({
      status: 409,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: {
        error: 'capture_conflict',
        message: 'These photos have already been submitted.',
      },
    });
  });

  it('exchanges the fragment secret for access plus a hashed HttpOnly resume cookie', async () => {
    const expiresAt = new Date(Date.now() + (60 * 60 * 1000));
    const session = sessionRow({ expires_at: expiresAt });
    const sqls: string[] = [];
    const params: unknown[][] = [];
    db.tx.mockImplementationOnce(async (fn: (q: (sql: string, values?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string, values: unknown[] = []) => {
        sqls.push(sql);
        params.push(values);
        if (sql.includes('FROM capture_session') && sql.includes('bootstrap_token_hash')) return [session];
        if (sql.includes('SELECT token_hash')) return [];
        return [];
      }));

    const response = await registrations.get('exchangeCaptureSecret')!.handler(
      request({ body: { bootstrapSecret: 'x'.repeat(43) } }),
      ctx,
    );

    expect(response).toMatchObject({
      status: 200,
      jsonBody: {
        sessionId: session.id,
        accessToken: 'short-lived-access-token',
        accessTokenExpiresAt: '2026-07-13T12:15:00.000Z',
      },
    });
    const setCookie = String((response.headers as Record<string, string>)['Set-Cookie']);
    expect(setCookie).toContain(`__Host-collisioncapture-resume=${'r'.repeat(43)}`);
    expect(setCookie).toContain('; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=');
    expect(setCookie).toContain(`Expires=${expiresAt.toUTCString()}`);
    expect(setCookie).not.toContain('Domain=');
    expect(JSON.stringify(response.jsonBody)).not.toContain('r'.repeat(43));
    const insertIndex = sqls.findIndex((sql) => sql.includes('INSERT INTO capture_session_resume_token'));
    expect(insertIndex).toBeGreaterThanOrEqual(0);
    expect(params[insertIndex]?.[0]).toMatch(/^[0-9a-f]{64}$/u);
    expect(params[insertIndex]).not.toContain('r'.repeat(43));
    const slotIndex = sqls.findIndex((sql) => sql.includes('SELECT token_hash'));
    expect(params[slotIndex]).toEqual([session.id, 8]);
    expect(ctx.error).not.toHaveBeenCalled();
  });

  it('reuses the oldest of eight bounded resume slots during repeated exchange', async () => {
    const session = sessionRow();
    const slots = Array.from({ length: 8 }, (_, index) => ({
      token_hash: String(index).repeat(64),
    }));
    const sqls: string[] = [];
    const params: unknown[][] = [];
    db.tx.mockImplementationOnce(async (fn: (q: (sql: string, values?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string, values: unknown[] = []) => {
        sqls.push(sql);
        params.push(values);
        if (sql.includes('FROM capture_session') && sql.includes('bootstrap_token_hash')) return [session];
        if (sql.includes('SELECT token_hash')) return slots;
        if (sql.includes('UPDATE capture_session_resume_token')) return [{ token_hash: 'a'.repeat(64) }];
        return [];
      }));

    const response = await registrations.get('exchangeCaptureSecret')!.handler(
      request({ body: { bootstrapSecret: 'x'.repeat(43) } }),
      ctx,
    );

    expect(response.status).toBe(200);
    expect(sqls.some((sql) => sql.includes('INSERT INTO capture_session_resume_token'))).toBe(false);
    const replaceIndex = sqls.findIndex((sql) => sql.includes('UPDATE capture_session_resume_token'));
    expect(params[replaceIndex]?.slice(0, 2)).toEqual([session.id, slots[7]?.token_hash]);
  });

  it('renews access repeatedly from the exact HttpOnly resume cookie without reading a body', async () => {
    const session = sessionRow({ expires_at: new Date(Date.now() + 60_000) });
    const tokenExpiresAt = new Date(Date.now() + 60_000);
    const sqls: string[] = [];
    const params: unknown[][] = [];
    db.tx.mockImplementation(async (fn: (q: (sql: string, values?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string, values: unknown[] = []) => {
        sqls.push(sql);
        params.push(values);
        if (sql.includes('SELECT session_id FROM capture_session_resume_token')) {
          return [{ session_id: session.id }];
        }
        if (sql.includes('SELECT id, status, expires_at, token_generation')) return [session];
        if (sql.includes('SELECT token_generation, expires_at')) {
          return [{ token_generation: 1, expires_at: tokenExpiresAt }];
        }
        return [];
      }));
    const renewalRequest = request({
      headers: { cookie: `__Host-collisioncapture-resume=${'r'.repeat(43)}` },
    });
    const readBody = vi.fn();
    Object.defineProperty(renewalRequest, 'json', { configurable: true, value: readBody });

    const first = await registrations.get('renewCaptureAccess')!.handler(renewalRequest, ctx);
    const replay = await registrations.get('renewCaptureAccess')!.handler(renewalRequest, ctx);

    expect(first).toMatchObject({
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: {
        sessionId: session.id,
        accessToken: 'short-lived-access-token',
        accessTokenExpiresAt: '2026-07-13T12:15:00.000Z',
      },
    });
    expect(replay).toMatchObject({ status: 200 });
    expect((first.headers as Record<string, string>)['Set-Cookie']).toBeUndefined();
    expect(captureAuth.mintCaptureAccessToken).toHaveBeenCalledTimes(2);
    expect(sqls.filter((sql) => sql.includes('SET last_used_at = now()'))).toHaveLength(2);
    const sessionLockIndex = sqls.findIndex((sql) => sql.includes('SELECT id, status, expires_at, token_generation'));
    const tokenLockIndex = sqls.findIndex((sql) => sql.includes('SELECT token_generation, expires_at'));
    expect(sessionLockIndex).toBeGreaterThanOrEqual(0);
    expect(tokenLockIndex).toBeGreaterThan(sessionLockIndex);
    expect(sqls[sessionLockIndex]).toContain('FOR UPDATE');
    expect(sqls[tokenLockIndex]).toContain('FOR UPDATE');
    const ownerIndex = sqls.findIndex((sql) => sql.includes('SELECT session_id FROM capture_session_resume_token'));
    expect(params[ownerIndex]?.[0]).toMatch(/^[0-9a-f]{64}$/u);
    expect(params.flat()).not.toContain('r'.repeat(43));
    expect(readBody).not.toHaveBeenCalled();
    expect(ctx.error).not.toHaveBeenCalled();
  });

  it('rejects renewal without the exact resume cookie before opening a transaction', async () => {
    const response = await registrations.get('renewCaptureAccess')!.handler(
      request({ headers: { cookie: `collisioncapture-resume=${'r'.repeat(43)}` } }),
      ctx,
    );

    expect(response).toMatchObject({
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: { error: 'capture_unauthorized' },
    });
    expect(db.tx).not.toHaveBeenCalled();
    expect(captureAuth.mintCaptureAccessToken).not.toHaveBeenCalled();
  });

  it('hides access renewal behind the public capture feature gate', async () => {
    process.env.PUBLIC_CAPTURE_ENABLED = 'false';

    const response = await registrations.get('renewCaptureAccess')!.handler(
      request({ headers: { cookie: `__Host-collisioncapture-resume=${'r'.repeat(43)}` } }),
      ctx,
    );

    expect(response).toMatchObject({ status: 404, jsonBody: { error: 'capture_missing' } });
    expect(db.tx).not.toHaveBeenCalled();
  });

  it('invalidates a resume cookie when its token generation predates rotation', async () => {
    db.tx.mockImplementationOnce(async (fn: (q: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string) => {
        if (sql.includes('SELECT session_id FROM capture_session_resume_token')) {
          return [{ session_id: '11111111-1111-4111-8111-111111111111' }];
        }
        if (sql.includes('SELECT id, status, expires_at, token_generation')) {
          return [sessionRow({ token_generation: 2 })];
        }
        if (sql.includes('SELECT token_generation, expires_at')) {
          return [{ token_generation: 1, expires_at: new Date(Date.now() + 60_000) }];
        }
        return [];
      }));

    const response = await registrations.get('renewCaptureAccess')!.handler(
      request({ headers: { cookie: `__Host-collisioncapture-resume=${'r'.repeat(43)}` } }),
      ctx,
    );

    expect(response).toMatchObject({ status: 401, jsonBody: { error: 'capture_unauthorized' } });
    expect(captureAuth.mintCaptureAccessToken).not.toHaveBeenCalled();
  });

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
    expect(inserts[0]?.[7]).toBe(72);
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

  it('returns schema-safe manifest progress without filenames or internal upload fields', async () => {
    const caseReference = 'R'.repeat(100);
    const vehicleLabel = 'V'.repeat(200);
    db.query
      .mockResolvedValueOnce([sessionRow()])
      .mockResolvedValueOnce([{ case_ref: caseReference, case_po: null, vrm: 'AB12CDE', eva_vehicle_model: vehicleLabel }])
      .mockResolvedValueOnce([{
        shot_id: 'overview', role: 'overview', evidence_role: 'overview', label: 'Vehicle overview',
        prompt: 'Take the whole vehicle.', required: true, sequence: 10,
      }])
      .mockResolvedValueOnce([{
        shot_id: 'overview', id: '22222222-2222-4222-8222-222222222222',
        state: 'materialised', file_name: 'secret-name.jpg',
      }]);
    const response = await registrations.get('captureManifest')!.handler(
      request({ params: { id: '11111111-1111-4111-8111-111111111111' } }),
      ctx,
    );
    expect((response.jsonBody as { progress: unknown[] }).progress).toEqual([{
      shotId: 'overview',
      status: 'pending_review',
      assetId: '22222222-2222-4222-8222-222222222222',
    }]);
    expect(response.jsonBody).toMatchObject({ caseReference, vehicleLabel });
  });

  it('prefers a selected asset, otherwise exposes the latest rejected or validating attempt safely', async () => {
    db.query
      .mockResolvedValueOnce([sessionRow()])
      .mockResolvedValueOnce([{ case_ref: 'CASE-1', case_po: null, vrm: null, eva_vehicle_model: null }])
      .mockResolvedValueOnce([
        {
          shot_id: 'overview', role: 'overview', evidence_role: 'overview', label: 'Overview',
          prompt: 'Take the whole vehicle.', required: true, sequence: 10,
        },
        {
          shot_id: 'damage', role: 'damage_closeup', evidence_role: 'damage_closeup', label: 'Damage',
          prompt: 'Take the damage.', required: true, sequence: 20,
        },
        {
          shot_id: 'additional', role: 'additional', evidence_role: 'additional', label: 'Additional',
          prompt: 'Take another photo.', required: false, sequence: 30,
        },
      ])
      .mockResolvedValueOnce([
        { shot_id: 'overview', id: 'selected-older', state: 'pending_review' },
        { shot_id: 'damage', id: 'latest-rejected', state: 'rejected' },
        { shot_id: 'additional', id: 'latest-validating', state: 'validating' },
      ]);

    const response = await registrations.get('captureManifest')!.handler(
      request({ params: { id: '11111111-1111-4111-8111-111111111111' } }),
      ctx,
    );

    expect((response.jsonBody as { progress: unknown[] }).progress).toEqual([
      { shotId: 'overview', status: 'pending_review', assetId: 'selected-older' },
      {
        shotId: 'damage', status: 'rejected', assetId: 'latest-rejected',
        rejectionReason: 'This photo was not accepted. Take it again.',
      },
      { shotId: 'additional', status: 'validating', assetId: 'latest-validating' },
    ]);
    const progressSql = String(db.query.mock.calls[3]?.[0]);
    expect(progressSql).toContain('ORDER BY shot_id, selected DESC, created_at DESC, id DESC');
    expect(progressSql).not.toContain('selected = true');
    expect(JSON.stringify(response.jsonBody)).not.toContain('validation_code');
  });

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

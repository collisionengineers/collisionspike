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
import { captureRateLimitResponse } from './capture-rate-limit.js';

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

describe('capture public access, manifest, and rate limiting', () => {
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

  it('emits shaped per-shot guidance on the manifest and drops profile keys outside the contract', async () => {
    db.query
      .mockResolvedValueOnce([sessionRow()])
      .mockResolvedValueOnce([{ case_ref: 'CASE-1', case_po: null, vrm: null, eva_vehicle_model: null }])
      .mockResolvedValueOnce([
        {
          shot_id: 'overview', role: 'overview', evidence_role: 'overview', label: 'Vehicle overview',
          prompt: 'Take the whole vehicle.', required: true, sequence: 10,
          guidance_profile: { framing: 'whole_vehicle', registrationExpected: true, internalHint: 'drop-me' },
        },
        {
          shot_id: 'damage', role: 'damage_closeup', evidence_role: 'damage_closeup', label: 'Damage',
          prompt: 'Take the damage.', required: true, sequence: 20,
          guidance_profile: { framing: 'damage_closeup' },
        },
        {
          shot_id: 'mystery', role: 'additional', evidence_role: 'additional', label: 'Extra',
          prompt: 'Take another photo.', required: false, sequence: 30,
          guidance_profile: { registrationExpected: true },
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await registrations.get('captureManifest')!.handler(
      request({ params: { id: '11111111-1111-4111-8111-111111111111' } }),
      ctx,
    );

    const shotsSql = String(db.query.mock.calls[2]?.[0]);
    expect(shotsSql).toContain('guidance_profile');
    const shots = (response.jsonBody as { shots: Array<Record<string, unknown>> }).shots;
    // A known shot carries its framing; unknown profile keys are dropped for additionalProperties:false.
    expect(shots[0]).toMatchObject({ id: 'overview' });
    expect(shots[0]!.guidanceProfile).toEqual({ framing: 'whole_vehicle', registrationExpected: true });
    // registrationExpected is optional and omitted when the profile does not set it.
    expect(shots[1]!.guidanceProfile).toEqual({ framing: 'damage_closeup' });
    // A profile without a valid framing is omitted so no guidance leaks to the client.
    expect(shots[2]).not.toHaveProperty('guidanceProfile');
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

  it('refuses an exchange burst with 429 capture_retryable before any database work', async () => {
    rateLimit.caller.mockResolvedValueOnce(captureRateLimitResponse());
    const response = await registrations.get('exchangeCaptureSecret')!.handler(
      request({
        body: { bootstrapSecret: 'a'.repeat(43) },
        headers: { 'x-forwarded-for': '203.0.113.9' },
      }),
      ctx,
    );
    expect(response).toMatchObject({ status: 429, jsonBody: { error: 'capture_retryable' } });
    expect(response.headers).toMatchObject({ 'Retry-After': '60', 'Cache-Control': 'no-store' });
    expect(rateLimit.caller.mock.calls[0]?.[1]).toBe('exchange');
    expect(db.query).not.toHaveBeenCalled();
    expect(db.tx).not.toHaveBeenCalled();
  });

  it('consumes the session budget only after bearer verification on the manifest route', async () => {
    rateLimit.session.mockResolvedValueOnce(captureRateLimitResponse());
    db.query.mockResolvedValueOnce([sessionRow()]);
    const response = await registrations.get('captureManifest')!.handler(
      request({ params: { id: '11111111-1111-4111-8111-111111111111' } }),
      ctx,
    );
    expect(response).toMatchObject({ status: 429, jsonBody: { error: 'capture_retryable' } });
    expect(rateLimit.session).toHaveBeenCalledWith(
      'manifest',
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('never consumes a session budget for an unauthenticated manifest probe', async () => {
    captureAuth.verifyCaptureAccessToken.mockRejectedValueOnce(new Error('missing'));
    const response = await registrations.get('captureManifest')!.handler(
      request({ params: { id: '11111111-1111-4111-8111-111111111111' } }),
      ctx,
    );
    expect(response).toMatchObject({ status: 401, jsonBody: { error: 'capture_unauthorized' } });
    expect(rateLimit.caller).toHaveBeenCalledTimes(1);
    expect(rateLimit.session).not.toHaveBeenCalled();
  });

  it('rate limits renew, uploads, complete and submit through the same caller budget', async () => {
    for (const [name, expectedScope] of [
      ['renewCaptureAccess', 'renew'],
      ['createCaptureUpload', undefined],
      ['completeCaptureUpload', undefined],
      ['submitCaptureSession', undefined],
    ] as const) {
      rateLimit.caller.mockReset();
      rateLimit.caller.mockResolvedValueOnce(captureRateLimitResponse());
      const response = await registrations.get(name)!.handler(
        request({
          params: { id: '11111111-1111-4111-8111-111111111111', assetId: 'asset-1' },
          headers: { 'idempotency-key': 'key-1234567890123456' },
        }),
        ctx,
      );
      expect(response).toMatchObject({ status: 429, jsonBody: { error: 'capture_retryable' } });
      expect(rateLimit.caller.mock.calls[0]?.[1]).toBe(expectedScope);
    }
  });

  it('refuses a saturated decode path retryably and releases the validation lease', async () => {
    process.env.CAPTURE_DECODE_CONCURRENCY = '1';
    const releasedCodes: string[] = [];
    db.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM capture_session WHERE id = $1')) return [sessionRow()];
      if (sql.includes("SET state = 'upload_pending', validation_code = $3")) {
        releasedCodes.push(String(params?.[2]));
      }
      return [];
    });
    db.tx.mockImplementation(async (fn: (q: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
      fn(async (sql: string) => {
        if (sql.includes('FROM capture_asset a')) {
          return [{
            id: 'asset-1', shot_id: 'overview', state: 'upload_pending',
            blob_path: 'capture/session/asset', file_name: 'photo.jpg',
            declared_content_type: 'image/jpeg', declared_size_bytes: 5,
            declared_sha256: 'a'.repeat(64), session_status: 'open',
            session_expires_at: new Date(Date.now() + 60_000), session_token_generation: 1,
            validation_lease_expires_at: null,
          }];
        }
        return [];
      }));
    blobs.getCaptureBlobProperties.mockResolvedValue({ contentLength: 5, contentType: 'image/jpeg' });
    let releaseDownload!: (bytes: Buffer) => void;
    const downloadStarted = new Promise<void>((resolveStarted) => {
      blobs.downloadCaptureBlobBytes.mockImplementationOnce(() => {
        resolveStarted();
        return new Promise<Buffer>((resolve) => { releaseDownload = resolve; });
      });
    });

    const completeRequest = () => registrations.get('completeCaptureUpload')!.handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111', assetId: 'asset-1' },
        body: { sizeBytes: 5, sha256: 'a'.repeat(64) },
      }),
      ctx,
    );
    const first = completeRequest();
    await downloadStarted;
    const second = await completeRequest();
    expect(second).toMatchObject({ status: 503, jsonBody: { error: 'capture_retryable' } });
    expect(releasedCodes).toContain('decode_capacity_retryable');

    // The saturated caller retried; the in-flight decode finishes normally afterwards.
    releaseDownload(Buffer.from('xxxxx'));
    const firstResponse = await first;
    expect(firstResponse.status).toBe(422);
  });
});

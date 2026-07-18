import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { createHash, randomUUID } from 'node:crypto';
import { evidenceKindCodec, imageRoleCodec, statusToInt } from '@cs/domain/codecs';
import { withRole } from '../../platform/auth/staff-auth.js';
import { actorFromClaims, AUDIT_ACTION, writeAuditStrict } from '../../shared/audit.js';
import {
  captureStagingBlobPath,
  createCaptureUploadSas,
  deleteCaptureStagingBlob,
  downloadCaptureBlobBytes,
  getCaptureBlobProperties,
  promoteCaptureBlob,
} from '../evidence/blob-store.js';
import {
  captureResumeCookie,
  captureResumeSecretFromRequest,
  captureSecretHash,
  clearCaptureResumeCookie,
  mintCaptureAccessToken,
  newBootstrapSecret,
  newResumeSecret,
  verifyCaptureAccessToken,
} from './capture-auth.js';
import {
  captureExpiryHours,
  captureShotPlan,
  configuredCaptureGuidanceMode,
} from './capture-plans.js';
import { lockCaseForMutation } from './mutation-locks.js';
import { withResolvedCaseMutationTarget } from './case-mutation-target.js';
import { query, tx, type TxQuery } from '../../platform/db/client.js';
import { gates } from '../settings/gates.js';
import {
  callerRateLimitResponse,
  sessionRateLimitResponse,
  tryAcquireDecodeSlot,
} from './capture-rate-limit.js';
import { requestArchiveMirror, type ArchiveMirrorCandidate } from '../archive/mirror-outbox.js';
import { requestStatusRecompute } from './status-recompute.js';
import {
  classifyUpload,
  MAX_UPLOAD_BYTES,
  validateUploadContent,
  validatedImageDimensions,
} from '../evidence/upload-validate.js';

const SHA256_RE = /^[0-9a-f]{64}$/;
const BOOTSTRAP_SECRET_RE = /^[A-Za-z0-9_-]{43}$/;
const IDEMPOTENCY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const PUBLIC_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VALIDATION_LEASE_SECONDS = 5 * 60;
const MAX_RESUME_TOKENS_PER_SESSION = 8;
const MAX_UPLOAD_RESERVATIONS_PER_SHOT = 8;
const MAX_UPLOAD_RESERVATIONS_PER_SESSION = 60;
const MAX_CLIENT_OBSERVATION_BYTES = 1024;
const MAX_STABLE_FRAMES = 120;
const CAPTURE_SHOT_FRAMINGS = new Set([
  'whole_vehicle',
  'damage_closeup',
  'damage_context',
  'front_left',
  'front_right',
  'rear_left',
  'rear_right',
  'vin',
  'odometer',
  'additional',
]);
const CLIENT_CAPTURE_ROUTES = ['guided', 'os_fallback'] as const;
const CLIENT_CAPTURE_DISPOSITIONS = ['ready', 'take_anyway', 'unassessed'] as const;
const CLIENT_CAPTURE_ISSUES = [
  'too-dark',
  'too-bright',
  'camera-moving',
  'not-sharp',
  'low-contrast',
] as const;
const TERMINAL_STATUS_CODES = [
  statusToInt('eva_submitted'),
  statusToInt('box_synced'),
  statusToInt('removed'),
  statusToInt('done'),
];

type StoredStatus = 'open' | 'complete' | 'revoked' | 'locked' | 'expired';
type PublicStatus = StoredStatus | 'expired';
type ClientCaptureRoute = typeof CLIENT_CAPTURE_ROUTES[number];
type ClientCaptureDisposition = typeof CLIENT_CAPTURE_DISPOSITIONS[number];
type ClientCaptureIssue = typeof CLIENT_CAPTURE_ISSUES[number];

interface ClientCaptureSignals {
  brightness: number;
  contrast: number;
  sharpness: number;
  motion: number;
}

interface ClientCaptureObservation {
  route: ClientCaptureRoute;
  disposition: ClientCaptureDisposition;
  issue?: ClientCaptureIssue;
  signals?: ClientCaptureSignals;
  stableFrames: number;
  rulesVersion: string;
}

interface SessionRow extends Record<string, unknown> {
  id: string;
  case_id: string;
  status: StoredStatus;
  shot_plan_id: string;
  shot_plan_label: string;
  guidance_mode: string;
  rules_version: string;
  model_version: string | null;
  token_generation: number;
  expires_at: Date | string;
  created_at: Date | string;
  submitted_at: Date | string | null;
  submit_idempotency_key: string | null;
  revoked_at: Date | string | null;
}

interface SummaryRow extends SessionRow {
  required_total: string | number;
  required_completed: string | number;
}

interface CaptureAssetReservationRow extends Record<string, unknown> {
  id: string;
  shot_id: string;
  state: string;
  file_name: string;
  declared_content_type: string;
  declared_size_bytes: string | number;
  declared_sha256: string;
  blob_path: string;
  client_quality: unknown;
}

class CaptureProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function clientGuidanceProfile(
  raw: unknown,
): { guidanceProfile: { framing: string; registrationExpected?: boolean } } | Record<string, never> {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return {};
    }
  }
  if (!isRecord(value)) return {};
  const framing = value.framing;
  if (typeof framing !== 'string' || !CAPTURE_SHOT_FRAMINGS.has(framing)) return {};
  return {
    guidanceProfile: {
      framing,
      ...(typeof value.registrationExpected === 'boolean'
        ? { registrationExpected: value.registrationExpected }
        : {}),
    },
  };
}

function normalizedClientCaptureObservation(
  raw: unknown,
  expectedRulesVersion: string,
): ClientCaptureObservation {
  let serialized: string;
  try {
    serialized = JSON.stringify(raw);
  } catch {
    throw new CaptureProblem(400, 'capture_validation', 'The photo guidance details are invalid.');
  }
  if (!serialized || Buffer.byteLength(serialized, 'utf8') > MAX_CLIENT_OBSERVATION_BYTES || !isRecord(raw)) {
    throw new CaptureProblem(400, 'capture_validation', 'The photo guidance details are invalid.');
  }
  if (!hasOnlyKeys(raw, ['route', 'disposition', 'issue', 'signals', 'stableFrames', 'rulesVersion'])) {
    throw new CaptureProblem(400, 'capture_validation', 'The photo guidance details are invalid.');
  }
  if (
    typeof raw.route !== 'string'
    || !CLIENT_CAPTURE_ROUTES.includes(raw.route as ClientCaptureRoute)
    || typeof raw.disposition !== 'string'
    || !CLIENT_CAPTURE_DISPOSITIONS.includes(raw.disposition as ClientCaptureDisposition)
    || typeof raw.stableFrames !== 'number'
    || !Number.isInteger(raw.stableFrames)
    || raw.stableFrames < 0
    || raw.stableFrames > MAX_STABLE_FRAMES
    || typeof raw.rulesVersion !== 'string'
    || raw.rulesVersion.length < 1
    || raw.rulesVersion.length > 64
    || raw.rulesVersion !== expectedRulesVersion
  ) {
    throw new CaptureProblem(400, 'capture_validation', 'The photo guidance details are invalid.');
  }

  let issue: ClientCaptureIssue | undefined;
  if (raw.issue !== undefined) {
    if (typeof raw.issue !== 'string' || !CLIENT_CAPTURE_ISSUES.includes(raw.issue as ClientCaptureIssue)) {
      throw new CaptureProblem(400, 'capture_validation', 'The photo guidance details are invalid.');
    }
    issue = raw.issue as ClientCaptureIssue;
  }

  let signals: ClientCaptureSignals | undefined;
  if (raw.signals !== undefined) {
    if (!isRecord(raw.signals) || !hasOnlyKeys(raw.signals, ['brightness', 'contrast', 'sharpness', 'motion'])) {
      throw new CaptureProblem(400, 'capture_validation', 'The photo guidance details are invalid.');
    }
    const values = [
      raw.signals.brightness,
      raw.signals.contrast,
      raw.signals.sharpness,
      raw.signals.motion,
    ];
    if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)) {
      throw new CaptureProblem(400, 'capture_validation', 'The photo guidance details are invalid.');
    }
    signals = {
      brightness: raw.signals.brightness as number,
      contrast: raw.signals.contrast as number,
      sharpness: raw.signals.sharpness as number,
      motion: raw.signals.motion as number,
    };
  }

  if (
    (raw.disposition === 'unassessed' && (issue !== undefined || signals !== undefined || raw.stableFrames !== 0))
    || (raw.disposition === 'ready' && (issue !== undefined || signals === undefined))
    || (raw.route === 'guided' && raw.disposition === 'ready' && raw.stableFrames < 1)
    || (issue !== undefined && signals === undefined)
  ) {
    throw new CaptureProblem(400, 'capture_validation', 'The photo guidance details are invalid.');
  }

  return {
    route: raw.route as ClientCaptureRoute,
    disposition: raw.disposition as ClientCaptureDisposition,
    ...(issue === undefined ? {} : { issue }),
    ...(signals === undefined ? {} : { signals }),
    stableFrames: raw.stableFrames,
    rulesVersion: raw.rulesVersion,
  };
}

function storedClientObservationFingerprint(raw: unknown, rulesVersion: string): string | undefined {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) as unknown : raw;
    return JSON.stringify(normalizedClientCaptureObservation(value, rulesVersion));
  } catch {
    return undefined;
  }
}

function boundedContentType(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toLowerCase().split(';')[0]?.trim() ?? '';
  return normalized ? normalized.slice(0, 200) : undefined;
}

function serverStructuralObservation(input: {
  result: 'blob_properties_mismatch' | 'structural_validation_failed' | 'passed';
  contentType?: unknown;
  sizeBytes?: number | null;
  propertiesMatch: boolean;
  hashMatches?: boolean;
  magicBytesValid?: boolean;
  decodable?: boolean;
  width?: number;
  height?: number;
}): string {
  return JSON.stringify({
    version: 'structural-v1',
    result: input.result,
    propertiesMatch: input.propertiesMatch,
    ...(boundedContentType(input.contentType) ? { contentType: boundedContentType(input.contentType) } : {}),
    ...(typeof input.sizeBytes === 'number' && Number.isFinite(input.sizeBytes)
      ? { sizeBytes: Math.max(0, Math.min(input.sizeBytes, MAX_UPLOAD_BYTES)) }
      : {}),
    ...(input.hashMatches === undefined ? {} : { hashMatches: input.hashMatches }),
    ...(input.magicBytesValid === undefined ? {} : { magicBytesValid: input.magicBytesValid }),
    ...(input.decodable === undefined ? {} : { decodable: input.decodable }),
    ...(input.width === undefined ? {} : { width: input.width }),
    ...(input.height === undefined ? {} : { height: input.height }),
  });
}

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function publicStatus(row: Pick<SessionRow, 'status' | 'expires_at'>): PublicStatus {
  return row.status === 'open' && new Date(row.expires_at).getTime() <= Date.now()
    ? 'expired'
    : row.status;
}

function noStore(response: HttpResponseInit): HttpResponseInit {
  return { ...response, headers: { ...(response.headers ?? {}), 'Cache-Control': 'no-store' } };
}

function problem(status: number, error: string, message: string): HttpResponseInit {
  return noStore({ status, jsonBody: { error, message } });
}

function logStorageFailure(
  ctx: InvocationContext,
  category: string,
  error: unknown,
): void {
  const storageError = error as { statusCode?: unknown; code?: unknown };
  const status = typeof storageError?.statusCode === 'number'
    && Number.isInteger(storageError.statusCode)
    && storageError.statusCode >= 100
    && storageError.statusCode <= 599
    ? storageError.statusCode
    : undefined;
  const code = typeof storageError?.code === 'string'
    && /^[A-Za-z0-9_.-]{1,80}$/.test(storageError.code)
    ? storageError.code
    : undefined;
  const detail = [status == null ? undefined : `status=${status}`, code ? `code=${code}` : undefined]
    .filter(Boolean)
    .join(' ');
  ctx.error(`${category}${detail ? ` ${detail}` : ''}`);
}

function staffCaptureFeature(): HttpResponseInit | undefined {
  return gates.captureSessions()
    ? undefined
    : problem(404, 'capture_missing', 'Capture is not available.');
}

async function storeCaptureResumeToken(
  q: TxQuery,
  sessionId: string,
  tokenGeneration: number,
  expiresAt: Date | string,
): Promise<string> {
  const secret = newResumeSecret();
  const tokenHash = captureSecretHash(secret);
  const slots = await q<{ token_hash: string }>(
    `SELECT token_hash
       FROM capture_session_resume_token
      WHERE session_id = $1
      ORDER BY created_at DESC, token_hash DESC
      LIMIT $2
      FOR UPDATE`,
    [sessionId, MAX_RESUME_TOKENS_PER_SESSION],
  );
  if (slots.length >= MAX_RESUME_TOKENS_PER_SESSION) {
    const oldest = slots[slots.length - 1];
    if (!oldest) throw new Error('capture resume token slot disappeared');
    const replaced = await q<{ token_hash: string }>(
      `UPDATE capture_session_resume_token
          SET token_hash = $3, token_generation = $4, expires_at = $5,
              created_at = now(), last_used_at = NULL
        WHERE session_id = $1 AND token_hash = $2
        RETURNING token_hash`,
      [sessionId, oldest.token_hash, tokenHash, tokenGeneration, expiresAt],
    );
    if (!replaced[0]) throw new Error('capture resume token slot could not be replaced');
  } else {
    await q(
      `INSERT INTO capture_session_resume_token
         (token_hash, session_id, token_generation, expires_at)
       VALUES ($1,$2,$3,$4)`,
      [tokenHash, sessionId, tokenGeneration, expiresAt],
    );
  }
  return secret;
}

function publicCaptureFeature(): HttpResponseInit | undefined {
  return gates.publicCapture()
    ? undefined
    : problem(404, 'capture_missing', 'Capture is not available.');
}

function summary(row: SummaryRow): Record<string, unknown> {
  const submittedAt = row.submitted_at ? iso(row.submitted_at) : undefined;
  return {
    sessionId: row.id,
    status: publicStatus(row),
    shotPlanId: row.shot_plan_id,
    shotPlanLabel: row.shot_plan_label,
    guidanceMode: row.guidance_mode,
    expiresAt: iso(row.expires_at),
    createdAt: iso(row.created_at),
    ...(submittedAt ? { submittedAt } : {}),
    requiredTotal: Number(row.required_total),
    requiredCompleted: Number(row.required_completed),
  };
}

const SUMMARY_SELECT = `
  SELECT s.*,
         COUNT(sh.shot_id) FILTER (WHERE sh.required) AS required_total,
         COUNT(sh.shot_id) FILTER (
           WHERE sh.required AND EXISTS (
             SELECT 1 FROM capture_asset a
              WHERE a.session_id = s.id AND a.shot_id = sh.shot_id
                AND a.selected = true
                AND a.state IN ('accepted','pending_review','materialised')
           )
         ) AS required_completed
    FROM capture_session s
    LEFT JOIN capture_session_shot sh ON sh.session_id = s.id`;

async function summaryById(sessionId: string, q: TxQuery | typeof query = query): Promise<SummaryRow | undefined> {
  const rows = await q<SummaryRow>(
    `${SUMMARY_SELECT} WHERE s.id = $1 GROUP BY s.id`,
    [sessionId],
  );
  return rows[0];
}

async function releaseValidationAttempt(
  assetId: string,
  validationAttempt: string,
  validationCode: string,
): Promise<void> {
  await query(
    `UPDATE capture_asset
        SET state = 'upload_pending', validation_code = $3,
            validation_attempt = NULL, validation_lease_expires_at = NULL,
            updated_at = now()
      WHERE id = $1 AND state = 'validating' AND validation_attempt = $2`,
    [assetId, validationAttempt, validationCode],
  );
}

async function lockCaptureSessionInTransaction(
  q: TxQuery,
  sessionId: string,
  expectedCaseId: string,
  reason: string,
): Promise<boolean> {
  const locked = await q<{ case_id: string }>(
    `UPDATE capture_session
        SET status = 'locked', locked_at = COALESCE(locked_at, now()),
            token_generation = token_generation + 1, updated_at = now()
      WHERE id = $1 AND case_id = $2 AND status = 'open'
      RETURNING case_id`,
    [sessionId, expectedCaseId],
  );
  if (!locked[0]) return false;
  await q('DELETE FROM capture_session_resume_token WHERE session_id = $1', [sessionId]);
  await writeAuditStrict({
    action: AUDIT_ACTION.capture_session_locked,
    caseId: locked[0].case_id,
    actor: 'System',
    summary: 'Guided capture session locked for staff review',
    after: { sessionId, reason },
  }, q);
  return true;
}

async function lockCaptureSessionForStaffResolution(
  sessionId: string,
  reason: string,
): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const owner = await staffSessionOwner(sessionId);
    if (!owner || owner.status !== 'open') return;
    const outcome = await tx(async (q) => {
      const lockedCase = await lockCaseForMutation(q, owner.caseId);
      if (lockedCase.kind === 'missing') return 'gone' as const;
      return await lockCaptureSessionInTransaction(q, sessionId, owner.caseId, reason)
        ? 'locked' as const
        : 'retry' as const;
    });
    if (outcome !== 'retry') return;
  }
  throw new CaptureProblem(503, 'capture_retryable', 'This capture session is changing. Try again.');
}

async function retargetOpenCaptureSession(
  q: TxQuery,
  sessionId: string,
  currentCaseId: string,
  targetCaseId: string,
  lineage: readonly string[],
): Promise<boolean> {
  if (currentCaseId === targetCaseId) return false;
  const retargeted = await q<{ id: string }>(
    `UPDATE capture_session
        SET case_id = $2, updated_at = now()
      WHERE id = $1 AND case_id = $3 AND status = 'open'
      RETURNING id`,
    [sessionId, targetCaseId, currentCaseId],
  );
  if (!retargeted[0]) {
    throw new CaptureProblem(409, 'capture_retryable', 'This capture session changed. Try again.');
  }
  await writeAuditStrict({
    action: AUDIT_ACTION.capture_session_retargeted,
    caseId: targetCaseId,
    actor: 'System',
    summary: 'Guided capture session moved to merged case survivor',
    before: { caseId: currentCaseId },
    after: { sessionId, caseId: targetCaseId, lineage },
  }, q);
  return true;
}

function captureUrl(secret: string): string {
  const configured = (process.env.CAPTURE_PUBLIC_BASE_URL ?? '').trim();
  let base: URL;
  try {
    base = new URL(configured);
  } catch {
    throw new CaptureProblem(503, 'capture_retryable', 'Capture links are not configured.');
  }
  if (
    base.protocol !== 'https:'
    || base.username !== ''
    || base.password !== ''
    || base.search !== ''
    || base.hash !== ''
  ) {
    throw new CaptureProblem(503, 'capture_retryable', 'Capture links are not configured.');
  }
  return `${base.toString().replace(/\/$/u, '')}/#capture=${secret}`;
}

async function staffSessionOwner(
  sessionId: string,
): Promise<{ caseId: string; status: StoredStatus } | undefined> {
  const rows = await query<{ case_id: string; status: StoredStatus }>(
    'SELECT case_id, status FROM capture_session WHERE id = $1',
    [sessionId],
  );
  return rows[0] ? { caseId: rows[0].case_id, status: rows[0].status } : undefined;
}

async function activePublicSession(req: HttpRequest, expectedSessionId: string): Promise<SessionRow> {
  let claims;
  try {
    claims = await verifyCaptureAccessToken(req);
  } catch {
    throw new CaptureProblem(401, 'capture_unauthorized', 'This capture link is not authorized.');
  }
  if (claims.sub !== expectedSessionId) {
    throw new CaptureProblem(401, 'capture_unauthorized', 'This capture link is not authorized.');
  }
  const rows = await query<SessionRow>(
    `SELECT id, case_id, status, shot_plan_id, shot_plan_label, guidance_mode,
            rules_version, model_version, token_generation, expires_at, created_at,
            submitted_at, submit_idempotency_key, revoked_at
       FROM capture_session WHERE id = $1`,
    [expectedSessionId],
  );
  const row = rows[0];
  if (!row || Number(row.token_generation) !== claims.generation) {
    throw new CaptureProblem(401, 'capture_unauthorized', 'This capture link is not authorized.');
  }
  const status = publicStatus(row);
  if (status === 'expired') throw new CaptureProblem(410, 'capture_expired', 'This capture link has expired.');
  if (status === 'revoked') throw new CaptureProblem(410, 'capture_revoked', 'This capture link has been withdrawn.');
  if (status === 'locked') throw new CaptureProblem(423, 'capture_locked', 'This capture link is locked.');
  return row;
}

/**
 * Submit is the only route that accepts the immediately previous generation after
 * completion. That narrow exception lets the same still-valid signed bearer replay
 * the same idempotency key, while the generation bump continues to revoke manifest,
 * upload and completion access.
 */
async function submitPublicSession(req: HttpRequest, expectedSessionId: string): Promise<SessionRow> {
  let claims;
  try {
    claims = await verifyCaptureAccessToken(req);
  } catch {
    throw new CaptureProblem(401, 'capture_unauthorized', 'This capture link is not authorized.');
  }
  if (claims.sub !== expectedSessionId) {
    throw new CaptureProblem(401, 'capture_unauthorized', 'This capture link is not authorized.');
  }
  const rows = await query<SessionRow>(
    `SELECT id, case_id, status, shot_plan_id, shot_plan_label, guidance_mode,
            rules_version, model_version, token_generation, expires_at, created_at,
            submitted_at, submit_idempotency_key, revoked_at
       FROM capture_session WHERE id = $1`,
    [expectedSessionId],
  );
  const row = rows[0];
  if (!row) throw new CaptureProblem(401, 'capture_unauthorized', 'This capture link is not authorized.');
  const generation = Number(row.token_generation);
  const currentGeneration = generation === claims.generation;
  const completedReplay = row.status === 'complete' && generation === claims.generation + 1;
  if (!currentGeneration && !completedReplay) {
    throw new CaptureProblem(401, 'capture_unauthorized', 'This capture link is not authorized.');
  }
  if (completedReplay) return row;
  const status = publicStatus(row);
  if (status === 'expired') throw new CaptureProblem(410, 'capture_expired', 'This capture link has expired.');
  if (status === 'revoked') throw new CaptureProblem(410, 'capture_revoked', 'This capture link has been withdrawn.');
  if (status === 'locked') throw new CaptureProblem(423, 'capture_locked', 'This capture link is locked.');
  return row;
}

async function publicHandler(
  _req: HttpRequest,
  ctx: InvocationContext,
  handler: () => Promise<HttpResponseInit>,
): Promise<HttpResponseInit> {
  const off = publicCaptureFeature();
  if (off) return off;
  try {
    return noStore(await handler());
  } catch (error) {
    if (error instanceof CaptureProblem) return problem(error.status, error.code, error.message);
    ctx.error(error);
    return problem(500, 'capture_unknown', 'Capture could not be completed.');
  }
}

app.http('createCaptureSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/capture-sessions',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const off = staffCaptureFeature();
    if (off) return off;
    const caseId = req.params.id ?? '';
    const body = (await req.json().catch(() => ({}))) as { shotPlanId?: unknown; expiresInHours?: unknown };
    const plan = captureShotPlan(body.shotPlanId);
    const expiryHours = captureExpiryHours(body.expiresInHours);
    const guidanceMode = configuredCaptureGuidanceMode();
    if (!plan) return problem(400, 'capture_unsupported', 'Choose a supported photo plan.');
    if (!expiryHours) return problem(400, 'capture_validation', 'Choose a 24, 72 or 168 hour expiry.');
    if (!guidanceMode) return problem(503, 'capture_retryable', 'Capture guidance is not configured safely.');

    const secret = newBootstrapSecret();
    const bootstrapHash = captureSecretHash(secret);
    const actor = actorFromClaims(claims) ?? 'staff';
    try {
      const url = captureUrl(secret);
      const sessionId = await tx(async (q) => {
        const locked = await lockCaseForMutation(q, caseId);
        if (locked.kind === 'missing') throw new CaptureProblem(404, 'capture_missing', 'This case is not available.');
        if (locked.kind === 'retired') throw new CaptureProblem(409, 'capture_conflict', 'Open the current case and try again.');
        const cases = await q<{ status_code: number }>('SELECT status_code FROM case_ WHERE id = $1', [locked.caseId]);
        if (!cases[0] || TERMINAL_STATUS_CODES.includes(Number(cases[0].status_code))) {
          throw new CaptureProblem(409, 'capture_conflict', 'This case is no longer open for photos.');
        }
        const rows = await q<{ id: string }>(
          `INSERT INTO capture_session
             (case_id, shot_plan_id, shot_plan_label, guidance_mode, rules_version,
              model_version, bootstrap_token_hash, expires_at, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,now() + ($8::text || ' hours')::interval,$9)
           RETURNING id`,
          [locked.caseId, plan.id, plan.label, guidanceMode, plan.rulesVersion,
            plan.modelVersion ?? null, bootstrapHash, expiryHours, actor],
        );
        const id = rows[0]?.id;
        if (!id) throw new Error('capture session insert did not return an id');
        for (const shot of plan.shots) {
          await q(
            `INSERT INTO capture_session_shot
               (session_id, shot_id, role, evidence_role, label, prompt, required,
                sequence, guidance_profile)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
            [id, shot.id, shot.role, shot.evidenceRole, shot.label, shot.prompt,
              shot.required, shot.sequence, JSON.stringify(shot.guidanceProfile)],
          );
        }
        await writeAuditStrict({
          action: AUDIT_ACTION.capture_session_created,
          caseId: locked.caseId,
          actor,
          summary: 'Guided capture session created',
          after: { sessionId: id, shotPlanId: plan.id, expiresInHours: expiryHours },
        }, q);
        return id;
      });
      const row = await summaryById(sessionId);
      if (!row) throw new Error('capture session disappeared');
      return noStore({ status: 201, jsonBody: { session: summary(row), captureUrl: url } });
    } catch (error) {
      if (error instanceof CaptureProblem) return problem(error.status, error.code, error.message);
      throw error;
    }
  }),
});

app.http('listCaptureSessions', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cases/{id}/capture-sessions',
  handler: withRole('CollisionSpike.User', async (req) => {
    const off = staffCaptureFeature();
    if (off) return off;
    const rows = await query<SummaryRow>(
      `${SUMMARY_SELECT} WHERE s.case_id = $1 GROUP BY s.id ORDER BY s.created_at DESC`,
      [req.params.id ?? ''],
    );
    return noStore({ status: 200, jsonBody: { sessions: rows.map(summary) } });
  }),
});

app.http('rotateCaptureSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'capture-sessions/{id}/rotate',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const off = staffCaptureFeature();
    if (off) return off;
    const sessionId = req.params.id ?? '';
    const secret = newBootstrapSecret();
    const actor = actorFromClaims(claims) ?? 'staff';
    try {
      const url = captureUrl(secret);
      const owner = await staffSessionOwner(sessionId);
      if (!owner) return problem(404, 'capture_missing', 'Capture session not found.');
      await tx(async (q) => {
        const locked = await lockCaseForMutation(q, owner.caseId);
        if (locked.kind !== 'active') throw new CaptureProblem(409, 'capture_conflict', 'This case is no longer available.');
        const rows = await q<{ id: string }>(
          `UPDATE capture_session
              SET bootstrap_token_hash = $2, token_generation = token_generation + 1,
                  updated_at = now()
            WHERE id = $1 AND case_id = $3 AND status = 'open' AND expires_at > now()
            RETURNING id`,
          [sessionId, captureSecretHash(secret), locked.caseId],
        );
        if (!rows[0]) throw new CaptureProblem(409, 'capture_conflict', 'This capture session is no longer open.');
        await q('DELETE FROM capture_session_resume_token WHERE session_id = $1', [sessionId]);
        await writeAuditStrict({
          action: AUDIT_ACTION.capture_session_rotated,
          caseId: locked.caseId,
          actor,
          summary: 'Guided capture link rotated',
          after: { sessionId },
        }, q);
      });
      const row = await summaryById(sessionId);
      if (!row) throw new Error('capture session disappeared');
      return noStore({ status: 200, jsonBody: { session: summary(row), captureUrl: url } });
    } catch (error) {
      if (error instanceof CaptureProblem) return problem(error.status, error.code, error.message);
      throw error;
    }
  }),
});

app.http('revokeCaptureSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'capture-sessions/{id}/revoke',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const off = staffCaptureFeature();
    if (off) return off;
    const sessionId = req.params.id ?? '';
    const owner = await staffSessionOwner(sessionId);
    if (!owner) return problem(404, 'capture_missing', 'Capture session not found.');
    const actor = actorFromClaims(claims) ?? 'staff';
    try {
      await tx(async (q) => {
        const locked = await lockCaseForMutation(q, owner.caseId);
        if (locked.kind !== 'active') throw new CaptureProblem(409, 'capture_conflict', 'This case is no longer available.');
        const rows = await q<{ id: string }>(
          `UPDATE capture_session
              SET status = 'revoked', revoked_at = COALESCE(revoked_at, now()),
                  token_generation = token_generation + CASE WHEN status = 'open' THEN 1 ELSE 0 END,
                  updated_at = now()
            WHERE id = $1 AND case_id = $2 AND status IN ('open','revoked')
            RETURNING id`,
          [sessionId, locked.caseId],
        );
        if (!rows[0]) throw new CaptureProblem(409, 'capture_conflict', 'This capture session cannot be withdrawn.');
        await q('DELETE FROM capture_session_resume_token WHERE session_id = $1', [sessionId]);
        await writeAuditStrict({
          action: AUDIT_ACTION.capture_session_revoked,
          caseId: locked.caseId,
          actor,
          summary: 'Guided capture session revoked',
          after: { sessionId },
        }, q);
      });
      const row = await summaryById(sessionId);
      if (!row) throw new Error('capture session disappeared');
      return noStore({ status: 200, jsonBody: summary(row) });
    } catch (error) {
      if (error instanceof CaptureProblem) return problem(error.status, error.code, error.message);
      throw error;
    }
  }),
});

app.http('exchangeCaptureSecret', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'public/capture/exchange',
  handler: async (req, ctx) => publicHandler(req, ctx, async () => {
    const limited = await callerRateLimitResponse(req, 'exchange');
    if (limited) return limited;
    const body = (await req.json().catch(() => ({}))) as { bootstrapSecret?: unknown };
    if (typeof body.bootstrapSecret !== 'string' || !BOOTSTRAP_SECRET_RE.test(body.bootstrapSecret)) {
      throw new CaptureProblem(401, 'capture_unauthorized', 'This capture link is not authorized.');
    }
    const bootstrapSecret = body.bootstrapSecret;
    const issued = await tx(async (q) => {
      const rows = await q<SessionRow>(
        `SELECT id, case_id, status, shot_plan_id, shot_plan_label, guidance_mode,
                rules_version, model_version, token_generation, expires_at, created_at,
                submitted_at, submit_idempotency_key, revoked_at
           FROM capture_session
          WHERE bootstrap_token_hash = $1
          FOR UPDATE`,
        [captureSecretHash(bootstrapSecret)],
      );
      const row = rows[0];
      if (!row) throw new CaptureProblem(401, 'capture_unauthorized', 'This capture link is not authorized.');
      const status = publicStatus(row);
      if (status === 'expired') throw new CaptureProblem(410, 'capture_expired', 'This capture link has expired.');
      if (status === 'revoked') throw new CaptureProblem(410, 'capture_revoked', 'This capture link has been withdrawn.');
      if (status === 'locked') throw new CaptureProblem(423, 'capture_locked', 'This capture link is locked.');
      if (status === 'complete') throw new CaptureProblem(409, 'capture_conflict', 'These photos have already been submitted.');
      const resumeSecret = await storeCaptureResumeToken(
        q,
        row.id,
        Number(row.token_generation),
        row.expires_at,
      );
      await q('UPDATE capture_session SET last_exchanged_at = now() WHERE id = $1', [row.id]);
      return { row, resumeSecret };
    });
    const access = await mintCaptureAccessToken(
      issued.row.id,
      Number(issued.row.token_generation),
    );
    return {
      status: 200,
      headers: {
        'Set-Cookie': captureResumeCookie(issued.resumeSecret, issued.row.expires_at),
      },
      jsonBody: {
        sessionId: issued.row.id,
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt,
      },
    };
  }),
});

app.http('renewCaptureAccess', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'public/capture/renew',
  handler: async (req, ctx) => publicHandler(req, ctx, async () => {
    const limited = await callerRateLimitResponse(req, 'renew');
    if (limited) return limited;
    const resumeSecret = captureResumeSecretFromRequest(req);
    if (!resumeSecret) {
      throw new CaptureProblem(401, 'capture_unauthorized', 'This capture session cannot be resumed.');
    }
    const tokenHash = captureSecretHash(resumeSecret);
    const renewed = await tx(async (q) => {
      const owners = await q<{ session_id: string }>(
        'SELECT session_id FROM capture_session_resume_token WHERE token_hash = $1',
        [tokenHash],
      );
      const owner = owners[0];
      if (!owner) {
        throw new CaptureProblem(401, 'capture_unauthorized', 'This capture session cannot be resumed.');
      }
      const sessions = await q<Pick<SessionRow, 'id' | 'status' | 'expires_at' | 'token_generation'>>(
        `SELECT id, status, expires_at, token_generation
           FROM capture_session
          WHERE id = $1
          FOR UPDATE`,
        [owner.session_id],
      );
      const session = sessions[0];
      if (!session) {
        throw new CaptureProblem(401, 'capture_unauthorized', 'This capture session cannot be resumed.');
      }
      const tokens = await q<{ token_generation: number; expires_at: Date | string }>(
        `SELECT token_generation, expires_at
           FROM capture_session_resume_token
          WHERE token_hash = $1 AND session_id = $2
          FOR UPDATE`,
        [tokenHash, session.id],
      );
      const token = tokens[0];
      if (!token) {
        throw new CaptureProblem(401, 'capture_unauthorized', 'This capture session cannot be resumed.');
      }
      const status = publicStatus(session);
      if (status === 'expired') throw new CaptureProblem(410, 'capture_expired', 'This capture link has expired.');
      if (status === 'revoked') throw new CaptureProblem(410, 'capture_revoked', 'This capture link has been withdrawn.');
      if (status === 'locked') throw new CaptureProblem(423, 'capture_locked', 'This capture link is locked.');
      if (status === 'complete') throw new CaptureProblem(409, 'capture_conflict', 'These photos have already been submitted.');
      if (Number(token.token_generation) !== Number(session.token_generation)) {
        throw new CaptureProblem(401, 'capture_unauthorized', 'This capture session cannot be resumed.');
      }
      if (new Date(token.expires_at).getTime() <= Date.now()) {
        throw new CaptureProblem(410, 'capture_expired', 'This capture link has expired.');
      }
      await q(
        'UPDATE capture_session_resume_token SET last_used_at = now() WHERE token_hash = $1',
        [tokenHash],
      );
      await q('UPDATE capture_session SET last_exchanged_at = now() WHERE id = $1', [session.id]);
      return session;
    });
    const access = await mintCaptureAccessToken(
      renewed.id,
      Number(renewed.token_generation),
    );
    return {
      status: 200,
      jsonBody: {
        sessionId: renewed.id,
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt,
      },
    };
  }),
});

app.http('captureManifest', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'public/capture/sessions/{id}',
  handler: async (req, ctx) => publicHandler(req, ctx, async () => {
    const sessionId = req.params.id ?? '';
    const limited = await callerRateLimitResponse(req);
    if (limited) return limited;
    const session = await activePublicSession(req, sessionId);
    const sessionLimited = await sessionRateLimitResponse('manifest', session.id);
    if (sessionLimited) return sessionLimited;
    const cases = await query<{ case_ref: string | null; case_po: string | null; vrm: string | null; eva_vehicle_model: string | null }>(
      'SELECT case_ref, case_po, vrm, eva_vehicle_model FROM case_ WHERE id = $1',
      [session.case_id],
    );
    if (!cases[0]) throw new CaptureProblem(410, 'capture_missing', 'This capture session is no longer available.');
    const shots = await query<{
      shot_id: string; role: string; evidence_role: string; label: string; prompt: string;
      required: boolean; sequence: number; guidance_profile: unknown;
    }>(
      `SELECT shot_id, role, evidence_role, label, prompt, required, sequence, guidance_profile
         FROM capture_session_shot WHERE session_id = $1 ORDER BY sequence`,
      [sessionId],
    );
    const assets = await query<{ shot_id: string; id: string; state: string }>(
      `SELECT DISTINCT ON (shot_id) shot_id, id, state
         FROM capture_asset
        WHERE session_id = $1
        ORDER BY shot_id, selected DESC, created_at DESC, id DESC`,
      [sessionId],
    );
    const byShot = new Map(assets.map((asset) => [asset.shot_id, asset]));
    const progress = shots.map((shot) => {
      const asset = byShot.get(shot.shot_id);
      let status = 'retryable';
      if (asset?.state === 'accepted') status = 'accepted';
      if (asset?.state === 'pending_review' || asset?.state === 'materialised') status = 'pending_review';
      if (asset?.state === 'rejected') status = 'rejected';
      if (asset?.state === 'validating') status = 'validating';
      return asset
        ? {
          shotId: shot.shot_id,
          status,
          assetId: asset.id,
          ...(status === 'rejected'
            ? { rejectionReason: 'This photo was not accepted. Take it again.' }
            : {}),
        }
        : { shotId: shot.shot_id, status: 'empty' };
    });
    return {
      status: 200,
      jsonBody: {
        contractVersion: '1',
        sessionId,
        status: publicStatus(session),
        caseReference: cases[0].case_po ?? cases[0].case_ref ?? undefined,
        registration: cases[0].vrm ?? undefined,
        vehicleLabel: cases[0].eva_vehicle_model ?? undefined,
        expiresAt: iso(session.expires_at),
        maxFileBytes: MAX_UPLOAD_BYTES,
        acceptedMimeTypes: PUBLIC_MIME_TYPES,
        guidanceMode: session.guidance_mode,
        rulesVersion: session.rules_version,
        ...(session.model_version ? { modelVersion: session.model_version } : {}),
        shots: shots.map((shot) => ({
          id: shot.shot_id,
          role: shot.role,
          evidenceRole: shot.evidence_role,
          label: shot.label,
          prompt: shot.prompt,
          required: shot.required,
          sequence: shot.sequence,
          ...clientGuidanceProfile(shot.guidance_profile),
        })),
        progress,
      },
    };
  }),
});

app.http('createCaptureUpload', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'public/capture/sessions/{id}/uploads',
  handler: async (req, ctx) => publicHandler(req, ctx, async () => {
    const sessionId = req.params.id ?? '';
    const limited = await callerRateLimitResponse(req);
    if (limited) return limited;
    const session = await activePublicSession(req, sessionId);
    const sessionLimited = await sessionRateLimitResponse('uploads', session.id);
    if (sessionLimited) return sessionLimited;
    if (session.status !== 'open') throw new CaptureProblem(409, 'capture_conflict', 'This capture is already complete.');
    const idempotencyKey = (req.headers.get('idempotency-key') ?? '').trim();
    if (!IDEMPOTENCY_RE.test(idempotencyKey)) {
      throw new CaptureProblem(400, 'capture_validation', 'This upload cannot be safely retried.');
    }
    const body = (await req.json().catch(() => ({}))) as {
      shotId?: unknown; fileName?: unknown; contentType?: unknown; sizeBytes?: unknown; sha256?: unknown;
      clientObservation?: unknown;
    };
    if (
      typeof body.shotId !== 'string' || body.shotId.length < 1 || body.shotId.length > 80
      || typeof body.fileName !== 'string' || body.fileName.length < 1 || body.fileName.length > 255
      || typeof body.contentType !== 'string' || typeof body.sizeBytes !== 'number'
      || !Number.isInteger(body.sizeBytes) || body.sizeBytes < 1
      || typeof body.sha256 !== 'string' || !SHA256_RE.test(body.sha256)
    ) throw new CaptureProblem(400, 'capture_validation', 'Check the selected photo and try again.');
    if (body.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new CaptureProblem(413, 'capture_validation', 'This photo is too large. Choose a smaller photo.');
    }
    const clientObservation = normalizedClientCaptureObservation(
      body.clientObservation,
      session.rules_version,
    );
    const clientObservationJson = JSON.stringify(clientObservation);
    const check = classifyUpload(body.contentType, body.sizeBytes, body.fileName);
    if (!check.ok || check.kind !== 'image' || !PUBLIC_MIME_TYPES.includes(check.contentType)) {
      throw new CaptureProblem(415, 'capture_unsupported', 'Use a JPG, PNG or WebP photo.');
    }
    if (!gates.captureDirectUpload()) {
      throw new CaptureProblem(503, 'capture_retryable', 'Photo uploads are not available yet.');
    }

    const candidateId = randomUUID();
    const blobPath = captureStagingBlobPath(sessionId, candidateId);
    const reservation = await tx(async (q) => {
      const sessions = await q<{
        case_id: string;
        status: string;
        token_generation: number;
        expires_at: Date | string;
        rules_version: string;
        guidance_mode: string;
      }>(
        `SELECT case_id, status, token_generation, expires_at, rules_version, guidance_mode
           FROM capture_session WHERE id = $1 FOR UPDATE`,
        [sessionId],
      );
      if (
        sessions[0]?.status !== 'open'
        || new Date(sessions[0].expires_at).getTime() <= Date.now()
        || Number(sessions[0].token_generation) !== Number(session.token_generation)
        || sessions[0].rules_version !== clientObservation.rulesVersion
        || sessions[0].guidance_mode !== session.guidance_mode
      ) throw new CaptureProblem(409, 'capture_conflict', 'This capture session is no longer open.');
      const shots = await q<{ shot_id: string }>(
        'SELECT shot_id FROM capture_session_shot WHERE session_id = $1 AND shot_id = $2',
        [sessionId, body.shotId],
      );
      if (!shots[0]) throw new CaptureProblem(400, 'capture_unsupported', 'That requested photo is not in this session.');

      // Replays are resolved before the attempt counters. A browser can therefore
      // resume an interrupted upload with its original key even when the session has
      // reached the reservation ceiling, without minting another capture_asset row.
      const existingRows = await q<CaptureAssetReservationRow>(
        `SELECT id, shot_id, state, file_name, declared_content_type, declared_size_bytes,
                declared_sha256, blob_path, client_quality
           FROM capture_asset WHERE session_id = $1 AND idempotency_key = $2 FOR UPDATE`,
        [sessionId, idempotencyKey],
      );
      const existing = existingRows[0];
      if (existing) {
        if (
          existing.shot_id !== body.shotId || existing.file_name !== body.fileName
          || existing.declared_content_type !== check.contentType
          || Number(existing.declared_size_bytes) !== body.sizeBytes
          || existing.declared_sha256 !== body.sha256
          || storedClientObservationFingerprint(existing.client_quality, session.rules_version) !== clientObservationJson
        ) throw new CaptureProblem(409, 'capture_conflict', 'This retry does not match the original photo.');
        if (existing.state !== 'upload_pending') {
          throw new CaptureProblem(409, 'capture_conflict', 'This upload has already been completed.');
        }
        return { kind: 'reserved' as const, asset: existing };
      }

      // The session row lock serialises every fresh reservation for this session.
      // The count and insert therefore form one race-safe admission decision even
      // when concurrent callers deliberately choose different idempotency keys.
      const counts = await q<{ shot_attempts: string | number; session_attempts: string | number }>(
        `SELECT COUNT(*) FILTER (WHERE shot_id = $2)::int AS shot_attempts,
                COUNT(*)::int AS session_attempts
           FROM capture_asset
          WHERE session_id = $1`,
        [sessionId, body.shotId],
      );
      const shotAttempts = Number(counts[0]?.shot_attempts);
      const sessionAttempts = Number(counts[0]?.session_attempts);
      if (
        !Number.isSafeInteger(shotAttempts) || shotAttempts < 0
        || !Number.isSafeInteger(sessionAttempts) || sessionAttempts < 0
      ) throw new Error('capture asset reservation count is invalid');

      if (
        shotAttempts >= MAX_UPLOAD_RESERVATIONS_PER_SHOT
        || sessionAttempts >= MAX_UPLOAD_RESERVATIONS_PER_SESSION
      ) {
        const scope = shotAttempts >= MAX_UPLOAD_RESERVATIONS_PER_SHOT ? 'shot' : 'session';
        const locked = await q<{ case_id: string }>(
          `UPDATE capture_session
              SET status = 'locked', locked_at = COALESCE(locked_at, now()),
                  token_generation = token_generation + 1, updated_at = now()
            WHERE id = $1 AND status = 'open'
            RETURNING case_id`,
          [sessionId],
        );
        if (!locked[0]) {
          throw new CaptureProblem(409, 'capture_conflict', 'This capture session is no longer open.');
        }
        await q('DELETE FROM capture_session_resume_token WHERE session_id = $1', [sessionId]);
        await writeAuditStrict({
          action: AUDIT_ACTION.capture_session_locked,
          caseId: locked[0].case_id,
          actor: 'System',
          summary: 'Guided capture session locked after too many photo attempts',
          after: {
            sessionId,
            reason: 'upload_reservation_limit',
            scope,
            shotAttempts,
            sessionAttempts,
            perShotLimit: MAX_UPLOAD_RESERVATIONS_PER_SHOT,
            sessionLimit: MAX_UPLOAD_RESERVATIONS_PER_SESSION,
          },
        }, q);
        return { kind: 'locked' as const };
      }

      const inserted = await q<CaptureAssetReservationRow>(
        `INSERT INTO capture_asset
           (id, session_id, shot_id, idempotency_key, file_name, declared_content_type,
             declared_size_bytes, declared_sha256, blob_path, upload_expires_at, client_quality)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now() + interval '5 minutes',$10::jsonb)
         RETURNING id, shot_id, state, file_name, declared_content_type, declared_size_bytes,
                   declared_sha256, blob_path, client_quality`,
        [candidateId, sessionId, body.shotId, idempotencyKey, body.fileName, check.contentType,
          body.sizeBytes, body.sha256, blobPath, clientObservationJson],
      );
      const asset = inserted[0];
      if (!asset) throw new Error('capture asset reservation was not created');
      return { kind: 'reserved' as const, asset };
    });

    if (reservation.kind === 'locked') {
      throw new CaptureProblem(
        423,
        'capture_locked',
        'This photo request has reached its attempt limit. Contact Collision Engineers.',
      );
    }
    const asset = reservation.asset;

    let sas;
    try {
      sas = await createCaptureUploadSas(asset.blob_path, asset.declared_content_type);
    } catch (error) {
      logStorageFailure(ctx, '[capture-upload-intent] sas_unavailable', error);
      throw new CaptureProblem(503, 'capture_retryable', 'Photo uploads are temporarily unavailable.');
    }
    await tx(async (q) => {
      const confirmed = await q<{
        session_status: StoredStatus;
        token_generation: number;
        expires_at: Date | string;
        asset_state: string;
      }>(
        `SELECT s.status AS session_status, s.token_generation, s.expires_at,
                a.state AS asset_state
           FROM capture_session s
           JOIN capture_asset a ON a.session_id = s.id
          WHERE s.id = $1 AND a.id = $2
          FOR UPDATE OF s, a`,
        [sessionId, asset.id],
      );
      if (
        confirmed[0]?.session_status !== 'open'
        || new Date(confirmed[0].expires_at).getTime() <= Date.now()
        || Number(confirmed[0].token_generation) !== Number(session.token_generation)
        || confirmed[0].asset_state !== 'upload_pending'
      ) {
        throw new CaptureProblem(409, 'capture_conflict', 'This capture session is no longer open.');
      }
      const stamped = await q<{ id: string }>(
        `UPDATE capture_asset
            SET upload_expires_at = $2, updated_at = now()
          WHERE id = $1 AND state = 'upload_pending'
          RETURNING id`,
        [asset.id, sas.expiresAt],
      );
      if (!stamped[0]) {
        throw new CaptureProblem(409, 'capture_conflict', 'This upload is no longer available.');
      }
    });
    return {
      status: 201,
      jsonBody: {
        uploadId: asset.id,
        assetId: asset.id,
        method: 'direct',
        uploadUrl: sas.uploadUrl,
        headers: sas.headers,
        expiresAt: sas.expiresAt,
      },
    };
  }),
});

app.http('completeCaptureUpload', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'public/capture/sessions/{id}/uploads/{assetId}/complete',
  handler: async (req, ctx) => publicHandler(req, ctx, async () => {
    const sessionId = req.params.id ?? '';
    const assetId = req.params.assetId ?? '';
    const limited = await callerRateLimitResponse(req);
    if (limited) return limited;
    const session = await activePublicSession(req, sessionId);
    const sessionLimited = await sessionRateLimitResponse('complete', session.id);
    if (sessionLimited) return sessionLimited;
    if (session.status !== 'open') throw new CaptureProblem(409, 'capture_conflict', 'This capture is already complete.');
    const body = (await req.json().catch(() => ({}))) as { sizeBytes?: unknown; sha256?: unknown };
    if (
      typeof body.sizeBytes !== 'number' || !Number.isInteger(body.sizeBytes)
      || body.sizeBytes < 1 || body.sizeBytes > MAX_UPLOAD_BYTES
      || typeof body.sha256 !== 'string' || !SHA256_RE.test(body.sha256)
    ) {
      throw new CaptureProblem(400, 'capture_validation', 'The uploaded photo details are invalid.');
    }
    const validationAttempt = randomUUID();
    const claimed = await tx(async (q) => {
      const rows = await q<{
        id: string; shot_id: string; state: string; blob_path: string; file_name: string;
        declared_content_type: string; declared_size_bytes: string | number; declared_sha256: string;
        session_status: StoredStatus; session_expires_at: Date | string; session_token_generation: number;
        validation_lease_expires_at: Date | string | null;
      }>(
        `SELECT a.id, a.shot_id, a.state, a.blob_path, a.file_name, a.declared_content_type,
                a.declared_size_bytes, a.declared_sha256, a.validation_lease_expires_at,
                s.status AS session_status,
                s.expires_at AS session_expires_at, s.token_generation AS session_token_generation
           FROM capture_asset a
           JOIN capture_session s ON s.id = a.session_id
          WHERE a.id = $1 AND a.session_id = $2
          FOR UPDATE OF s, a`,
        [assetId, sessionId],
      );
      const row = rows[0];
      if (!row) throw new CaptureProblem(404, 'capture_missing', 'This upload was not found.');
      if (
        row.session_status !== 'open'
        || new Date(row.session_expires_at).getTime() <= Date.now()
        || Number(row.session_token_generation) !== Number(session.token_generation)
      ) throw new CaptureProblem(409, 'capture_conflict', 'This capture session is no longer open.');
      if (Number(row.declared_size_bytes) !== body.sizeBytes || row.declared_sha256 !== body.sha256) {
        throw new CaptureProblem(409, 'capture_conflict', 'The uploaded photo does not match the upload request.');
      }
      if (row.state === 'accepted' || row.state === 'pending_review' || row.state === 'materialised') {
        return { ...row, already: true };
      }
      if (
        row.state === 'validating'
        && row.validation_lease_expires_at
        && new Date(row.validation_lease_expires_at).getTime() > Date.now()
      ) {
        throw new CaptureProblem(409, 'capture_retryable', 'This photo is still being checked.');
      }
      if (row.state !== 'upload_pending' && row.state !== 'validating') {
        throw new CaptureProblem(422, 'capture_validation', 'This photo was not accepted.');
      }
      await q(
        `UPDATE capture_asset
            SET state = 'validating', validation_attempt = $2,
                validation_lease_expires_at = now() + make_interval(secs => $3),
                validation_code = NULL, updated_at = now()
          WHERE id = $1`,
        [assetId, validationAttempt, VALIDATION_LEASE_SECONDS],
      );
      return { ...row, already: false, validationAttempt };
    });
    if (claimed.already) {
      return { status: 200, jsonBody: { assetId, shotId: claimed.shot_id, status: claimed.state === 'materialised' ? 'pending_review' : claimed.state } };
    }

    let properties;
    try {
      properties = await getCaptureBlobProperties(claimed.blob_path);
    } catch (error) {
      await releaseValidationAttempt(assetId, validationAttempt, 'blob_read_retryable');
      logStorageFailure(ctx, '[capture-complete] staging_head_failed', error);
      throw new CaptureProblem(503, 'capture_retryable', 'This photo could not be checked yet. Try again.');
    }
    if (
      !properties
      || properties.contentLength !== Number(claimed.declared_size_bytes)
      || properties.contentLength < 1
      || properties.contentLength > MAX_UPLOAD_BYTES
      || properties.contentType.toLowerCase().split(';')[0].trim() !== claimed.declared_content_type
    ) {
      const serverQuality = serverStructuralObservation({
        result: 'blob_properties_mismatch',
        contentType: properties?.contentType,
        sizeBytes: properties?.contentLength,
        propertiesMatch: false,
      });
      await query(
        `UPDATE capture_asset
            SET state = 'rejected', selected = false, validation_code = 'blob_properties_mismatch',
                server_size_bytes = $2, validation_attempt = NULL,
                validation_lease_expires_at = NULL, server_quality = $4::jsonb, updated_at = now()
          WHERE id = $1 AND state = 'validating' AND validation_attempt = $3`,
        [assetId, properties?.contentLength ?? null, validationAttempt, serverQuality],
      );
      throw new CaptureProblem(422, 'capture_validation', 'This photo does not match the upload request. Take it again.');
    }
    const releaseDecodeSlot = tryAcquireDecodeSlot();
    if (!releaseDecodeSlot) {
      await releaseValidationAttempt(assetId, validationAttempt, 'decode_capacity_retryable');
      throw new CaptureProblem(503, 'capture_retryable', 'This photo could not be checked yet. Try again.');
    }
    let inspected;
    try {
      const bytes = await downloadCaptureBlobBytes(claimed.blob_path, MAX_UPLOAD_BYTES);
      const serverHash = createHash('sha256').update(bytes).digest('hex');
      const expected = classifyUpload(
        claimed.declared_content_type,
        Number(claimed.declared_size_bytes),
        claimed.file_name,
      );
      const content = bytes && expected.ok
        ? await validateUploadContent(expected, bytes)
        : { ok: false as const, reason: 'missing' };
      const dimensions = bytes && content.ok ? await validatedImageDimensions(bytes) : undefined;
      inspected = { bytes, serverHash, content, dimensions };
    } catch (error) {
      await releaseValidationAttempt(assetId, validationAttempt, 'blob_read_retryable');
      logStorageFailure(ctx, '[capture-complete] staging_read_failed', error);
      throw new CaptureProblem(503, 'capture_retryable', 'This photo could not be checked yet. Try again.');
    } finally {
      releaseDecodeSlot();
    }
    const { bytes, serverHash, content, dimensions } = inspected;
    if (
      bytes.length !== Number(claimed.declared_size_bytes)
      || bytes.length > MAX_UPLOAD_BYTES || serverHash !== claimed.declared_sha256
      || !content.ok || content.kind !== 'image' || !dimensions
    ) {
      const serverQuality = serverStructuralObservation({
        result: 'structural_validation_failed',
        contentType: content.ok ? content.contentType : claimed.declared_content_type,
        sizeBytes: bytes.length,
        propertiesMatch: true,
        hashMatches: serverHash === claimed.declared_sha256,
        magicBytesValid: content.ok && content.kind === 'image',
        decodable: dimensions !== undefined,
        ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
      });
      await query(
        `UPDATE capture_asset
            SET state = 'rejected', selected = false, validation_code = 'structural_validation_failed',
                server_size_bytes = $2, server_sha256 = NULLIF($3,''),
                validation_attempt = NULL, validation_lease_expires_at = NULL,
                server_quality = $5::jsonb, updated_at = now()
          WHERE id = $1 AND state = 'validating' AND validation_attempt = $4`,
        [assetId, bytes.length, serverHash, validationAttempt, serverQuality],
      );
      throw new CaptureProblem(422, 'capture_validation', 'This photo could not be read safely. Take it again.');
    }

    const serverQuality = serverStructuralObservation({
      result: 'passed',
      contentType: content.contentType,
      sizeBytes: bytes.length,
      propertiesMatch: true,
      hashMatches: true,
      magicBytesValid: true,
      decodable: true,
      width: dimensions.width,
      height: dimensions.height,
    });

    let validatedBlobPath: string;
    try {
      validatedBlobPath = await promoteCaptureBlob(
        sessionId,
        assetId,
        serverHash,
        bytes,
        content.contentType,
      );
    } catch (error) {
      await releaseValidationAttempt(assetId, validationAttempt, 'promotion_retryable');
      logStorageFailure(ctx, '[capture-complete] promotion_failed', error);
      throw new CaptureProblem(503, 'capture_retryable', 'This photo could not be secured yet. Try again.');
    }

    try {
      const resolution = await withResolvedCaseMutationTarget(session.case_id, async (q, target) => {
        const rows = await q<{
          case_id: string; status: StoredStatus; expires_at: Date | string; token_generation: number;
          asset_state: string; validation_attempt: string | null;
        }>(
          `SELECT s.case_id, s.status, s.expires_at, s.token_generation,
                  a.state AS asset_state, a.validation_attempt
             FROM capture_asset a JOIN capture_session s ON s.id = a.session_id
            WHERE a.id = $1 AND a.session_id = $2 FOR UPDATE OF s, a`,
          [assetId, sessionId],
        );
        if (!rows[0]) throw new CaptureProblem(404, 'capture_missing', 'This upload was not found.');
        const currentCaseId = rows[0].case_id.trim().toLowerCase();
        if (!target.lineage.includes(currentCaseId)) {
          throw new CaptureProblem(409, 'capture_conflict', 'This capture session changed while the photo was checked.');
        }
        if (
          rows[0].asset_state !== 'validating'
          || rows[0].validation_attempt !== validationAttempt
        ) {
          throw new CaptureProblem(409, 'capture_retryable', 'This photo check was safely retried. Try again.');
        }
        if (
          rows[0].status !== 'open'
          || new Date(rows[0].expires_at).getTime() <= Date.now()
          || Number(rows[0].token_generation) !== Number(session.token_generation)
        ) {
          throw new CaptureProblem(409, 'capture_conflict', 'This capture session is no longer open.');
        }
        if (TERMINAL_STATUS_CODES.includes(target.statusCode)) {
          await lockCaptureSessionInTransaction(q, sessionId, currentCaseId, 'terminal_survivor');
          return { kind: 'locked' as const };
        }
        await retargetOpenCaptureSession(
          q,
          sessionId,
          currentCaseId,
          target.caseId,
          target.lineage,
        );
        await q(
          `UPDATE capture_asset
              SET selected = false,
                  state = CASE WHEN state IN ('accepted','pending_review') THEN 'superseded' ELSE state END,
                  updated_at = now()
            WHERE session_id = $1 AND shot_id = $2 AND id <> $3 AND selected = true`,
          [sessionId, claimed.shot_id, assetId],
        );
        const persisted = await q<{ id: string }>(
          `UPDATE capture_asset
            SET state = 'pending_review', selected = true, server_content_type = $2,
                server_size_bytes = $3, server_sha256 = $4, width = $5, height = $6,
                validation_code = NULL, blob_path = $7, validation_attempt = NULL,
                validation_lease_expires_at = NULL, server_quality = $9::jsonb, updated_at = now()
          WHERE id = $1 AND state = 'validating' AND validation_attempt = $8
          RETURNING id`,
        [assetId, content.contentType, bytes.length, serverHash, dimensions.width, dimensions.height,
            validatedBlobPath, validationAttempt, serverQuality],
        );
        if (!persisted[0]) {
          throw new CaptureProblem(409, 'capture_retryable', 'This photo check was safely retried. Try again.');
        }
        await writeAuditStrict({
          action: AUDIT_ACTION.capture_asset_validated,
          caseId: target.caseId,
          actor: 'System',
          summary: 'Guided capture photo validated',
          after: { sessionId, assetId, shotId: claimed.shot_id, status: 'pending_review' },
        }, q);
        return { kind: 'accepted' as const };
      });
      if (resolution.kind === 'unresolved') {
        if (resolution.reason === 'changing') {
          throw new CaptureProblem(503, 'capture_retryable', 'This case is changing. Try again.');
        }
        await lockCaptureSessionForStaffResolution(sessionId, resolution.reason);
        throw new CaptureProblem(423, 'capture_locked', 'This capture link is locked for staff review.');
      }
      if (resolution.value.kind === 'locked') {
        throw new CaptureProblem(423, 'capture_locked', 'This capture link is locked for staff review.');
      }
    } catch (error) {
      await releaseValidationAttempt(assetId, validationAttempt, 'persistence_retryable');
      throw error;
    }
    try {
      await deleteCaptureStagingBlob(claimed.blob_path);
      await query(
        `UPDATE capture_asset
            SET staging_deleted_at = COALESCE(staging_deleted_at, now()), updated_at = now()
          WHERE id = $1`,
        [assetId],
      );
    } catch {
      ctx.warn('[capture-complete] staging cleanup deferred');
    }
    return { status: 200, jsonBody: { assetId, shotId: claimed.shot_id, status: 'pending_review' } };
  }),
});

app.http('submitCaptureSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'public/capture/sessions/{id}/submit',
  handler: async (req, ctx) => publicHandler(req, ctx, async () => {
    const sessionId = req.params.id ?? '';
    const limited = await callerRateLimitResponse(req);
    if (limited) return limited;
    const session = await submitPublicSession(req, sessionId);
    const sessionLimited = await sessionRateLimitResponse('submit', session.id);
    if (sessionLimited) return sessionLimited;
    const idempotencyKey = (req.headers.get('idempotency-key') ?? '').trim();
    if (!IDEMPOTENCY_RE.test(idempotencyKey)) {
      throw new CaptureProblem(400, 'capture_validation', 'This submission cannot be safely retried.');
    }
    if (session.status === 'complete') {
      if (session.submit_idempotency_key !== idempotencyKey) {
        throw new CaptureProblem(409, 'capture_conflict', 'This capture was already submitted by another request.');
      }
      if (!session.submitted_at) throw new Error('complete capture session has no submitted_at');
      return {
        status: 200,
        headers: { 'Set-Cookie': clearCaptureResumeCookie() },
        jsonBody: { status: 'complete', completedAt: iso(session.submitted_at) },
      };
    }

    const resolution = await withResolvedCaseMutationTarget(session.case_id, async (q, target) => {
      const sessions = await q<{
        case_id: string;
        status: StoredStatus;
        submit_idempotency_key: string | null;
        submitted_at: Date | string | null;
        token_generation: number;
        expires_at: Date | string;
      }>(
        `SELECT case_id, status, submit_idempotency_key, submitted_at,
                token_generation, expires_at
           FROM capture_session WHERE id = $1 FOR UPDATE`,
        [sessionId],
      );
      const current = sessions[0];
      if (!current) throw new CaptureProblem(410, 'capture_missing', 'This capture session is no longer available.');
      if (current.status === 'complete') {
        if (current.submit_idempotency_key !== idempotencyKey) {
          throw new CaptureProblem(409, 'capture_conflict', 'This capture was already submitted by another request.');
        }
        if (!current.submitted_at) throw new Error('complete capture session has no submitted_at');
        return { kind: 'complete' as const, completedAt: iso(current.submitted_at) };
      }
      if (current.status !== 'open') throw new CaptureProblem(409, 'capture_conflict', 'This capture session is no longer open.');
      if (Number(current.token_generation) !== Number(session.token_generation)) {
        throw new CaptureProblem(401, 'capture_unauthorized', 'This capture link is not authorized.');
      }
      if (new Date(current.expires_at).getTime() <= Date.now()) {
        throw new CaptureProblem(410, 'capture_expired', 'This capture link has expired.');
      }
      const currentCaseId = current.case_id.trim().toLowerCase();
      if (!target.lineage.includes(currentCaseId)) {
        throw new CaptureProblem(409, 'capture_conflict', 'This capture session changed. Refresh and try again.');
      }
      if (TERMINAL_STATUS_CODES.includes(target.statusCode)) {
        await lockCaptureSessionInTransaction(q, sessionId, currentCaseId, 'terminal_survivor');
        return { kind: 'locked' as const };
      }
      const reparentedFrom = currentCaseId !== target.caseId ? currentCaseId : undefined;
      await retargetOpenCaptureSession(
        q,
        sessionId,
        currentCaseId,
        target.caseId,
        target.lineage,
      );

      const incomplete = await q<{ shot_id: string }>(
        `SELECT sh.shot_id
           FROM capture_session_shot sh
          WHERE sh.session_id = $1 AND sh.required = true
            AND NOT EXISTS (
              SELECT 1 FROM capture_asset a
               WHERE a.session_id = sh.session_id AND a.shot_id = sh.shot_id
                 AND a.selected = true AND a.state IN ('accepted','pending_review','materialised')
            )
          ORDER BY sh.sequence`,
        [sessionId],
      );
      if (incomplete.length) {
        return { kind: 'incomplete' as const };
      }

      const assets = await q<{
        id: string;
        shot_id: string;
        evidence_role: 'overview' | 'damage_closeup' | 'additional' | 'unknown';
        sequence: number;
        file_name: string;
        server_content_type: string | null;
        server_size_bytes: string | number | null;
        server_sha256: string | null;
        blob_path: string;
        evidence_id: string | null;
      }>(
        `SELECT a.id, a.shot_id, sh.evidence_role, sh.sequence, a.file_name,
                a.server_content_type, a.server_size_bytes, a.server_sha256,
                a.blob_path, a.evidence_id
           FROM capture_asset a
           JOIN capture_session_shot sh
             ON sh.session_id = a.session_id AND sh.shot_id = a.shot_id
          WHERE a.session_id = $1 AND a.selected = true
            AND a.state IN ('accepted','pending_review','materialised')
          ORDER BY sh.sequence, a.created_at, a.id
          FOR UPDATE OF a`,
        [sessionId],
      );
      const imageKind = evidenceKindCodec.toInt('image') ?? 100000000;
      for (const asset of assets) {
        if (asset.evidence_id) continue;
        const twins = asset.server_sha256
          ? await q<{ id: string }>(
              `SELECT id FROM evidence
                WHERE case_id = $1 AND sha256 = $2
                ORDER BY created_at, id
                LIMIT 1
                FOR UPDATE`,
              [target.caseId, asset.server_sha256],
            )
          : [];
        if (twins[0]) {
          await q(
            `UPDATE capture_asset
                SET evidence_id = $2, materialised_at = now(), state = 'materialised', updated_at = now()
              WHERE id = $1`,
            [asset.id, twins[0].id],
          );
          continue;
        }
        const imageRole = imageRoleCodec.toInt(asset.evidence_role) ?? 100000003;
        const inserted = await q<ArchiveMirrorCandidate>(
          `INSERT INTO evidence
             (file_name, case_id, kind_code, image_role_code, image_role_source,
              accepted_for_eva, accepted_for_eva_source, excluded, exclusion_reason,
              exclusion_decision_source, sequence_index, sha256, content_type, size_bytes,
              storage_path, source_message_id, source_label)
           VALUES ($1,$2,$3,$4,'capture',false,'capture',true,
                   'Guided capture review pending','capture',$5,$6,$7,$8,$9,$10,
                   'public_guided_capture')
           RETURNING id, case_id, excluded, storage_path, box_file_id`,
          [
            asset.file_name,
            target.caseId,
            imageKind,
            imageRole,
            asset.sequence,
            asset.server_sha256,
            asset.server_content_type,
            asset.server_size_bytes,
            asset.blob_path,
            `public-capture:${asset.id}`,
          ],
        );
        const evidence = inserted[0];
        if (!evidence) throw new Error('capture evidence insert did not return a row');
        await requestArchiveMirror(q, evidence);
        await q(
          `UPDATE capture_asset
              SET evidence_id = $2, materialised_at = now(), state = 'materialised', updated_at = now()
            WHERE id = $1`,
          [asset.id, evidence.id],
        );
      }
      await requestStatusRecompute(q, target.caseId);
      const completed = await q<{ submitted_at: Date | string }>(
        `UPDATE capture_session
            SET status = 'complete', submitted_at = now(), submit_idempotency_key = $2,
                token_generation = token_generation + 1, updated_at = now()
          WHERE id = $1 AND status = 'open'
          RETURNING submitted_at`,
        [sessionId, idempotencyKey],
      );
      if (!completed[0]) throw new CaptureProblem(409, 'capture_conflict', 'This capture session is no longer open.');
      await q('DELETE FROM capture_session_resume_token WHERE session_id = $1', [sessionId]);
      await writeAuditStrict({
        action: AUDIT_ACTION.capture_session_completed,
        caseId: target.caseId,
        actor: 'System',
        summary: 'Guided capture photos submitted',
        after: {
          sessionId,
          assetCount: assets.length,
          ...(reparentedFrom ? { reparentedFrom, lineage: target.lineage } : {}),
        },
      }, q);
      return { kind: 'complete' as const, completedAt: iso(completed[0].submitted_at) };
    });
    if (resolution.kind === 'unresolved') {
      if (resolution.reason === 'changing') {
        throw new CaptureProblem(503, 'capture_retryable', 'This case is changing. Try again.');
      }
      await lockCaptureSessionForStaffResolution(sessionId, resolution.reason);
      throw new CaptureProblem(423, 'capture_locked', 'This capture link is locked for staff review.');
    }
    if (resolution.value.kind === 'locked') {
      throw new CaptureProblem(423, 'capture_locked', 'This capture link is locked for staff review.');
    }
    if (resolution.value.kind === 'incomplete') {
      throw new CaptureProblem(409, 'capture_conflict', 'Take every required photo before submitting.');
    }
    return {
      status: 200,
      headers: { 'Set-Cookie': clearCaptureResumeCookie() },
      jsonBody: { status: 'complete', completedAt: resolution.value.completedAt },
    };
  }),
});

/**
 * capture-access.ts — the anonymous public capture access + manifest handlers.
 *
 * Exchange (bootstrap secret -> short-lived access token + hashed resume cookie), renew
 * (resume cookie -> fresh access token), and the read-only session manifest. Each handler is
 * the body wrapped by publicHandler in the registrar; caller/session rate limits are consumed
 * here in the documented order (caller budget before work, session budget after bearer proof).
 */

import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { query, tx } from '../../platform/db/client.js';
import {
  captureResumeCookie,
  captureResumeSecretFromRequest,
  captureSecretHash,
  mintCaptureAccessToken,
} from './capture-auth.js';
import { callerRateLimitResponse, sessionRateLimitResponse } from './capture-rate-limit.js';
import { clientGuidanceProfile } from './capture-observations.js';
import { MAX_UPLOAD_BYTES } from '../evidence/upload-validate.js';
import {
  CaptureProblem,
  iso,
  publicHandler,
  publicStatus,
  PUBLIC_MIME_TYPES,
} from './capture-http.js';
import {
  activePublicSession,
  storeCaptureResumeToken,
  type SessionRow,
} from './capture-session-store.js';

const BOOTSTRAP_SECRET_RE = /^[A-Za-z0-9_-]{43}$/;

export const exchangeCaptureSecretHandler = async (
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> => publicHandler(req, ctx, async () => {
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
});

export const renewCaptureAccessHandler = async (
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> => publicHandler(req, ctx, async () => {
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
});

export const captureManifestHandler = async (
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> => publicHandler(req, ctx, async () => {
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
});

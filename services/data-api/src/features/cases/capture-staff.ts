/**
 * capture-staff.ts — the authenticated staff capture-session handlers.
 *
 * Create / list / rotate / revoke of guided-capture sessions. Each handler is the inner
 * body wrapped by withRole('CollisionSpike.User', ...) in the capture registrar, so the
 * app-role gate stays declared at the registration site while the business logic lives here.
 */

import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { JWTPayload } from 'jose';
import { actorFromClaims, AUDIT_ACTION, writeAuditStrict } from '../../shared/audit.js';
import { query, tx } from '../../platform/db/client.js';
import { lockCaseForMutation } from './mutation-locks.js';
import { captureSecretHash, newBootstrapSecret } from './capture-auth.js';
import {
  captureExpiryHours,
  captureShotPlan,
  configuredCaptureGuidanceMode,
} from './capture-plans.js';
import {
  CaptureProblem,
  noStore,
  problem,
  staffCaptureFeature,
  TERMINAL_STATUS_CODES,
} from './capture-http.js';
import {
  captureUrl,
  staffSessionOwner,
  summary,
  summaryById,
  SUMMARY_SELECT,
  type SummaryRow,
} from './capture-session-store.js';

export const createCaptureSessionHandler = async (
  req: HttpRequest,
  _ctx: InvocationContext,
  claims: JWTPayload,
): Promise<HttpResponseInit> => {
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
};

export const listCaptureSessionsHandler = async (req: HttpRequest): Promise<HttpResponseInit> => {
  const off = staffCaptureFeature();
  if (off) return off;
  const rows = await query<SummaryRow>(
    `${SUMMARY_SELECT} WHERE s.case_id = $1 GROUP BY s.id ORDER BY s.created_at DESC`,
    [req.params.id ?? ''],
  );
  return noStore({ status: 200, jsonBody: { sessions: rows.map(summary) } });
};

export const rotateCaptureSessionHandler = async (
  req: HttpRequest,
  _ctx: InvocationContext,
  claims: JWTPayload,
): Promise<HttpResponseInit> => {
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
};

export const revokeCaptureSessionHandler = async (
  req: HttpRequest,
  _ctx: InvocationContext,
  claims: JWTPayload,
): Promise<HttpResponseInit> => {
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
};

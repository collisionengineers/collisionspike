/**
 * capture-session-store.ts — capture_session persistence and lifecycle helpers.
 *
 * Owns the row shapes, the summary projection + SQL, resume-token storage, the validation-lease
 * release, the lock/retarget transitions used when a merge moves a session's case, and the public
 * bearer-authenticated session reads (manifest/upload vs the submit replay exception). Shared by
 * every capture route module so the concurrency and audit semantics live in one place.
 */

import { query, tx, type TxQuery } from '../../platform/db/client.js';
import { AUDIT_ACTION, writeAuditStrict } from '../../shared/audit.js';
import { captureSecretHash, newResumeSecret, verifyCaptureAccessToken } from './capture-auth.js';
import { lockCaseForMutation } from './mutation-locks.js';
import {
  CaptureProblem,
  iso,
  publicStatus,
  type StoredStatus,
} from './capture-http.js';
import type { HttpRequest } from '@azure/functions';

const MAX_RESUME_TOKENS_PER_SESSION = 8;

export interface SessionRow extends Record<string, unknown> {
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

export interface SummaryRow extends SessionRow {
  required_total: string | number;
  required_completed: string | number;
}

export interface CaptureAssetReservationRow extends Record<string, unknown> {
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

export async function storeCaptureResumeToken(
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

export function summary(row: SummaryRow): Record<string, unknown> {
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

export const SUMMARY_SELECT = `
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

export async function summaryById(sessionId: string, q: TxQuery | typeof query = query): Promise<SummaryRow | undefined> {
  const rows = await q<SummaryRow>(
    `${SUMMARY_SELECT} WHERE s.id = $1 GROUP BY s.id`,
    [sessionId],
  );
  return rows[0];
}

export async function releaseValidationAttempt(
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

export async function lockCaptureSessionInTransaction(
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

export async function lockCaptureSessionForStaffResolution(
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

export async function retargetOpenCaptureSession(
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

export function captureUrl(secret: string): string {
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

export async function staffSessionOwner(
  sessionId: string,
): Promise<{ caseId: string; status: StoredStatus } | undefined> {
  const rows = await query<{ case_id: string; status: StoredStatus }>(
    'SELECT case_id, status FROM capture_session WHERE id = $1',
    [sessionId],
  );
  return rows[0] ? { caseId: rows[0].case_id, status: rows[0].status } : undefined;
}

export async function activePublicSession(req: HttpRequest, expectedSessionId: string): Promise<SessionRow> {
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
export async function submitPublicSession(req: HttpRequest, expectedSessionId: string): Promise<SessionRow> {
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

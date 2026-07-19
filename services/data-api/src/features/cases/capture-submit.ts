/**
 * capture-submit.ts — the anonymous public submit handler.
 *
 * Idempotent finalisation of a guided-capture session: replays a prior completion by key,
 * else (under the resolved case-mutation target) verifies every required shot is present,
 * materialises the selected assets into pending-review evidence (deduping by sha256 and
 * enqueuing the archive mirror), requests a status recompute, and completes the session.
 */

import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { evidenceKindCodec, imageRoleCodec } from '@cs/domain/codecs';
import { AUDIT_ACTION, writeAuditStrict } from '../../shared/audit.js';
import { requestArchiveMirror, type ArchiveMirrorCandidate } from '../archive/mirror-outbox.js';
import { requestStatusRecompute } from './status-recompute.js';
import { withResolvedCaseMutationTarget } from './case-mutation-target.js';
import { clearCaptureResumeCookie } from './capture-auth.js';
import { callerRateLimitResponse, sessionRateLimitResponse } from './capture-rate-limit.js';
import {
  CaptureProblem,
  iso,
  publicHandler,
  IDEMPOTENCY_RE,
  TERMINAL_STATUS_CODES,
  type StoredStatus,
} from './capture-http.js';
import {
  lockCaptureSessionForStaffResolution,
  lockCaptureSessionInTransaction,
  retargetOpenCaptureSession,
  submitPublicSession,
} from './capture-session-store.js';

export const submitCaptureSessionHandler = async (
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> => publicHandler(req, ctx, async () => {
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
});

/**
 * capture-upload.ts — the anonymous public upload-intent and completion handlers.
 *
 * createCaptureUpload reserves a capture_asset (idempotent replay + per-shot/per-session
 * reservation ceilings that lock an abusive session) and mints a direct-upload SAS.
 * completeCaptureUpload fences the validation lease, HEAD-checks then structurally validates
 * the staged blob, promotes it, and materialises a pending-review evidence link — all under
 * the resolved case-mutation target so a mid-flight merge retargets safely.
 */

import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { randomUUID } from 'node:crypto';
import { contentSha256 } from '@cs/server-runtime';
import { SHA256_HEX_RE } from '@cs/domain';
import {
  captureStagingBlobPath,
  createCaptureUploadSas,
  deleteCaptureStagingBlob,
  downloadCaptureBlobBytes,
  getCaptureBlobProperties,
  promoteCaptureBlob,
} from '../evidence/blob-store.js';
import {
  classifyUpload,
  MAX_UPLOAD_BYTES,
  validateUploadContent,
  validatedImageDimensions,
} from '../evidence/upload-validate.js';
import { query, tx } from '../../platform/db/client.js';
import { gates } from '../settings/gates.js';
import { AUDIT_ACTION, writeAuditStrict } from '../../shared/audit.js';
import { withResolvedCaseMutationTarget } from './case-mutation-target.js';
import {
  callerRateLimitResponse,
  sessionRateLimitResponse,
  tryAcquireDecodeSlot,
} from './capture-rate-limit.js';
import {
  normalizedClientCaptureObservation,
  serverStructuralObservation,
  storedClientObservationFingerprint,
} from './capture-observations.js';
import {
  CaptureProblem,
  logStorageFailure,
  publicHandler,
  IDEMPOTENCY_RE,
  PUBLIC_MIME_TYPES,
  TERMINAL_STATUS_CODES,
  type StoredStatus,
} from './capture-http.js';
import {
  activePublicSession,
  lockCaptureSessionForStaffResolution,
  lockCaptureSessionInTransaction,
  releaseValidationAttempt,
  retargetOpenCaptureSession,
  type CaptureAssetReservationRow,
} from './capture-session-store.js';

const VALIDATION_LEASE_SECONDS = 5 * 60;
const MAX_UPLOAD_RESERVATIONS_PER_SHOT = 8;
const MAX_UPLOAD_RESERVATIONS_PER_SESSION = 60;

export const createCaptureUploadHandler = async (
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> => publicHandler(req, ctx, async () => {
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
    || typeof body.sha256 !== 'string' || !SHA256_HEX_RE.test(body.sha256)
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
});

export const completeCaptureUploadHandler = async (
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> => publicHandler(req, ctx, async () => {
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
    || typeof body.sha256 !== 'string' || !SHA256_HEX_RE.test(body.sha256)
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
    const serverHash = contentSha256(bytes);
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
});

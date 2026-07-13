import { app, type InvocationContext } from '@azure/functions';
import {
  captureStagingBlobPath,
  captureValidatedBlobPath,
  deleteCaptureManagedBlob,
  isCaptureManagedBlobPath,
} from '../lib/blob.js';
import { query } from '../lib/db.js';

const CLEANUP_BATCH_SIZE = 100;

export interface CaptureCleanupResult {
  enabled: boolean;
  expiredSessions: number;
  resumeTokensDeleted: number;
  candidates: number;
  deleted: number;
  failed: number;
}

function enabled(name: string): boolean {
  return (process.env[name] ?? '').trim().toLowerCase() === 'true';
}

export function configuredCaptureRetentionDays(
  value = process.env.CAPTURE_RETENTION_DAYS,
): number | undefined {
  const days = value == null || value.trim() === '' ? 30 : Number(value);
  return Number.isInteger(days) && days >= 1 && days <= 3650 ? days : undefined;
}

export async function runCaptureCleanup(ctx: InvocationContext): Promise<CaptureCleanupResult> {
  const disabled: CaptureCleanupResult = {
    enabled: false,
    expiredSessions: 0,
    resumeTokensDeleted: 0,
    candidates: 0,
    deleted: 0,
    failed: 0,
  };
  if (!enabled('CAPTURE_CLEANUP_ENABLED')) return disabled;

  const retentionDays = configuredCaptureRetentionDays();
  if (!retentionDays) {
    throw new Error('CAPTURE_RETENTION_DAYS must be an integer between 1 and 3650');
  }

  const expired = await query<{ id: string }>(
    `WITH expired_candidates AS (
       SELECT id
         FROM capture_session
        WHERE status = 'open' AND expires_at <= now()
        ORDER BY id
        FOR UPDATE SKIP LOCKED
        LIMIT $1
     )
     UPDATE capture_session s
        SET status = 'expired', expired_at = COALESCE(s.expired_at, now()),
            token_generation = s.token_generation + 1, updated_at = now()
       FROM expired_candidates candidate
      WHERE s.id = candidate.id
      RETURNING s.id`,
    [CLEANUP_BATCH_SIZE],
  );

  const candidates = await query<{
    id: string;
    session_id: string;
    blob_path: string;
    declared_sha256: string;
    evidence_id: string | null;
    evidence_storage_path: string | null;
    cleanup_attempt_count: number;
  }>(
    `SELECT a.id, a.session_id, a.blob_path, a.declared_sha256, a.evidence_id,
            e.storage_path AS evidence_storage_path, a.cleanup_attempt_count
       FROM capture_asset a
       JOIN capture_session s ON s.id = a.session_id
       LEFT JOIN evidence e ON e.id = a.evidence_id
      WHERE s.status IN ('expired','revoked','complete','locked')
        AND COALESCE(s.expired_at, s.revoked_at, s.submitted_at, s.locked_at, s.expires_at)
              <= now() - make_interval(days => $1)
        AND a.blob_deleted_at IS NULL
        AND (a.cleanup_next_attempt_at IS NULL OR a.cleanup_next_attempt_at <= now())
        AND (a.blob_path LIKE 'capture/%' OR a.blob_path LIKE 'capture-validated/%')
        AND (
          (a.evidence_id IS NULL AND a.materialised_at IS NULL AND a.state <> 'materialised')
          OR (
            a.evidence_id IS NOT NULL
            AND (
              a.staging_deleted_at IS NULL
              OR (e.storage_path IS NOT NULL AND e.storage_path <> a.blob_path)
            )
          )
        )
      ORDER BY a.updated_at, a.id
      LIMIT $2`,
    [retentionDays, CLEANUP_BATCH_SIZE],
  );

  let deleted = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      const derivedValidatedPath = captureValidatedBlobPath(
        candidate.session_id,
        candidate.id,
        candidate.declared_sha256,
      );
      const derivedStagingPath = captureStagingBlobPath(candidate.session_id, candidate.id);
      const possiblePaths = candidate.evidence_id && !candidate.evidence_storage_path
        ? [derivedStagingPath]
        : [derivedStagingPath, candidate.blob_path, derivedValidatedPath];
      const paths = [...new Set(possiblePaths)]
        .filter((path) => isCaptureManagedBlobPath(path))
        .filter((path) => path !== candidate.evidence_storage_path);
      if (paths.length === 0) continue;
      for (const path of paths) await deleteCaptureManagedBlob(path);
      const stamped = await query<{ id: string }>(
        `UPDATE capture_asset a
            SET blob_deleted_at = now(), cleanup_code = 'retention',
                staging_deleted_at = COALESCE(staging_deleted_at, now()),
                cleanup_attempt_count = 0, cleanup_next_attempt_at = NULL,
                cleanup_last_error_category = NULL, updated_at = now()
          WHERE a.id = $1
            AND a.blob_deleted_at IS NULL
            AND (a.blob_path LIKE 'capture/%' OR a.blob_path LIKE 'capture-validated/%')
            AND (
              (a.evidence_id IS NULL AND a.materialised_at IS NULL AND a.state <> 'materialised')
              OR EXISTS (
                SELECT 1 FROM evidence e
                 WHERE e.id = a.evidence_id
                   AND (
                     e.storage_path IS NULL
                     OR e.storage_path <> ALL($3::text[])
                   )
              )
            )
            AND EXISTS (
              SELECT 1 FROM capture_session s
               WHERE s.id = a.session_id
                 AND s.status IN ('expired','revoked','complete','locked')
                 AND COALESCE(s.expired_at, s.revoked_at, s.submitted_at, s.locked_at, s.expires_at)
                       <= now() - make_interval(days => $2)
            )
          RETURNING a.id`,
        [candidate.id, retentionDays, paths],
      );
      if (stamped[0]) deleted++;
    } catch {
      failed++;
      const currentAttempts = Number(candidate.cleanup_attempt_count) || 0;
      const nextAttempts = currentAttempts + 1;
      const backoffSeconds = Math.min(
        86_400,
        60 * (2 ** Math.min(Math.max(currentAttempts, 0), 10)),
      );
      try {
        await query(
          `UPDATE capture_asset
              SET cleanup_attempt_count = $2,
                  cleanup_next_attempt_at = now() + make_interval(secs => $3),
                  cleanup_last_error_category = 'blob_delete_failed',
                  updated_at = now()
            WHERE id = $1 AND blob_deleted_at IS NULL`,
          [candidate.id, nextAttempts, backoffSeconds],
        );
      } catch {
        ctx.warn('[capture-cleanup] retry state update failed');
      }
      ctx.warn('[capture-cleanup] object delete failed');
    }
  }

  const expiredResumeTokens = (await query<{ token_hash: string }>(
    `WITH expired_resume_tokens AS (
       SELECT r.token_hash
         FROM capture_session_resume_token r
         JOIN capture_session s ON s.id = r.session_id
        WHERE r.expires_at <= now()
           OR s.status <> 'open'
           OR s.expires_at <= now()
        ORDER BY r.token_hash
        FOR UPDATE OF r SKIP LOCKED
        LIMIT $1
     )
     DELETE FROM capture_session_resume_token r
      USING expired_resume_tokens expired
      WHERE r.token_hash = expired.token_hash
      RETURNING r.token_hash`,
    [CLEANUP_BATCH_SIZE],
  )) ?? [];

  const result: CaptureCleanupResult = {
    enabled: true,
    expiredSessions: expired.length,
    resumeTokensDeleted: expiredResumeTokens.length,
    candidates: candidates.length,
    deleted,
    failed,
  };
  // Aggregate-only operational evidence: no case/session/asset ids, filenames or paths.
  ctx.log('[capture-cleanup] completed', result);
  return result;
}

app.timer('capture-retention-cleanup', {
  schedule: '0 17 3 * * *',
  handler: async (_timer, ctx) => {
    try {
      await runCaptureCleanup(ctx);
    } catch {
      ctx.error('[capture-cleanup] timer failed');
    }
  },
});

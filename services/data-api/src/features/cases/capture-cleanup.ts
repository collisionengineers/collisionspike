import { app, type InvocationContext } from '@azure/functions';
import {
  captureStagingBlobPath,
  captureValidatedBlobPath,
  deleteCaptureManagedBlob,
  isCaptureManagedBlobPath,
} from '../evidence/blob-store.js';
import { query } from '../../platform/db/client.js';
import { gates } from '../settings/gates.js';
import { purgeStaleCaptureRateLimitWindows } from './capture-rate-limit.js';
import { withResolvedCaseMutationTarget } from './case-mutation-target.js';

const CLEANUP_BATCH_SIZE = 100;

export interface CaptureCleanupResult {
  enabled: boolean;
  expiredSessions: number;
  resumeTokensDeleted: number;
  candidates: number;
  deleted: number;
  failed: number;
}

interface CaptureCleanupCandidate extends Record<string, unknown> {
  id: string;
  session_id: string;
  case_id: string;
  blob_path: string;
  declared_sha256: string;
  evidence_id: string | null;
  evidence_storage_path: string | null;
  cleanup_attempt_count: number;
}

interface LockedCaptureCleanupCandidate extends CaptureCleanupCandidate {
  state: string;
  materialised_at: Date | string | null;
  staging_deleted_at: Date | string | null;
}

export function configuredCaptureRetentionDays(
  value = process.env.CAPTURE_RETENTION_DAYS,
): number | undefined {
  const days = value == null || value.trim() === '' ? 30 : Number(value);
  return Number.isInteger(days) && days >= 1 && days <= 3650 ? days : undefined;
}

/**
 * Re-check and delete one candidate while holding the repository-wide case lock,
 * the capture row, and any linked Evidence row. Keeping those locks across the
 * storage delete prevents submission, merge, or evidence repair from making the
 * object canonical between the eligibility read and deletion.
 */
async function deleteCaptureCandidate(
  candidate: CaptureCleanupCandidate,
  retentionDays: number,
): Promise<boolean> {
  const resolved = await withResolvedCaseMutationTarget(candidate.case_id, async (q, target) => {
    const rows = await q<LockedCaptureCleanupCandidate>(
      `SELECT a.id, a.session_id, s.case_id, a.blob_path, a.declared_sha256,
              a.evidence_id, NULL::text AS evidence_storage_path,
              a.cleanup_attempt_count, a.state, a.materialised_at,
              a.staging_deleted_at
         FROM capture_asset a
         JOIN capture_session s ON s.id = a.session_id
        WHERE a.id = $1
          AND s.status IN ('expired','revoked','complete','locked')
          AND COALESCE(s.expired_at, s.revoked_at, s.submitted_at, s.locked_at, s.expires_at)
                <= now() - make_interval(days => $2)
          AND a.blob_deleted_at IS NULL
          AND (a.cleanup_next_attempt_at IS NULL OR a.cleanup_next_attempt_at <= now())
          AND (a.blob_path LIKE 'capture/%' OR a.blob_path LIKE 'capture-validated/%')
        FOR UPDATE OF a, s`,
      [candidate.id, retentionDays],
    );
    const current = rows[0];
    if (!current || !target.lineage.includes(current.case_id.trim().toLowerCase())) return false;

    let evidenceStoragePath: string | null = null;
    if (current.evidence_id) {
      const evidence = await q<{ storage_path: string | null }>(
        'SELECT storage_path FROM evidence WHERE id = $1 FOR UPDATE',
        [current.evidence_id],
      );
      evidenceStoragePath = evidence[0]?.storage_path ?? null;
    }

    const unmaterialised = current.evidence_id === null
      && current.materialised_at === null
      && current.state !== 'materialised';
    const linkedOrphan = current.evidence_id !== null
      && (
        current.staging_deleted_at === null
        || (evidenceStoragePath !== null && evidenceStoragePath !== current.blob_path)
      );
    if (!unmaterialised && !linkedOrphan) return false;

    const derivedValidatedPath = captureValidatedBlobPath(
      current.session_id,
      current.id,
      current.declared_sha256,
    );
    const derivedStagingPath = captureStagingBlobPath(current.session_id, current.id);
    const possiblePaths = current.evidence_id && !evidenceStoragePath
      ? [derivedStagingPath]
      : [derivedStagingPath, current.blob_path, derivedValidatedPath];
    const paths = [...new Set(possiblePaths)]
      .filter((path) => isCaptureManagedBlobPath(path))
      .filter((path) => path !== evidenceStoragePath);
    if (paths.length === 0) return false;

    for (const path of paths) await deleteCaptureManagedBlob(path);
    const stamped = await q<{ id: string }>(
      `UPDATE capture_asset
          SET blob_deleted_at = now(), cleanup_code = 'retention',
              staging_deleted_at = COALESCE(staging_deleted_at, now()),
              cleanup_attempt_count = 0, cleanup_next_attempt_at = NULL,
              cleanup_last_error_category = NULL, updated_at = now()
        WHERE id = $1 AND blob_deleted_at IS NULL
        RETURNING id`,
      [current.id],
    );
    return Boolean(stamped[0]);
  });
  if (resolved.kind === 'unresolved') {
    throw new Error(`capture cleanup case resolution failed: ${resolved.reason}`);
  }
  return resolved.value;
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
  if (!gates.captureCleanup()) return disabled;

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

  const candidates = await query<CaptureCleanupCandidate>(
    `SELECT a.id, a.session_id, s.case_id, a.blob_path, a.declared_sha256, a.evidence_id,
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
      if (await deleteCaptureCandidate(candidate, retentionDays)) deleted++;
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

/**
 * Purge stale rate-limit windows. Kept OUT of runCaptureCleanup's retention gate: the
 * `capture_rate_limit` table is populated by public capture (PUBLIC_CAPTURE_ENABLED),
 * which is independent of CAPTURE_CLEANUP_ENABLED, so its garbage collection must run
 * whenever the timer fires or the table would grow unbounded while retention is off.
 */
export async function purgeCaptureRateLimit(ctx: InvocationContext): Promise<number> {
  try {
    return await purgeStaleCaptureRateLimitWindows();
  } catch {
    ctx.warn('[capture-cleanup] rate-limit window purge failed');
    return 0;
  }
}

app.timer('capture-retention-cleanup', {
  schedule: '0 17 3 * * *',
  handler: async (_timer, ctx) => {
    try {
      await runCaptureCleanup(ctx);
    } catch {
      ctx.error('[capture-cleanup] timer failed');
    }
    // Independent of the retention gate — see purgeCaptureRateLimit.
    await purgeCaptureRateLimit(ctx);
  },
});

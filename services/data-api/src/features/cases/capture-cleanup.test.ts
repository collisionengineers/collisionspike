import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvocationContext } from '@azure/functions';

interface TimerRegistration {
  schedule: string;
  handler: (timer: unknown, ctx: InvocationContext) => Promise<void>;
}

const registrations = vi.hoisted(() => new Map<string, TimerRegistration>());
vi.mock('@azure/functions', () => ({
  app: { timer: (name: string, options: TimerRegistration) => registrations.set(name, options) },
}));

const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../platform/db/client.js', () => ({ query: db.query }));

const mutationTarget = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('./case-mutation-target.js', () => ({
  withResolvedCaseMutationTarget: mutationTarget.resolve,
}));

const blobs = vi.hoisted(() => ({ remove: vi.fn() }));
vi.mock('../evidence/blob-store.js', () => ({
  captureStagingBlobPath: (sessionId: string, assetId: string) =>
    `capture/${sessionId}/${assetId}`,
  captureValidatedBlobPath: (sessionId: string, assetId: string, sha256: string) =>
    `capture-validated/${sessionId}/${assetId}/${sha256}`,
  deleteCaptureManagedBlob: blobs.remove,
  isCaptureManagedBlobPath: (path: string) =>
    path.startsWith('capture/') || path.startsWith('capture-validated/'),
}));

const { configuredCaptureRetentionDays, runCaptureCleanup } = await import('./capture-cleanup.js');

const ctx = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as InvocationContext;

const CASE_A = '11111111-1111-4111-8111-111111111111';
const CASE_B = '22222222-2222-4222-8222-222222222222';

function lockedCandidate(overrides: Record<string, unknown>) {
  return {
    id: 'asset-1',
    session_id: 'session-1',
    case_id: CASE_A,
    blob_path: 'capture/session-1/asset-1',
    declared_sha256: 'a'.repeat(64),
    evidence_id: null,
    evidence_storage_path: null,
    cleanup_attempt_count: 0,
    state: 'uploaded',
    materialised_at: null,
    staging_deleted_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  delete process.env.CAPTURE_CLEANUP_ENABLED;
  delete process.env.CAPTURE_RETENTION_DAYS;
  db.query.mockReset();
  mutationTarget.resolve.mockReset();
  mutationTarget.resolve.mockImplementation(async (
    caseId: string,
    work: (
      q: typeof db.query,
      target: { caseId: string; statusCode: number; lineage: string[] },
    ) => Promise<unknown>,
  ) => ({
    kind: 'resolved',
    targetCaseId: caseId,
    value: await work(db.query, { caseId, statusCode: 100000001, lineage: [caseId] }),
  }));
  blobs.remove.mockReset();
  vi.mocked(ctx.log).mockReset();
  vi.mocked(ctx.warn).mockReset();
  vi.mocked(ctx.error).mockReset();
});

describe('capture retention cleanup', () => {
  it('registers a daily gated timer and validates the retention window', () => {
    expect(registrations.get('capture-retention-cleanup')).toMatchObject({
      schedule: '0 17 3 * * *',
    });
    expect(configuredCaptureRetentionDays(undefined)).toBe(30);
    expect(configuredCaptureRetentionDays('90')).toBe(90);
    expect(configuredCaptureRetentionDays('0')).toBeUndefined();
    expect(configuredCaptureRetentionDays('forever')).toBeUndefined();
  });

  it('does no database or storage work while the cleanup gate is off', async () => {
    await expect(runCaptureCleanup(ctx)).resolves.toEqual({
      enabled: false,
      expiredSessions: 0,
      resumeTokensDeleted: 0,
      candidates: 0,
      deleted: 0,
      failed: 0,
    });
    expect(db.query).not.toHaveBeenCalled();
    expect(blobs.remove).not.toHaveBeenCalled();
  });

  it('marks expiry and removes both staging and deterministic promoted orphans', async () => {
    process.env.CAPTURE_CLEANUP_ENABLED = 'true';
    process.env.CAPTURE_RETENTION_DAYS = '7';
    const sha = 'a'.repeat(64);
    db.query
      .mockResolvedValueOnce([{ id: 'session-1' }])
      .mockResolvedValueOnce([{
        id: 'asset-1',
        session_id: 'session-1',
        case_id: CASE_A,
        blob_path: 'capture/session-1/asset-1',
        declared_sha256: sha,
        evidence_id: null,
        evidence_storage_path: null,
        cleanup_attempt_count: 0,
      }])
      .mockResolvedValueOnce([lockedCandidate({ declared_sha256: sha })])
      .mockResolvedValueOnce([{ id: 'asset-1' }])
      .mockResolvedValueOnce([]);
    blobs.remove.mockResolvedValue(undefined);

    await expect(runCaptureCleanup(ctx)).resolves.toEqual({
      enabled: true,
      expiredSessions: 1,
      resumeTokensDeleted: 0,
      candidates: 1,
      deleted: 1,
      failed: 0,
      rateLimitWindowsPurged: 0,
    });
    expect(blobs.remove.mock.calls.map(([path]) => path)).toEqual([
      'capture/session-1/asset-1',
      `capture-validated/session-1/asset-1/${sha}`,
    ]);
    const expirySql = String(db.query.mock.calls[0]?.[0]);
    expect(expirySql).toContain('ORDER BY id');
    expect(expirySql).toContain('FOR UPDATE SKIP LOCKED');
    expect(expirySql).toContain('LIMIT $1');
    expect(db.query.mock.calls[0]?.[1]).toEqual([100]);
    expect(String(db.query.mock.calls[1]?.[0])).toContain("s.status IN ('expired','revoked','complete','locked')");
    expect(String(db.query.mock.calls[1]?.[0])).toContain('s.locked_at');
    expect(String(db.query.mock.calls[1]?.[0])).toContain('a.cleanup_next_attempt_at <= now()');
    expect(String(db.query.mock.calls[1]?.[0])).toContain('a.materialised_at IS NULL');
    expect(String(db.query.mock.calls[1]?.[0])).toContain('a.staging_deleted_at IS NULL');
    expect(String(db.query.mock.calls[2]?.[0])).toContain('FOR UPDATE OF a, s');
    expect(String(db.query.mock.calls[3]?.[0])).toContain('cleanup_attempt_count = 0');
    expect(String(db.query.mock.calls[3]?.[0])).toContain('staging_deleted_at = COALESCE');
    expect(String(db.query.mock.calls[3]?.[0])).toContain('cleanup_last_error_category = NULL');
    expect(db.query.mock.calls[3]?.[1]).toEqual(['asset-1']);
    expect(ctx.log).toHaveBeenCalledWith('[capture-cleanup] completed', expect.objectContaining({
      deleted: 1,
    }));
  });

  it('deletes a dedupe asset only when its own paths differ from canonical Evidence storage', async () => {
    process.env.CAPTURE_CLEANUP_ENABLED = 'true';
    const sha = 'b'.repeat(64);
    const ownPath = `capture-validated/session-2/asset-2/${sha}`;
    db.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 'asset-2',
        session_id: 'session-2',
        case_id: CASE_A,
        blob_path: ownPath,
        declared_sha256: sha,
        evidence_id: 'evidence-existing',
        evidence_storage_path: 'capture-validated/other-session/original/hash',
        cleanup_attempt_count: 0,
      }])
      .mockResolvedValueOnce([lockedCandidate({
        id: 'asset-2',
        session_id: 'session-2',
        blob_path: ownPath,
        declared_sha256: sha,
        evidence_id: 'evidence-existing',
        state: 'materialised',
        materialised_at: '2026-01-01T00:00:00Z',
        staging_deleted_at: '2026-01-01T00:00:00Z',
      })])
      .mockResolvedValueOnce([{
        storage_path: 'capture-validated/other-session/original/hash',
      }])
      .mockResolvedValueOnce([{ id: 'asset-2' }])
      .mockResolvedValueOnce([]);
    blobs.remove.mockResolvedValue(undefined);

    const result = await runCaptureCleanup(ctx);

    expect(result.deleted).toBe(1);
    expect(blobs.remove.mock.calls.map(([path]) => path)).toEqual([
      'capture/session-2/asset-2',
      ownPath,
    ]);
    expect(String(db.query.mock.calls[2]?.[0])).toContain('FOR UPDATE OF a, s');
    expect(String(db.query.mock.calls[3]?.[0])).toContain('FROM evidence');
    expect(String(db.query.mock.calls[3]?.[0])).toContain('FOR UPDATE');
    expect(db.query.mock.calls[4]?.[1]).toEqual(['asset-2']);
  });

  it('recovers failed immediate staging cleanup after materialisation without deleting canonical evidence', async () => {
    process.env.CAPTURE_CLEANUP_ENABLED = 'true';
    const sha = 'e'.repeat(64);
    const canonicalPath = `capture-validated/session-3/asset-3/${sha}`;
    db.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 'asset-3',
        session_id: 'session-3',
        case_id: CASE_A,
        blob_path: canonicalPath,
        declared_sha256: sha,
        evidence_id: 'evidence-canonical',
        evidence_storage_path: canonicalPath,
        cleanup_attempt_count: 0,
      }])
      .mockResolvedValueOnce([lockedCandidate({
        id: 'asset-3',
        session_id: 'session-3',
        blob_path: canonicalPath,
        declared_sha256: sha,
        evidence_id: 'evidence-canonical',
        state: 'materialised',
        materialised_at: '2026-01-01T00:00:00Z',
      })])
      .mockResolvedValueOnce([{ storage_path: canonicalPath }])
      .mockResolvedValueOnce([{ id: 'asset-3' }])
      .mockResolvedValueOnce([]);
    blobs.remove.mockResolvedValue(undefined);

    const result = await runCaptureCleanup(ctx);

    expect(result).toMatchObject({ candidates: 1, deleted: 1, failed: 0 });
    expect(blobs.remove).toHaveBeenCalledOnce();
    expect(blobs.remove).toHaveBeenCalledWith('capture/session-3/asset-3');
    expect(blobs.remove).not.toHaveBeenCalledWith(canonicalPath);
    const candidateSql = String(db.query.mock.calls[1]?.[0]);
    expect(candidateSql).toContain('a.staging_deleted_at IS NULL');
    expect(candidateSql).toContain('e.storage_path <> a.blob_path');
    expect(candidateSql).toContain("a.state <> 'materialised'");
    expect(db.query.mock.calls[4]?.[1]).toEqual(['asset-3']);
  });

  it('does not resweep canonical materialised assets after immediate staging deletion is marked', async () => {
    process.env.CAPTURE_CLEANUP_ENABLED = 'true';
    db.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await runCaptureCleanup(ctx);

    expect(result).toMatchObject({ candidates: 0, deleted: 0, failed: 0 });
    const candidateSql = String(db.query.mock.calls[1]?.[0]);
    expect(candidateSql).toContain('a.staging_deleted_at IS NULL');
    expect(candidateSql).toContain('e.storage_path <> a.blob_path');
    expect(blobs.remove).not.toHaveBeenCalled();
  });

  it('deletes only deterministic staging when linked Evidence was purged from storage', async () => {
    process.env.CAPTURE_CLEANUP_ENABLED = 'true';
    const sha = 'f'.repeat(64);
    const validatedPath = `capture-validated/session-purged/asset-purged/${sha}`;
    db.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 'asset-purged',
        session_id: 'session-purged',
        case_id: CASE_A,
        blob_path: validatedPath,
        declared_sha256: sha,
        evidence_id: 'evidence-purged',
        evidence_storage_path: null,
        cleanup_attempt_count: 0,
      }])
      .mockResolvedValueOnce([lockedCandidate({
        id: 'asset-purged',
        session_id: 'session-purged',
        blob_path: validatedPath,
        declared_sha256: sha,
        evidence_id: 'evidence-purged',
        state: 'materialised',
        materialised_at: '2026-01-01T00:00:00Z',
      })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'asset-purged' }])
      .mockResolvedValueOnce([]);
    blobs.remove.mockResolvedValue(undefined);

    const result = await runCaptureCleanup(ctx);

    expect(result).toMatchObject({ candidates: 1, deleted: 1, failed: 0 });
    expect(blobs.remove).toHaveBeenCalledOnce();
    expect(blobs.remove).toHaveBeenCalledWith('capture/session-purged/asset-purged');
    expect(blobs.remove).not.toHaveBeenCalledWith(validatedPath);
    expect(String(db.query.mock.calls[3]?.[0])).toContain('FROM evidence');
    expect(db.query.mock.calls[4]?.[1]).toEqual(['asset-purged']);
  });

  it('persists bounded retry state after a delete failure and continues the batch', async () => {
    process.env.CAPTURE_CLEANUP_ENABLED = 'true';
    const firstSha = 'c'.repeat(64);
    const secondSha = 'd'.repeat(64);
    db.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'asset-failing',
          session_id: 'session-failing',
          case_id: CASE_A,
          blob_path: 'capture/session-failing/asset-failing',
          declared_sha256: firstSha,
          evidence_id: null,
          evidence_storage_path: null,
          cleanup_attempt_count: 3,
        },
        {
          id: 'asset-later',
          session_id: 'session-later',
          case_id: CASE_B,
          blob_path: 'capture/session-later/asset-later',
          declared_sha256: secondSha,
          evidence_id: null,
          evidence_storage_path: null,
          cleanup_attempt_count: 0,
        },
      ])
      .mockResolvedValueOnce([lockedCandidate({
        id: 'asset-failing',
        session_id: 'session-failing',
        blob_path: 'capture/session-failing/asset-failing',
        declared_sha256: firstSha,
        cleanup_attempt_count: 3,
      })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([lockedCandidate({
        id: 'asset-later',
        session_id: 'session-later',
        case_id: CASE_B,
        blob_path: 'capture/session-later/asset-later',
        declared_sha256: secondSha,
      })])
      .mockResolvedValueOnce([{ id: 'asset-later' }])
      .mockResolvedValueOnce([]);
    blobs.remove
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValue(undefined);

    await expect(runCaptureCleanup(ctx)).resolves.toEqual({
      enabled: true,
      expiredSessions: 0,
      resumeTokensDeleted: 0,
      candidates: 2,
      deleted: 1,
      failed: 1,
      rateLimitWindowsPurged: 0,
    });

    const retrySql = String(db.query.mock.calls[3]?.[0]);
    const retryParams = db.query.mock.calls[3]?.[1] as unknown[];
    expect(retrySql).toContain('cleanup_next_attempt_at');
    expect(retrySql).toContain("cleanup_last_error_category = 'blob_delete_failed'");
    expect(retryParams).toEqual(['asset-failing', 4, 480]);
    expect(blobs.remove).toHaveBeenCalledWith('capture/session-later/asset-later');
    expect(blobs.remove).toHaveBeenCalledWith(
      `capture-validated/session-later/asset-later/${secondSha}`,
    );
    expect(ctx.warn).toHaveBeenCalledWith('[capture-cleanup] object delete failed');
  });

  it('rechecks canonical evidence under locks before deleting a previously orphaned path', async () => {
    process.env.CAPTURE_CLEANUP_ENABLED = 'true';
    const sha = '9'.repeat(64);
    const canonicalPath = `capture-validated/session-race/asset-race/${sha}`;
    db.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 'asset-race',
        session_id: 'session-race',
        case_id: CASE_A,
        blob_path: canonicalPath,
        declared_sha256: sha,
        evidence_id: 'evidence-race',
        evidence_storage_path: 'capture-validated/old/orphan/hash',
        cleanup_attempt_count: 0,
      }])
      .mockResolvedValueOnce([lockedCandidate({
        id: 'asset-race',
        session_id: 'session-race',
        blob_path: canonicalPath,
        declared_sha256: sha,
        evidence_id: 'evidence-race',
        state: 'materialised',
        materialised_at: '2026-01-01T00:00:00Z',
        staging_deleted_at: '2026-01-01T00:00:00Z',
      })])
      .mockResolvedValueOnce([{ storage_path: canonicalPath }])
      .mockResolvedValueOnce([]);

    const result = await runCaptureCleanup(ctx);

    expect(result).toMatchObject({ candidates: 1, deleted: 0, failed: 0 });
    expect(blobs.remove).not.toHaveBeenCalled();
    expect(String(db.query.mock.calls[2]?.[0])).toContain('FOR UPDATE OF a, s');
    expect(String(db.query.mock.calls[3]?.[0])).toContain('FOR UPDATE');
    expect(String(db.query.mock.calls[4]?.[0])).toContain('capture_session_resume_token');
  });

  it('deletes expired or terminal resume tokens in a bounded skip-locked batch', async () => {
    process.env.CAPTURE_CLEANUP_ENABLED = 'true';
    db.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ token_hash: 'a'.repeat(64) }]);

    const result = await runCaptureCleanup(ctx);

    expect(result).toMatchObject({ resumeTokensDeleted: 1, candidates: 0, failed: 0 });
    const sql = String(db.query.mock.calls[2]?.[0]);
    expect(sql).toContain("s.status <> 'open'");
    expect(sql).toContain('FOR UPDATE OF r SKIP LOCKED');
    expect(sql).toContain('DELETE FROM capture_session_resume_token');
    expect(db.query.mock.calls[2]?.[1]).toEqual([100]);
  });
});

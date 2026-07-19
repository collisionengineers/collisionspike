/** merge-capture — cohesive Data API module. */

import type { TxQuery } from '../../platform/db/client.js';
import { AUDIT_ACTION, writeAuditStrict } from '../../shared/audit.js';

export async function lockCaptureSessionsForMerge(
  q: TxQuery,
  sourceCaseId: string,
): Promise<string[]> {
  const relations = await q<{ capture_session_regclass: string | null }>(
    "SELECT to_regclass('public.capture_session')::text AS capture_session_regclass",
  );
  if (!relations[0]?.capture_session_regclass) return [];
  const locked = await q<{ id: string }>(
    `SELECT id FROM capture_session
      WHERE case_id = $1
      ORDER BY id
      FOR UPDATE`,
    [sourceCaseId],
  );
  return locked.map((row) => row.id);
}

export async function lockCaptureAssetsForMerge(
  q: TxQuery,
  sessionIds: readonly string[],
): Promise<string[]> {
  if (sessionIds.length === 0) return [];
  const locked = await q<{ id: string }>(
    `SELECT id FROM capture_asset
      WHERE session_id = ANY($1::uuid[])
      ORDER BY id
      FOR UPDATE`,
    [sessionIds],
  );
  return locked.map((row) => row.id);
}

export async function repointLockedCaptureAssetsForMerge(
  q: TxQuery,
  assetIds: readonly string[],
  evidenceReplacements: ReadonlyMap<string, string>,
): Promise<void> {
  if (assetIds.length === 0 || evidenceReplacements.size === 0) return;
  for (const [redundantEvidenceId, survivorEvidenceId] of [...evidenceReplacements].sort()) {
    await q(
      `UPDATE capture_asset
          SET evidence_id = $2, updated_at = now()
        WHERE evidence_id = $1 AND id = ANY($3::uuid[])`,
      [redundantEvidenceId, survivorEvidenceId, assetIds],
    );
  }
}

export async function reparentLockedCaptureSessionsForMerge(
  q: TxQuery,
  sessionIds: readonly string[],
  sourceCaseId: string,
  targetCaseId: string,
  actor: string | undefined,
): Promise<void> {
  if (sessionIds.length === 0) return;
  const moved = await q<{ id: string }>(
    `UPDATE capture_session
        SET case_id = $2, updated_at = now()
      WHERE case_id = $1 AND id = ANY($3::uuid[])
      RETURNING id`,
    [sourceCaseId, targetCaseId, sessionIds],
  );
  if (moved.length !== sessionIds.length) {
    throw new Error('capture session ownership changed while case merge locks were held');
  }
  for (const sessionId of [...sessionIds].sort()) {
    await writeAuditStrict({
      action: AUDIT_ACTION.capture_session_retargeted,
      caseId: targetCaseId,
      actor: actor ?? 'staff',
      summary: 'Guided capture session moved to merged case survivor',
      before: { caseId: sourceCaseId },
      after: {
        sessionId,
        caseId: targetCaseId,
        lineage: [sourceCaseId, targetCaseId],
        reason: 'case_merge',
      },
    }, q);
  }
}

/** merge-evidence — cohesive Data API module. */

import type { TxQuery } from '../../platform/db/client.js';
import { requestArchiveMirrorIfEligible, type ArchiveMirrorCandidate } from '../archive/mirror-outbox.js';
import type { Row } from '../../shared/mapping/index.js';

const MERGE_SHA256_RE = /^[0-9a-f]{64}$/i;

interface MergeEvidenceLockRow extends Record<string, unknown> {
  id: string;
  case_id: string;
  sha256: string | null;
  created_at: Date | string;
  archive_mirror_claim_token: string | null;
  archive_mirror_claim_expires_at: Date | string | null;
  deletion_operation_id: string | null;
}

export async function mergeEvidenceRows(
  q: TxQuery,
  sourceCaseId: string,
  targetCaseId: string,
): Promise<{
  movedEvidence: number;
  collidingEvidence: number;
  evidenceReplacements: Map<string, string>;
  archiveBusy?: boolean;
}> {
  const locked = await q<MergeEvidenceLockRow>(
    `SELECT id, case_id, sha256, created_at,
            archive_mirror_claim_token, archive_mirror_claim_expires_at,
            deletion_operation_id
       FROM evidence
      WHERE case_id = ANY($1::uuid[])
      ORDER BY case_id, created_at, id
      FOR UPDATE`,
    [[sourceCaseId, targetCaseId]],
  );
  const now = Date.now();
  if (locked.some((row) => {
    if (!row.archive_mirror_claim_token || !row.archive_mirror_claim_expires_at) return false;
    const expires = new Date(row.archive_mirror_claim_expires_at).getTime();
    return Number.isFinite(expires) && expires > now;
  })) {
    return {
      movedEvidence: 0,
      collidingEvidence: 0,
      evidenceReplacements: new Map(),
      archiveBusy: true,
    };
  }
  if (locked.some((row) => row.deletion_operation_id != null)) {
    throw new Error('image deletion state changed during merge');
  }
  const canonicalSha = (value: string | null): string | null => {
    const trimmed = (value ?? '').trim();
    return MERGE_SHA256_RE.test(trimmed) ? trimmed.toLowerCase() : null;
  };

  // The oldest target row is the deterministic survivor if historic target-side
  // duplicates exist. The source is never allowed to replace a target-owned row.
  const survivorBySha = new Map<string, string>();
  for (const row of locked) {
    if (row.case_id.toLowerCase() !== targetCaseId) continue;
    const sha = canonicalSha(row.sha256);
    if (sha && !survivorBySha.has(sha)) survivorBySha.set(sha, row.id);
  }

  const collisionSourceIds: string[] = [];
  const evidenceReplacements = new Map<string, string>();
  for (const row of locked) {
    if (row.case_id.toLowerCase() !== sourceCaseId) continue;
    const sha = canonicalSha(row.sha256);
    if (!sha) continue;
    const survivorId = survivorBySha.get(sha);
    if (!survivorId) {
      // No target copy: the oldest source row becomes the one copy that moves.
      // Later source twins with this hash are coalesced into it and stay retired.
      survivorBySha.set(sha, row.id);
      continue;
    }
    collisionSourceIds.push(row.id);
    evidenceReplacements.set(row.id, survivorId);

    // Fill only information the target survivor does not already own. Explicit
    // target-side staff/provider/cleanup decisions always win over source metadata.
    const survivors = await q<ArchiveMirrorCandidate>(
      `UPDATE evidence AS survivor
          SET storage_path = COALESCE(survivor.storage_path, redundant.storage_path),
              source_message_id = COALESCE(survivor.source_message_id, redundant.source_message_id),
              box_file_id = COALESCE(survivor.box_file_id, redundant.box_file_id),
              box_file_url = COALESCE(survivor.box_file_url, redundant.box_file_url),
              content_type = COALESCE(NULLIF(btrim(survivor.content_type), ''), redundant.content_type),
              size_bytes = COALESCE(survivor.size_bytes, redundant.size_bytes),
              source_label = COALESCE(NULLIF(btrim(survivor.source_label), ''), redundant.source_label),
              sequence_index = COALESCE(survivor.sequence_index, redundant.sequence_index),
              image_role_code = CASE
                WHEN survivor.image_role_source IS NULL
                 AND survivor.image_role_code = 100000003
                 AND redundant.image_role_code <> 100000003
                  THEN redundant.image_role_code
                ELSE survivor.image_role_code
              END,
              image_role_source = CASE
                WHEN survivor.image_role_source IS NULL
                 AND survivor.image_role_code = 100000003
                 AND redundant.image_role_code <> 100000003
                  THEN redundant.image_role_source
                ELSE survivor.image_role_source
              END,
              registration_visible = CASE
                WHEN survivor.registration_visible_source IS NULL
                 AND survivor.registration_visible IS NULL
                 AND redundant.registration_visible IS NOT NULL
                  THEN redundant.registration_visible
                ELSE survivor.registration_visible
              END,
              registration_visible_source = CASE
                WHEN survivor.registration_visible_source IS NULL
                 AND survivor.registration_visible IS NULL
                 AND redundant.registration_visible IS NOT NULL
                  THEN redundant.registration_visible_source
                ELSE survivor.registration_visible_source
              END,
              accepted_for_eva = CASE
                WHEN survivor.accepted_for_eva_source IS NULL
                 AND redundant.accepted_for_eva_source IS NOT NULL
                  THEN redundant.accepted_for_eva
                ELSE survivor.accepted_for_eva
              END,
              accepted_for_eva_source = COALESCE(
                survivor.accepted_for_eva_source,
                redundant.accepted_for_eva_source
              ),
              excluded = CASE
                WHEN survivor.exclusion_decision_source IS NULL
                 AND redundant.exclusion_decision_source IS NOT NULL
                 AND (
                   survivor.archive_mirror_claim_token IS NULL
                   OR survivor.archive_mirror_claim_expires_at <= now()
                 )
                  THEN redundant.excluded
                ELSE survivor.excluded
              END,
              exclusion_reason = CASE
                WHEN survivor.exclusion_decision_source IS NULL
                 AND redundant.exclusion_decision_source IS NOT NULL
                 AND (
                   survivor.archive_mirror_claim_token IS NULL
                   OR survivor.archive_mirror_claim_expires_at <= now()
                 )
                  THEN redundant.exclusion_reason
                ELSE survivor.exclusion_reason
              END,
              exclusion_decision_source = COALESCE(
                survivor.exclusion_decision_source,
                CASE
                  WHEN survivor.archive_mirror_claim_token IS NULL
                    OR survivor.archive_mirror_claim_expires_at <= now()
                    THEN redundant.exclusion_decision_source
                  ELSE NULL
                END
              ),
              person_reflection = survivor.person_reflection OR redundant.person_reflection,
              reflection_dismissed = survivor.reflection_dismissed OR redundant.reflection_dismissed,
              updated_at = now()
         FROM evidence AS redundant
        WHERE survivor.id = $1
          AND redundant.id = $2
      RETURNING survivor.id,
                survivor.case_id,
                survivor.excluded,
                survivor.storage_path,
                survivor.box_file_id`,
      [survivorId, row.id],
    );
    if (survivors[0]) {
      // A collision may have supplied the survivor's only blob path. Queue that
      // canonical row, then retire any redundant row's pending generation. Both
      // evidence rows are already locked and the case rows were locked first.
      await requestArchiveMirrorIfEligible(q, survivors[0]);
    }
    await q(
      `UPDATE archive_mirror_outbox
          SET completed_generation = requested_generation,
              completed_at = now(),
              updated_at = now()
        WHERE evidence_id = $1
          AND completed_generation < requested_generation`,
      [row.id],
    );
    // A staff-upload item may point at the redundant row, including when a
    // Manual Intake upload deduped onto it. Follow the canonical target evidence
    // so later archive failure/readiness and retry observe the survivor.
    await q(
      `UPDATE staff_evidence_upload_item
          SET evidence_id = $2, updated_at = now()
        WHERE evidence_id = $1`,
      [row.id, survivorId],
    );
  }

  const moved = await q<Row>(
    `UPDATE evidence
        SET case_id = $2, updated_at = now()
      WHERE case_id = $1
        AND NOT (id = ANY($3::uuid[]))
      RETURNING id`,
    [sourceCaseId, targetCaseId, collisionSourceIds],
  );
  if (moved.length > 0) {
    await q(
      `UPDATE archive_mirror_outbox
          SET case_id = $2, updated_at = now()
        WHERE evidence_id = ANY($1::uuid[])`,
      [moved.map((row) => row.id), targetCaseId],
    );
  }
  return {
    movedEvidence: moved.length,
    collidingEvidence: collisionSourceIds.length,
    evidenceReplacements,
  };
}

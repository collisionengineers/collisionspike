/** merge-routes — cohesive Data API module. */

import { app } from '@azure/functions';
import { canonicalizeVrm, decideMergeProvider, isRetiredMerged, type MergeCasesResult } from '@cs/domain';
import { sourceTypeCodec, statusToInt } from '@cs/domain/codecs';
import { withRole } from '../../platform/auth/staff-auth.js';
import { query, tx, type TxQuery } from '../../platform/db/client.js';
import { acquireCaseMutationLocks, orderedCaseMutationIds } from './mutation-locks.js';
import { acknowledgeStatusRecompute, requestStatusRecompute } from './status-recompute.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit, writeAuditStrict } from '../../shared/audit.js';
import { requestArchiveMirrorIfEligible, type ArchiveMirrorCandidate } from '../archive/mirror-outbox.js';
import { completeProviderRecoveryUsing } from '../providers/recovery.js';
import { cancelProviderArchive, requestProviderArchive } from '../providers/archive-outbox.js';
import { CASE_SELECT, TWIN_TERMINAL, rowToCase, type Row } from '../../shared/mapping/index.js';
import { loadCaseLite, mergeClaimantProvenance, recomputeStatus } from './case-support.js';

export function mergeProvidersCompatible(
  leftProviderCode: string | undefined,
  rightProviderCode: string | undefined,
): boolean {
  const left = (leftProviderCode ?? '').trim().toUpperCase();
  const right = (rightProviderCode ?? '').trim().toUpperCase();
  // Match the merge transaction's ADR-0010 guard exactly: only two known,
  // different providers are incompatible. A providerless image-led case must
  // remain reachable so the merge can preserve the resolved provider from its twin.
  return !left || !right || left === right;
}

app.http('mergeCandidates', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cases/{id}/merge-candidates',
  handler: withRole('CollisionSpike.User', async (req) => {
    const id = req.params.id;
    const self = await loadCaseLite(id);
    if (!self) return { status: 200, jsonBody: [] };
    const rows = await query<Row>(`${CASE_SELECT} ORDER BY c.created_at DESC`);
    const candidates = rows
      .map((r) => rowToCase(r))
      .filter(
        (cc) =>
          cc.id !== id &&
          !TWIN_TERMINAL.has(cc.status) &&
          cc.status !== 'linked_to_instruction' &&
          mergeProvidersCompatible(cc.providerCode, self.providerCode),
      );
    return { status: 200, jsonBody: candidates };
  }),
});

const MERGE_SHA256_RE = /^[0-9a-f]{64}$/i;

const MERGE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

class MergeProviderRecoveryBlocked extends Error {
  constructor(readonly reason: string) {
    super(`Provider recovery could not continue: ${reason}`);
  }
}

class MergeTransactionRefusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MergeTransactionRefusal';
  }
}

interface MergeEvidenceLockRow extends Record<string, unknown> {
  id: string;
  case_id: string;
  sha256: string | null;
  created_at: Date | string;
  archive_mirror_claim_token: string | null;
  archive_mirror_claim_expires_at: Date | string | null;
  deletion_operation_id: string | null;
}

async function mergeEvidenceRows(
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

async function manualIntakeMergeConflict(
  q: TxQuery,
  sourceCaseId: string,
  targetCaseId: string,
): Promise<string | undefined> {
  const operations = await q<{
    case_id: string;
    expected_file_count: number | string;
    evidence_completed_at: Date | string | null;
    side_effects_completed_at: Date | string | null;
  }>(
    `SELECT case_id, expected_file_count, evidence_completed_at, side_effects_completed_at
       FROM manual_intake_case_create_operation
      WHERE case_id = ANY($1::uuid[])
      ORDER BY case_id, created_at, idempotency_key
      FOR UPDATE`,
    [[sourceCaseId, targetCaseId]],
  );
  const incomplete = operations.some((operation) =>
    operation.side_effects_completed_at == null ||
    (Number(operation.expected_file_count) > 0 && operation.evidence_completed_at == null));
  return incomplete
    ? 'Source files are still being added for one of these cases. Finish or retry them before merging.'
    : undefined;
}

async function transferStaffUploadOwnership(
  q: TxQuery,
  sourceCaseId: string,
  targetCaseId: string,
): Promise<void> {
  // Move the durable parent batch first. Evidence coalescing above may rebind an
  // item's evidence identity, but ownership stays on the source until its batch
  // owns the survivor. The following item update then restores the batch/item
  // case invariant before the transaction becomes visible.
  await q(
    `UPDATE staff_evidence_upload
        SET case_id = $2, updated_at = now()
      WHERE case_id = $1`,
    [sourceCaseId, targetCaseId],
  );
  await q(
    `UPDATE staff_evidence_upload_item
        SET case_id = $2, updated_at = now()
      WHERE case_id = $1`,
    [sourceCaseId, targetCaseId],
  );
  await q(
    `UPDATE manual_intake_case_create_operation
        SET case_id = $2, updated_at = now()
      WHERE case_id = $1`,
    [sourceCaseId, targetCaseId],
  );
}

async function reconcileMergeFileRequestIntent(
  q: TxQuery,
  sourceCaseId: string,
  targetCaseId: string,
): Promise<string | undefined> {
  const cases = await q<{
    id: string;
    box_folder_id: string | null;
    box_file_request_id: string | null;
    box_file_request_url: string | null;
  }>(
    `SELECT id, box_folder_id, box_file_request_id, box_file_request_url
       FROM case_ WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [[sourceCaseId, targetCaseId]],
  );
  const source = cases.find((row) => row.id.toLowerCase() === sourceCaseId);
  const target = cases.find((row) => row.id.toLowerCase() === targetCaseId);
  if (!source || !target) return 'Source or target case not found.';
  if ((source.box_file_request_id ?? '').trim() || (source.box_file_request_url ?? '').trim()) {
    return 'The source case already has an image-upload link. Move or close that link before merging.';
  }
  const intents = await q<{
    case_id: string;
    requested_generation: string | number;
    completed_generation: string | number;
    attempt_count: number;
    claim_token: string | null;
  }>(
    `SELECT case_id, requested_generation, completed_generation, attempt_count, claim_token
       FROM box_file_request_outbox
      WHERE case_id = ANY($1::uuid[])
      ORDER BY case_id
      FOR UPDATE`,
    [[sourceCaseId, targetCaseId]],
  );
  const sourceIntent = intents.find((row) => row.case_id.toLowerCase() === sourceCaseId);
  if (!sourceIntent) return undefined;
  const sourcePending = Number(sourceIntent.requested_generation) > Number(sourceIntent.completed_generation);
  if (!sourcePending) {
    return 'The source case has completed image-upload-link work that cannot be transferred safely.';
  }
  if (sourceIntent.attempt_count > 0 || sourceIntent.claim_token) {
    return 'Image-upload link creation may already have started for the source case. Try the merge after it finishes.';
  }
  const targetIntent = intents.find((row) => row.case_id.toLowerCase() === targetCaseId);
  const targetHasPartialLink =
    !!(target.box_file_request_id ?? '').trim() !== !!(target.box_file_request_url ?? '').trim();
  if (targetHasPartialLink) {
    return 'The survivor has an incomplete image-upload-link record. Resolve it before merging.';
  }
  const targetHasLink =
    !!(target.box_file_request_id ?? '').trim() && !!(target.box_file_request_url ?? '').trim();
  if (
    targetIntent &&
    Number(targetIntent.completed_generation) >= Number(targetIntent.requested_generation) &&
    !targetHasLink
  ) {
    return 'The survivor has completed image-upload-link work with no saved link. Resolve it before merging.';
  }
  if (targetIntent || targetHasLink) {
    // The survivor already owns equivalent work. Cancel the never-attempted source
    // generation without deleting history.
    await q(
      `UPDATE box_file_request_outbox
          SET completed_generation = requested_generation,
              completed_at = now(),
              last_error = 'superseded by merge target',
              updated_at = now()
        WHERE case_id = $1`,
      [sourceCaseId],
    );
    return undefined;
  }
  const targetFolder = (target.box_folder_id ?? '').trim();
  if (!targetFolder) {
    return 'The survivor has no archive folder for the pending image-upload link.';
  }
  await q(
    `UPDATE box_file_request_outbox
        SET case_id = $2,
            folder_id = $3,
            next_attempt_at = now(),
            updated_at = now()
      WHERE case_id = $1`,
    [sourceCaseId, targetCaseId, targetFolder],
  );
  return undefined;
}

async function lockCaptureSessionsForMerge(
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

async function lockCaptureAssetsForMerge(
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

async function repointLockedCaptureAssetsForMerge(
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

async function reparentLockedCaptureSessionsForMerge(
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

export async function reconcileMergeArchiveHolding(
  q: TxQuery,
  sourceCaseId: string,
  targetCaseId: string,
): Promise<string | undefined> {
  const folders = await q<{
    id: string;
    vrm: string | null;
    box_folder_id: string | null;
    box_folder_url: string | null;
  }>(
    `SELECT id,vrm,box_folder_id,box_folder_url FROM case_
      WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [[sourceCaseId, targetCaseId]],
  );
  const source = folders.find((row) => row.id.toLowerCase() === sourceCaseId);
  const target = folders.find((row) => row.id.toLowerCase() === targetCaseId);
  if (!source || !target) return 'Source or target case not found.';
  const sourceVrm = canonicalizeVrm(source.vrm);
  const targetVrm = canonicalizeVrm(target.vrm);
  const mergeVrms = [...new Set([sourceVrm, targetVrm].filter(Boolean))];
  const holdings = await q<{
    id: string;
    adopted_case_id: string | null;
    resolved_case_id: string | null;
    box_folder_id: string;
    canonical_folder_id: string | null;
    normalized_vrm: string;
    state: string;
    claim_active: boolean;
  }>(
    `SELECT id,adopted_case_id,resolved_case_id,box_folder_id,canonical_folder_id,normalized_vrm,state,
        claim_token IS NOT NULL AND claim_expires_at>now() AS claim_active
      FROM archive_holding_folder
      WHERE adopted_case_id=ANY($1::uuid[]) OR resolved_case_id=ANY($1::uuid[])
        OR (state<>'adopted' AND resolved_case_id IS NULL AND adopted_case_id IS NULL
          AND (candidate_case_ids ? $2::text OR candidate_case_ids ? $3::text
          OR normalized_vrm=ANY($4::text[])))
      ORDER BY id FOR UPDATE`,
    [[sourceCaseId, targetCaseId], sourceCaseId, targetCaseId, mergeVrms],
  );
  if (!holdings.length) return undefined;
  if (holdings.some((row) => row.state === 'adopting' && row.claim_active)) {
    return 'A registration image folder is still being filed. Try the merge again when it finishes.';
  }
  const waitingVrms = [...new Set(holdings
    .filter((row) => row.state !== 'adopted')
    .map((row) => row.normalized_vrm))];
  if (waitingVrms.some((vrm) => vrm !== targetVrm)) {
    return 'The survivor uses a different registration from the waiting images. Correct the registration before merging.';
  }
  const sourceFolder = (source.box_folder_id ?? '').trim();
  const targetFolder = (target.box_folder_id ?? '').trim();
  const identities = [
    sourceFolder,
    targetFolder,
    ...holdings.map((row) => (
      row.canonical_folder_id ?? (row.state === 'adopted' ? row.box_folder_id : '') ?? ''
    ).trim()),
  ].filter(Boolean);
  const distinctIdentities = [...new Set(identities)];
  if (distinctIdentities.length > 1) {
    return 'These cases use different archive folders. Reconcile the archive folders before merging.';
  }
  const canonicalFolder = distinctIdentities[0] ?? '';
  const canonicalUrl = target.box_folder_url
    ?? source.box_folder_url
    ?? (canonicalFolder ? `https://app.box.com/folder/${canonicalFolder}` : null);
  if (canonicalFolder && targetFolder !== canonicalFolder) {
    await q(
      'UPDATE case_ SET box_folder_id=$2,box_folder_url=$3,updated_at=now() WHERE id=$1',
      [targetCaseId, canonicalFolder, canonicalUrl],
    );
  }
  await q(
    `UPDATE archive_holding_folder SET adopted_case_id=$2,
      canonical_folder_id=coalesce(nullif($3,''),canonical_folder_id),updated_at=now()
    WHERE adopted_case_id=$1`,
    [sourceCaseId, targetCaseId, canonicalFolder],
  );
  await q(
    `UPDATE archive_holding_folder SET resolved_case_id=$2,updated_at=now()
    WHERE resolved_case_id=$1 AND state<>'adopted'`,
    [sourceCaseId, targetCaseId],
  );
  await q(
    `UPDATE archive_holding_folder SET
      candidate_case_ids=(candidate_case_ids-$1::text) ||
        CASE WHEN candidate_case_ids ? $2::text THEN '[]'::jsonb ELSE jsonb_build_array($2::text) END,
      updated_at=now()
    WHERE state<>'adopted' AND candidate_case_ids ? $1::text`,
    [sourceCaseId, targetCaseId],
  );
  await q(
    `WITH desired AS (
      SELECT c.id,EXISTS(SELECT 1 FROM archive_holding_folder h WHERE h.state<>'adopted' AND
        (h.resolved_case_id=c.id OR (h.resolved_case_id IS NULL AND
          (h.candidate_case_ids ? c.id::text OR (h.candidate_case_ids='[]'::jsonb AND
            h.normalized_vrm=regexp_replace(upper(coalesce(c.vrm,'')),'[^A-Z0-9]','','g')))))) AS pending
      FROM case_ c WHERE c.id=ANY($1::uuid[])
    ) UPDATE case_ c SET archive_holding_pending=d.pending,updated_at=now()
      FROM desired d WHERE c.id=d.id AND c.archive_holding_pending IS DISTINCT FROM d.pending`,
    [[sourceCaseId, targetCaseId]],
  );
  await q(
    'UPDATE case_ SET box_folder_id=NULL,box_folder_url=NULL,updated_at=now() WHERE id=$1',
    [sourceCaseId],
  );
  return undefined;
}

app.http('mergeCases', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{tgt}/merge',
  handler: withRole('CollisionSpike.User', async (req, ctx, claims) => {
    const targetCaseId = (req.params.tgt ?? '').trim().toLowerCase();
    const body = (await req.json()) as { sourceCaseId?: unknown };
    const sourceCaseId = typeof body.sourceCaseId === 'string'
      ? body.sourceCaseId.trim().toLowerCase()
      : '';
    const actor = actorFromClaims(claims);

    if (!MERGE_UUID_RE.test(sourceCaseId) || !MERGE_UUID_RE.test(targetCaseId)) {
      return { status: 400, jsonBody: { error: 'Case identifiers are invalid.' } };
    }
    if (sourceCaseId === targetCaseId) {
      return { status: 400, jsonBody: { error: 'Cannot merge a case into itself.' } };
    }
    const runMerge = () => tx(async (q) => {
      // Merge and guarded backfill share these namespaced advisory locks. Both callers
      // acquire multiple case ids in the same lexical order before taking row locks,
      // so reverse concurrent merges cannot deadlock.
      await acquireCaseMutationLocks(q, [sourceCaseId, targetCaseId]);
      const orderedIds = orderedCaseMutationIds([sourceCaseId, targetCaseId]);
      const lockedCases = await q<{ id: string }>(
        'SELECT id FROM case_ WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
        [orderedIds],
      );
      if (lockedCases.length !== 2) {
        return { kind: 'error' as const, status: 404, error: 'Source or target case not found.' };
      }

      // Re-read the decision inputs only after both rows are locked. A competing merge
      // may have retired one side while this request waited on the advisory locks.
      const src = await loadCaseLite(sourceCaseId, q);
      const tgt = await loadCaseLite(targetCaseId, q);
      if (!src || !tgt) {
        return { kind: 'error' as const, status: 404, error: 'Source or target case not found.' };
      }
      if (isRetiredMerged(src) || isRetiredMerged(tgt)) {
        return {
          kind: 'error' as const,
          status: 409,
          error: 'One of these cases has already been merged. Refresh and try again.',
        };
      }
      // ADR-0010 INVIOLABLE rule 2: NEVER link across different work providers.
      if (src.providerCode && tgt.providerCode && src.providerCode !== tgt.providerCode) {
        return {
          kind: 'error' as const,
          status: 400,
          error: 'Refusing to merge across different work providers.',
        };
      }
      if (TWIN_TERMINAL.has(tgt.status)) {
        return {
          kind: 'error' as const,
          status: 400,
          error: 'Cannot merge into a finalised case.',
        };
      }

      // A remote Archive ensure runs outside Postgres. Never retire or retarget either
      // case while its durable generation is pending: the worker may already have
      // created the Case/PO-named folder and be between that response and the stamp.
      // Both case rows are locked, so no new generation can appear after this check.
      const providerArchiveBusy = await q<{ id: string }>(
        `SELECT id
           FROM case_
          WHERE id = ANY($1::uuid[])
            AND (
              provider_archive_completed_generation < provider_archive_requested_generation
              OR on_hold_reason = 'provider_archive_pending'
            )`,
        [[sourceCaseId, targetCaseId]],
      );
      if (providerArchiveBusy.length > 0) {
        return {
          kind: 'error' as const,
          status: 409,
          error: 'Archive folder work is still finishing for one of these cases. Try the merge again shortly.',
        };
      }

      const activeWork = await q<{ deletion_busy: boolean; archive_busy: boolean }>(
        `SELECT EXISTS (
           SELECT 1
             FROM evidence
            WHERE case_id = ANY($1::uuid[])
              AND deletion_operation_id IS NOT NULL
         ) AS deletion_busy,
         EXISTS (
           SELECT 1
             FROM evidence
            WHERE case_id = ANY($1::uuid[])
              AND archive_mirror_claim_token IS NOT NULL
              AND archive_mirror_claim_expires_at > now()
         ) AS archive_busy`,
        [[sourceCaseId, targetCaseId]],
      );
      if (activeWork[0]?.deletion_busy) {
        return {
          kind: 'error' as const,
          status: 409,
          error: 'An image is being deleted from one of these cases. Try the merge again shortly.',
        };
      }
      if (activeWork[0]?.archive_busy) {
        return {
          kind: 'error' as const,
          status: 409,
          error: 'Archive work is still finishing for one of these cases. Try the merge again shortly.',
        };
      }

      const manualIntakeConflict = await manualIntakeMergeConflict(
        q,
        sourceCaseId,
        targetCaseId,
      );
      if (manualIntakeConflict) {
        return { kind: 'error' as const, status: 409, error: manualIntakeConflict };
      }

      const captureSessionIds = await lockCaptureSessionsForMerge(q, sourceCaseId);
      const captureAssetIds = await lockCaptureAssetsForMerge(q, captureSessionIds);

      const holdingConflict = await reconcileMergeArchiveHolding(q, sourceCaseId, targetCaseId);
      if (holdingConflict) {
        return { kind: 'error' as const, status: 409, error: holdingConflict };
      }

      // Reconcile the file-request intent only after every fail-fast ownership
      // check. This helper may cancel or transfer a durable intent, so no later
      // validation may reject an otherwise uncommitted merge.
      const fileRequestConflict = await reconcileMergeFileRequestIntent(
        q,
        sourceCaseId,
        targetCaseId,
      );
      if (fileRequestConflict) {
        throw new MergeTransactionRefusal(409, fileRequestConflict);
      }

      // Lock every source inbound row before touching evidence. Guarded backfill takes
      // the same case advisory lock before its one inbound row lock, so either it commits
      // first and this UPDATE moves the new evidence, or this merge commits first and the
      // queued job follows the verified mergedInto lineage to the survivor.
      await q(
        'SELECT id FROM inbound_email WHERE case_id = $1 ORDER BY id FOR UPDATE',
        [sourceCaseId],
      );

      const { movedEvidence, collidingEvidence, evidenceReplacements, archiveBusy } =
        await mergeEvidenceRows(q, sourceCaseId, targetCaseId);
      if (archiveBusy) {
        throw new MergeTransactionRefusal(
          409,
          'Archive work is still finishing for one of these cases. Try the merge again shortly.',
        );
      }
      await transferStaffUploadOwnership(q, sourceCaseId, targetCaseId);
      await repointLockedCaptureAssetsForMerge(q, captureAssetIds, evidenceReplacements);
      await reparentLockedCaptureSessionsForMerge(
        q,
        captureSessionIds,
        sourceCaseId,
        targetCaseId,
        actor,
      );
      const movedEmails = await q<Row>(
        'UPDATE inbound_email SET case_id = $2, updated_at = now() WHERE case_id = $1 RETURNING id',
        [sourceCaseId, targetCaseId],
      );

      const claimantMerge = await mergeClaimantProvenance(
        q,
        sourceCaseId,
        targetCaseId,
        src.evaFields.claimantName.value,
        tgt.evaFields.claimantName.value,
      );

      // Provider preference (TKT-052): preserve the source's resolved provider when
      // the image-led survivor is still empty. Every associated write stays in this tx.
      const fkRows = await q<Row>(
        'SELECT id, work_provider_id FROM case_ WHERE id = ANY($1::uuid[])',
        [[sourceCaseId, targetCaseId]],
      );
      const srcFk = (fkRows.find((r) => r.id === sourceCaseId)?.work_provider_id as string | null) ?? null;
      const tgtFk = (fkRows.find((r) => r.id === targetCaseId)?.work_provider_id as string | null) ?? null;
      const providerDecision = decideMergeProvider(srcFk, tgtFk);
      let providerFilled = false;
      let providerRecoveryOutcome: 'identity_ready' | 'not_needed' | undefined;
      let providerArchiveGeneration: number | undefined;
      if (!providerDecision.crossProvider && providerDecision.filledFrom === 'source' && providerDecision.providerId) {
        await q(
          `UPDATE case_ SET work_provider_id = $2, updated_at = now()
            WHERE id = $1 AND work_provider_id IS NULL`,
          [targetCaseId, providerDecision.providerId],
        );
        const wp = await q<Row>('SELECT display_name FROM work_provider WHERE id = $1', [
          providerDecision.providerId,
        ]);
        const displayName = ((wp[0]?.display_name as string | null) ?? '').trim();
        if (displayName) {
          await q(
            `UPDATE case_ SET eva_work_provider = $2, updated_at = now()
              WHERE id = $1 AND (eva_work_provider IS NULL OR eva_work_provider = '')`,
            [targetCaseId, displayName.slice(0, 200)],
          );
        }
        // Provenance remains supplementary. A savepoint is required here: catching a
        // failed Postgres statement without rolling back to one would leave the whole
        // merge transaction aborted and make the later COMMIT fail.
        await q('SAVEPOINT merge_provider_provenance');
        try {
          await q(
            `INSERT INTO field_level_provenance
               (name, case_id, field_name, value, source_type_code, source_label)
             VALUES ($1, $2, 'workProviderId', $3, $4, $5)`,
            [
              `${targetCaseId}:workProviderId`,
              targetCaseId,
              providerDecision.providerId,
              sourceTypeCodec.toInt('corpus') ?? 100000003,
              'Carried over from the merged case',
            ],
          );
          await q('RELEASE SAVEPOINT merge_provider_provenance');
        } catch {
          await q('ROLLBACK TO SAVEPOINT merge_provider_provenance');
          await q('RELEASE SAVEPOINT merge_provider_provenance');
        }
        providerFilled = true;

        // The provider FK alone is not recovery. While both case rows remain locked,
        // atomically adopt/mint Case/PO and advance only the intake-owned provider hold
        // to provider_archive_pending. The remote folder is a separate durable phase.
        const recovery = await completeProviderRecoveryUsing(q, {
          caseId: targetCaseId,
          resolvedProviderId: providerDecision.providerId,
          allowCasePoMint: true,
        });
        if (recovery.outcome === 'blocked') {
          // Throw so the transaction (including evidence/provider carry-over) rolls
          // back. A normal error return here would commit the partial merge.
          throw new MergeProviderRecoveryBlocked(recovery.blockedReason ?? 'provider recovery blocked');
        }
        providerRecoveryOutcome = recovery.outcome;
        if (recovery.outcome === 'identity_ready') {
          providerArchiveGeneration = await requestProviderArchive(q, targetCaseId);
        }
      }

      // Any Archive continuation owned by the source is obsolete once that row is
      // retired. When recovery moved to the survivor above, its fresh generation was
      // already requested in this same transaction.
      await cancelProviderArchive(q, sourceCaseId);

      await q(
        `UPDATE case_
           SET status_code = $2, duplicate_keys = $3, on_hold = false,
               on_hold_reason = NULL, updated_at = now()
         WHERE id = $1`,
        [sourceCaseId, statusToInt('linked_to_instruction'), JSON.stringify({ mergedInto: targetCaseId })],
      );

      // The merge is the primary mutation. Make readiness recomputation durable in
      // the same transaction so an interrupted post-commit fast path cannot strand
      // the survivor on its pre-merge status.
      const statusGeneration = await requestStatusRecompute(q, targetCaseId);

      await writeAudit({
        action: AUDIT_ACTION.case_attached,
        caseId: targetCaseId,
        summary:
          `Merged ${sourceCaseId} into ${targetCaseId} (${movedEvidence} evidence, ${movedEmails.length} emails` +
          `${providerFilled ? ', provider carried over from the merged case' : ''}` +
          `${providerRecoveryOutcome === 'identity_ready' ? ', Archive folder queued' : ''}` +
          `${claimantMerge.filled ? ', claimant carried over from the merged case' : ''}` +
          `${claimantMerge.conflict ? ', claimant difference kept for review' : ''})`,
        after: {
          sourceCaseId,
          targetCaseId,
          movedEvidence,
          collidingEvidence,
          movedEmails: movedEmails.length,
          providerFilled,
          providerRecoveryOutcome,
          providerArchiveGeneration,
          claimantFilled: claimantMerge.filled,
          claimantConflict: claimantMerge.conflict,
          captureSessionsRetargeted: captureSessionIds.length,
        },
        ...(actor ? { actor } : {}),
      }, q);

      return {
        kind: 'merged' as const,
        movedEvidence,
        collidingEvidence,
        movedEmails: movedEmails.length,
        providerFilled,
        providerRecoveryOutcome,
        providerArchiveGeneration,
        claimantFilled: claimantMerge.filled,
        claimantConflict: claimantMerge.conflict,
        statusGeneration,
      };
    }).catch((error: unknown) => {
      if (error instanceof MergeTransactionRefusal) {
        return { kind: 'error' as const, status: error.status, error: error.message };
      }
      throw error;
    });

    let merged: Awaited<ReturnType<typeof runMerge>>;
    try {
      merged = await runMerge();
    } catch (e) {
      if (e instanceof MergeProviderRecoveryBlocked) {
        return {
          status: 409,
          jsonBody: { error: 'Provider recovery needs review before these cases can be merged.' },
        };
      }
      throw e;
    }

    if (merged.kind === 'error') {
      return { status: merged.status, jsonBody: { error: merged.error } };
    }

    // Fast path only. The generation requested in the merge transaction stays
    // pending unless both evaluation and its monotonic acknowledgement succeed;
    // failure here must not misreport or retry the committed primary mutation.
    try {
      const evaluated = await recomputeStatus(targetCaseId, actor);
      if (!evaluated) throw new Error('target case was not available for readiness evaluation');
      await acknowledgeStatusRecompute(query, targetCaseId, merged.statusGeneration);
    } catch (e) {
      ctx.warn(
        `[merge] readiness recompute remains pending for ${targetCaseId} ` +
          `(generation ${merged.statusGeneration}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const result: MergeCasesResult = { targetCaseId, movedEvidence: merged.movedEvidence };
    return { status: 200, jsonBody: result };
  }),
});

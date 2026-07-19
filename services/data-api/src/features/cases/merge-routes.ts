/** merge-routes — cohesive Data API module. */

import { app } from '@azure/functions';
import { decideMergeProvider, isRetiredMerged, type MergeCasesResult } from '@cs/domain';
import { sourceTypeCodec, statusToInt } from '@cs/domain/codecs';
import { withRole } from '../../platform/auth/staff-auth.js';
import { query, tx } from '../../platform/db/client.js';
import { acquireCaseMutationLocks, orderedCaseMutationIds } from './mutation-locks.js';
import { acknowledgeStatusRecompute, requestStatusRecompute } from './status-recompute.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit } from '../../shared/audit.js';
import { completeProviderRecoveryUsing } from '../providers/recovery.js';
import { cancelProviderArchive, requestProviderArchive } from '../providers/archive-outbox.js';
import { CASE_SELECT, TWIN_TERMINAL, rowToCase, type Row } from '../../shared/mapping/index.js';
import { loadCaseLite, mergeClaimantProvenance, recomputeStatus } from './case-support.js';
import { mergeEvidenceRows } from './merge-evidence.js';
import {
  lockCaptureAssetsForMerge,
  lockCaptureSessionsForMerge,
  repointLockedCaptureAssetsForMerge,
  reparentLockedCaptureSessionsForMerge,
} from './merge-capture.js';
import { reconcileMergeArchiveHolding } from './merge-archive-holding.js';
import { reconcileMergeFileRequestIntent } from './merge-file-request.js';
import { manualIntakeMergeConflict, transferStaffUploadOwnership } from './merge-intake-ownership.js';

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

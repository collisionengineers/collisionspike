/** suggestion-review-routes — cohesive Data API module. */

import { app } from '@azure/functions';
import { type AiSuggestion, type AiSuggestionReviewResult, type ImageRole, type InboundCategory, type InboundSubtype } from '@cs/domain';
import { imageRoleCodec } from '@cs/domain/codecs';
import { withRole } from '../../platform/auth/staff-auth.js';
import { query, tx, type TxQuery } from '../../platform/db/client.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit } from '../../shared/audit.js';
import { inboundCategoryFromInt, inboundSubtypeFromInt, isAiReviewState, rowToAiSuggestion, INBOUND_CATEGORY_TO_INT, INBOUND_SUBTYPE_TO_INT, type Row } from '../../shared/mapping/index.js';
import { writeImprovementSignal } from '../inbound/improvement-signals.js';
import { markOutstandingChasersResponded } from '../inbound/internal/service-support.js';
import { writeEvidenceBackfillNote } from '../evidence/backfill-note.js';
import { requestStatusRecompute } from '../cases/status-recompute.js';
import { requestArchiveMirrorIfEligible } from '../archive/mirror-outbox.js';
import { lockCaseForMutation } from '../cases/mutation-locks.js';
import { drainEvidenceBackfillRequests, IMAGE_KIND } from './evidence-backfill.js';
import { coerceJsonValue } from '../../shared/json.js';

app.http('caseAiSuggestions', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cases/{id}/ai-suggestions',
  handler: withRole('CollisionSpike.User', async (req) => {
    try {
      const caseId = req.params.id;
      const rows = await query<Row>(
        `SELECT * FROM ai_suggestion
          WHERE case_id = $1
          ORDER BY (review_state = 'pending') DESC, created_at DESC
          LIMIT 100`,
        [caseId],
      );
      const result: AiSuggestion[] = rows.map(rowToAiSuggestion);
      return { status: 200, jsonBody: result };
    } catch {
      return { status: 200, jsonBody: [] }; // honest-empty on any read failure
    }
  }),
});

app.http('reviewAiSuggestion', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'ai-suggestions/{id}/review',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const id = req.params.id;
    const body = (await req.json().catch(() => ({}))) as { decision?: unknown };
    const decision = body.decision;
    // Only 'accepted' | 'rejected' are valid review decisions (not the lifecycle-only
    // 'pending'/'superseded'); reject anything else with a 400.
    if (!isAiReviewState(decision) || (decision !== 'accepted' && decision !== 'rejected')) {
      return { status: 400, jsonBody: { error: "decision must be 'accepted' or 'rejected'" } };
    }

    // Load the row first: clean 404 for an unknown id + the before-state for the audit.
    // inbound_email_id is read too (rules-engine-v2 Phase 2) — the 'case_link'/'cancellation'
    // promotion branches in promoteAcceptedSuggestion need it; every other suggestion_type
    // simply ignores the extra column.
    const existing = await query<Row>(
      `SELECT id, case_id, evidence_id, inbound_email_id, suggestion_type, suggested_value, review_state
         FROM ai_suggestion WHERE id = $1`,
      [id],
    );
    if (!existing[0]) return { status: 404, jsonBody: { error: 'not found' } };
    const row = existing[0];
    const actor = actorFromClaims(claims);

    // Idempotent: if it was already reviewed, return the current state WITHOUT re-promoting
    // (a second accept must never re-fill a field a human has since changed).
    if (row.review_state !== 'pending') {
      if (row.suggestion_type === 'case_link' && typeof row.inbound_email_id === 'string') {
        // A retry of the already-accepted review is also an on-demand drain. This is
        // useful after a publish crash and remains idempotent by generation.
        await drainEvidenceBackfillRequests(row.inbound_email_id, 1);
      }
      const result: AiSuggestionReviewResult = {
        id,
        reviewState: row.review_state,
        promoted: false,
      };
      return { status: 200, jsonBody: result };
    }

    // Readiness-affecting photo decisions are atomic: pending->accepted, evidence
    // promotion/ownership, and durable status work either all commit or all roll back.
    // A transient evidence write can therefore be retried; it can never leave a permanently
    // accepted suggestion whose promotion did not happen.
    if (
      decision === 'accepted' &&
      (row.suggestion_type === 'image_role' || row.suggestion_type === 'registration')
    ) {
      const atomic = await tx(async (q) => {
        const locked = await q<Row>(
          `SELECT id, case_id, evidence_id, inbound_email_id, suggestion_type,
                  suggested_value, review_state
             FROM ai_suggestion WHERE id = $1
            FOR UPDATE`,
          [id],
        );
        const current = locked[0];
        if (!current) return { kind: 'missing' as const };
        if (current.review_state !== 'pending') {
          return { kind: 'reviewed' as const, row: current };
        }
        const evidenceId = typeof current.evidence_id === 'string' ? current.evidence_id : '';
        const owner = evidenceId
          ? await q<{ case_id: string }>('SELECT case_id FROM evidence WHERE id = $1', [evidenceId])
          : [];
        if (!owner[0]) return { kind: 'conflict' as const, row: current };
        const caseLock = await lockCaseForMutation(q, owner[0].case_id);
        if (caseLock.kind !== 'active') return { kind: 'conflict' as const, row: current };
        const evidenceLock = await q<{ id: string }>(
          'SELECT id FROM evidence WHERE id = $1 AND case_id = $2 FOR UPDATE',
          [evidenceId, caseLock.caseId],
        );
        if (!evidenceLock[0]) return { kind: 'conflict' as const, row: current };

        const promotion = await promoteAcceptedSuggestion(current, actor, q, caseLock.caseId);
        if (!promotion.promoted) {
          // The target was replaced or is now owned outside the classifier.
          // Keep the suggestion pending and tell the reviewer their accept did not apply.
          return { kind: 'conflict' as const, row: current };
        }
        const reviewed = await q<Row>(
          `UPDATE ai_suggestion
              SET review_state = 'accepted', reviewed_by = $2, reviewed_at = now()
            WHERE id = $1 AND review_state = 'pending'
          RETURNING id, review_state`,
          [id, actor ?? null],
        );
        if (!reviewed[0]) throw new Error('suggestion review race after row lock');
        return { kind: 'accepted' as const, row: current, promotion };
      });

      if (atomic.kind === 'missing') return { status: 404, jsonBody: { error: 'not found' } };
      if (atomic.kind === 'conflict') {
        return {
          status: 409,
          jsonBody: { error: 'suggestion target changed; refresh and review again' },
        };
      }
      if (atomic.kind === 'reviewed') {
        const result: AiSuggestionReviewResult = {
          id,
          reviewState: atomic.row.review_state,
          promoted: false,
        };
        return { status: 200, jsonBody: result };
      }

      await writeAudit({
        action: AUDIT_ACTION.ai_suggestion_accepted,
        ...(atomic.row.case_id ? { caseId: atomic.row.case_id as string } : {}),
        summary: `AI suggestion ${atomic.row.suggestion_type} accepted${
          atomic.promotion.promoted ? ` (promoted -> ${atomic.promotion.promotedField})` : ''
        }`,
        before: { reviewState: 'pending' },
        after: {
          reviewState: 'accepted',
          suggestionId: id,
          suggestionType: atomic.row.suggestion_type,
          ...(atomic.promotion.promoted
            ? { promotedField: atomic.promotion.promotedField }
            : {}),
        },
        ...(actor ? { actor } : {}),
      });

      const result: AiSuggestionReviewResult = {
        id,
        reviewState: 'accepted',
        promoted: atomic.promotion.promoted,
        ...(atomic.promotion.promotedField
          ? { promotedField: atomic.promotion.promotedField }
          : {}),
      };
      return { status: 200, jsonBody: result };
    }

    if (decision === 'accepted' && row.suggestion_type === 'case_link') {
      const atomic = await tx(async (q) => {
        const locked = await q<Row>(
          `SELECT id, case_id, evidence_id, inbound_email_id, suggestion_type,
                  suggested_value, review_state
             FROM ai_suggestion WHERE id = $1
            FOR UPDATE`,
          [id],
        );
        const current = locked[0];
        if (!current) return { kind: 'missing' as const };
        if (current.review_state !== 'pending') {
          return { kind: 'reviewed' as const, row: current };
        }
        const inboundEmailId = typeof current.inbound_email_id === 'string'
          ? current.inbound_email_id
          : '';
        const value = coerceJsonValue(current.suggested_value);
        const requestedTarget = (value as { targetCaseId?: string } | null)?.targetCaseId?.trim();
        let promoted = false;
        if (inboundEmailId && requestedTarget) {
          const caseLock = await lockCaseForMutation(q, requestedTarget);
          if (caseLock.kind !== 'active') return { kind: 'conflict' as const };
          const linked = await q<Row>(
            `UPDATE inbound_email
                SET case_id = $2,
                    triage_state = 'routed',
                    evidence_backfill_requested_generation = CASE
                      WHEN has_attachments = true
                       AND NULLIF(btrim(source_mailbox), '') IS NOT NULL
                       AND NULLIF(btrim(source_message_id), '') IS NOT NULL
                        THEN evidence_backfill_requested_generation + 1
                      ELSE evidence_backfill_requested_generation
                    END,
                    evidence_backfill_requested_at = CASE
                      WHEN has_attachments = true
                       AND NULLIF(btrim(source_mailbox), '') IS NOT NULL
                       AND NULLIF(btrim(source_message_id), '') IS NOT NULL
                        THEN now()
                      ELSE evidence_backfill_requested_at
                    END,
                    updated_at = now()
              WHERE id = $1 AND case_id IS NULL
            RETURNING id, has_attachments, source_mailbox, source_message_id, subject,
                      evidence_backfill_requested_generation`,
            [inboundEmailId, caseLock.caseId],
          );
          if (linked[0]) {
            promoted = true;
            const hasAttachments = linked[0].has_attachments === true;
            const hasProvenance =
              typeof linked[0].source_mailbox === 'string' && linked[0].source_mailbox.trim() !== '' &&
              typeof linked[0].source_message_id === 'string' && linked[0].source_message_id.trim() !== '';
            if (hasAttachments && !hasProvenance) {
              await writeEvidenceBackfillNote({
                caseId: caseLock.caseId,
                inboundEmailId,
                author: actor ?? 'System',
                kind: 'failed',
              }, q);
            }
            await writeAudit({
              action: AUDIT_ACTION.inbound_linked,
              caseId: caseLock.caseId,
              summary: 'Inbound email linked to case (suggestion accepted)',
              before: { caseId: null },
              after: { caseId: caseLock.caseId, inboundEmailId },
              ...(actor ? { actor } : {}),
            }, q);
          }
        }
        const reviewed = await q<Row>(
          `UPDATE ai_suggestion
              SET review_state = 'accepted', reviewed_by = $2, reviewed_at = now()
            WHERE id = $1 AND review_state = 'pending'
          RETURNING id, review_state`,
          [id, actor ?? null],
        );
        if (!reviewed[0]) throw new Error('suggestion review race after row lock');
        return {
          kind: 'accepted' as const,
          row: current,
          inboundEmailId,
          requestedTarget,
          promoted,
        };
      });

      if (atomic.kind === 'missing') return { status: 404, jsonBody: { error: 'not found' } };
      if (atomic.kind === 'conflict') {
        return { status: 409, jsonBody: { error: 'suggestion target changed; refresh and review again' } };
      }
      if (atomic.kind === 'reviewed') {
        if (typeof atomic.row.inbound_email_id === 'string') {
          await drainEvidenceBackfillRequests(atomic.row.inbound_email_id, 1);
        }
        return {
          status: 200,
          jsonBody: { id, reviewState: atomic.row.review_state, promoted: false },
        };
      }

      if (atomic.promoted && atomic.requestedTarget) {
        await markOutstandingChasersResponded(atomic.requestedTarget, 'suggestion accepted');
      }
      if (atomic.inboundEmailId) {
        await drainEvidenceBackfillRequests(atomic.inboundEmailId, 1);
      }
      await writeAudit({
        action: AUDIT_ACTION.ai_suggestion_accepted,
        summary: `AI suggestion ${row.suggestion_type} accepted${
          atomic.promoted ? ' (promoted -> inbound_email.case_id)' : ''
        }`,
        before: { reviewState: 'pending' },
        after: {
          reviewState: 'accepted',
          suggestionId: id,
          suggestionType: row.suggestion_type,
          ...(atomic.promoted ? { promotedField: 'inbound_email.case_id' } : {}),
        },
        ...(actor ? { actor } : {}),
      });
      return {
        status: 200,
        jsonBody: {
          id,
          reviewState: 'accepted',
          promoted: atomic.promoted,
          ...(atomic.promoted ? { promotedField: 'inbound_email.case_id' } : {}),
        },
      };
    }

    // Write the decision — guarded on review_state='pending' so concurrent reviews don't race.
    const updated = await query<Row>(
      `UPDATE ai_suggestion
          SET review_state = $2, reviewed_by = $3, reviewed_at = now()
        WHERE id = $1 AND review_state = 'pending'
      RETURNING id, review_state`,
      [id, decision, actor ?? null],
    );
    if (!updated[0]) {
      // Lost the race (someone else just reviewed it) — re-read + return idempotently.
      const cur = await query<Row>('SELECT review_state FROM ai_suggestion WHERE id = $1', [id]);
      return {
        status: 200,
        jsonBody: { id, reviewState: cur[0]?.review_state ?? 'pending', promoted: false },
      };
    }

    // On ACCEPT, optionally promote the value into its target field FILL-IF-EMPTY.
    let promotion: { promoted: boolean; promotedField?: string } = { promoted: false };
    if (decision === 'accepted') {
      promotion = await promoteAcceptedSuggestion(row, actor);
    }

    await writeAudit({
      action:
        decision === 'accepted'
          ? AUDIT_ACTION.ai_suggestion_accepted
          : AUDIT_ACTION.ai_suggestion_rejected,
      ...(row.case_id ? { caseId: row.case_id as string } : {}),
      summary: `AI suggestion ${row.suggestion_type} ${decision}${
        promotion.promoted ? ` (promoted -> ${promotion.promotedField})` : ''
      }`,
      before: { reviewState: 'pending' },
      after: {
        reviewState: decision,
        suggestionId: id,
        suggestionType: row.suggestion_type,
        ...(promotion.promoted ? { promotedField: promotion.promotedField } : {}),
      },
      ...(actor ? { actor } : {}),
    });

    const result: AiSuggestionReviewResult = {
      id,
      reviewState: decision,
      promoted: promotion.promoted,
      ...(promotion.promotedField ? { promotedField: promotion.promotedField } : {}),
    };
    return { status: 200, jsonBody: result };
  }),
});

async function promoteAcceptedSuggestion(
  row: Row,
  actor?: string,
  q: TxQuery = query,
  lockedEvidenceCaseId?: string,
): Promise<{ promoted: boolean; promotedField?: string }> {
  const evidenceId = row.evidence_id as string | null;
  const inboundEmailId = row.inbound_email_id as string | null;
  const value = coerceJsonValue(row.suggested_value);
  try {
    if (row.suggestion_type === 'image_role' && evidenceId) {
      const role = (value as { role?: string } | null)?.role;
      const code = role ? imageRoleCodec.toInt(role as ImageRole) : undefined;
      if (code != null && role !== 'unknown') {
        // Source-aware CAS: a human acceptance may replace an autonomous/unowned
        // decision even when the classifier raced ahead or produced the same value.
        // Decisions owned outside the classifier remain immutable from this seam.
        const upd = await q<Row>(
          `UPDATE evidence
              SET image_role_code = $2,
                  image_role_source = 'staff',
                  accepted_for_eva = true,
                  accepted_for_eva_source = 'staff',
                  excluded = CASE
                    WHEN (exclusion_decision_source IS NULL OR exclusion_decision_source = 'classifier')
                         AND NOT person_reflection
                      THEN false
                    ELSE excluded
                  END,
                  exclusion_reason = CASE
                    WHEN (exclusion_decision_source IS NULL OR exclusion_decision_source = 'classifier')
                         AND NOT person_reflection
                      THEN NULL
                    ELSE exclusion_reason
                  END,
                  exclusion_decision_source = CASE
                    WHEN (exclusion_decision_source IS NULL OR exclusion_decision_source = 'classifier')
                         AND NOT person_reflection
                      THEN 'staff'
                    ELSE exclusion_decision_source
                  END,
                  updated_at = now()
            WHERE id = $1
              AND kind_code = $3
              AND case_id = $4
              AND (image_role_source IS NULL OR image_role_source = 'classifier')
              AND (accepted_for_eva_source IS NULL OR accepted_for_eva_source = 'classifier')
              AND (
                NOT excluded
                OR exclusion_decision_source IS NULL
                OR exclusion_decision_source = 'classifier'
              )
          RETURNING id, case_id, excluded, storage_path, box_file_id`,
          [evidenceId, code, IMAGE_KIND, lockedEvidenceCaseId],
        );
        if (upd[0]) {
          // Accepting an image-role suggestion can recover a classifier exclusion
          // after intake's one-shot archive pass. Schedule the mirror in this same
          // transaction; the helper no-ops for byte-less/already-archived/still-
          // excluded rows and generation-upserts safely if it was already included.
          await requestArchiveMirrorIfEligible(q, upd[0]);
          await requestStatusRecompute(q, String(upd[0].case_id));
          return { promoted: true, promotedField: 'evidence.image_role_code' };
        }
      }
    } else if (row.suggestion_type === 'registration' && evidenceId) {
      const visible = (value as { visible?: boolean } | null)?.visible;
      if (typeof visible === 'boolean') {
        // Source-aware CAS: replace NULL or classifier-owned values (including a
        // same-value race) and convert ownership to staff in this transaction.
        const upd = await q<Row>(
          `UPDATE evidence
              SET registration_visible = $2,
                  registration_visible_source = 'staff',
                  updated_at = now()
            WHERE id = $1
              AND kind_code = $3
              AND case_id = $4
              AND (
                registration_visible_source IS NULL
                OR registration_visible_source = 'classifier'
              )
          RETURNING id, case_id`,
          [evidenceId, visible, IMAGE_KIND, lockedEvidenceCaseId],
        );
        if (upd[0]) {
          await requestStatusRecompute(q, String(upd[0].case_id));
          return { promoted: true, promotedField: 'evidence.registration_visible' };
        }
      }
    } else if (row.suggestion_type === 'case_link' && inboundEmailId) {
      // rules-engine-v2 Phase 2 (ADR-0019 suggest-first ladder): accept is the ONLY moment a
      // case_link suggestion actually attaches an inbound email to a case — the suggest-link
      // write itself (POST /api/internal/triage/suggest-link) never mutates inbound_email.
      // FILL-IF-EMPTY ONLY: never overwrite a link a person (or another path) already made.
      const targetCaseId = (value as { targetCaseId?: string } | null)?.targetCaseId?.trim();
      if (targetCaseId) {
        // Also stamp triage_state='routed' — the SAME thing the auto-link reply lane does
        // (internalInboundLinkReply, #753) so a now-linked email stops counting as untriaged in
        // /api/inbound/counts. Accepting the suggestion IS a routing decision; without this the
        // row shows 'Linked to case' yet keeps inflating the 'needs sorting' badge.
        const upd = await query<Row>(
          `UPDATE inbound_email
              SET case_id = $2,
                  triage_state = 'routed',
                  evidence_backfill_requested_generation = CASE
                    WHEN has_attachments = true
                     AND NULLIF(btrim(source_mailbox), '') IS NOT NULL
                     AND NULLIF(btrim(source_message_id), '') IS NOT NULL
                      THEN evidence_backfill_requested_generation + 1
                    ELSE evidence_backfill_requested_generation
                  END,
                  evidence_backfill_requested_at = CASE
                    WHEN has_attachments = true
                     AND NULLIF(btrim(source_mailbox), '') IS NOT NULL
                     AND NULLIF(btrim(source_message_id), '') IS NOT NULL
                      THEN now()
                    ELSE evidence_backfill_requested_at
                  END,
                  updated_at = now()
             WHERE id = $1 AND case_id IS NULL
           RETURNING id, has_attachments, source_mailbox, source_message_id, subject,
                     evidence_backfill_requested_generation`,
          [inboundEmailId, targetCaseId],
        );
        if (upd[0]) {
          // Dedicated audit (distinct from the generic ai_suggestion_accepted the caller
          // already writes) — this is the one that shows the attach on the CASE's own
          // activity feed (ai_suggestion.case_id is deliberately left unset for triage
          // suggestions, so the caller's generic audit above is not case-scoped).
          await writeAudit({
            action: AUDIT_ACTION.inbound_linked,
            caseId: targetCaseId,
            summary: 'Inbound email linked to case (suggestion accepted)',
            before: { caseId: null },
            after: { caseId: targetCaseId, inboundEmailId },
            ...(actor ? { actor } : {}),
          });
          // TKT-023 — the arrival satisfies any outstanding chaser on the case
          // (drafted/sent/overdue → responded), same as every other attach seam.
          // Best-effort inside markOutstandingChasersResponded itself: a chaser
          // bookkeeping failure never unwinds the attach.
          await markOutstandingChasersResponded(targetCaseId, 'suggestion accepted');
          // TKT-145 (PR52-F4): a suggest-first link (images-received PDF-VRM / ref-gate
          // rung) attaches the EMAIL but NOT its attachments — the intake persist chain
          // (classifyPersist + extractImages) only ran on the minting/auto-attach lanes.
          // ENQUEUE the evidence backfill STRICTLY AFTER the link commit (the UPDATE above
          // returned, and each query() is its own auto-commit statement): the orchestration
          // consumer re-fetches the message from Graph and drives the existing persist
          // chain + status recompute onto the target case. The interim "attach by hand"
          // note is INVERTED — written only when the backfill cannot even be queued here
          // (the consumer writes it on terminal failure via the report-back route). BEST
          // EFFORT throughout: a backfill/enqueue/note failure never unwinds the accept.
          if (upd[0].has_attachments === true) {
            try {
              const sourceMailbox =
                typeof upd[0].source_mailbox === 'string' ? upd[0].source_mailbox.trim() : '';
              const sourceMessageId =
                typeof upd[0].source_message_id === 'string' ? upd[0].source_message_id.trim() : '';
              let backfillQueued = false;
              if (sourceMailbox && sourceMessageId) {
                try {
                  const drained = await drainEvidenceBackfillRequests(inboundEmailId, 1);
                  backfillQueued = drained.published === 1;
                } catch (e) {
                  console.error(
                    `[ai-suggestions] evidence-backfill enqueue failed for inbound ${inboundEmailId} -> case ${targetCaseId} (degrading to the manual note): ${
                      e instanceof Error ? e.message : String(e)
                    }`,
                  );
                }
              }
              if (!backfillQueued) {
                // No mailbox provenance to re-fetch from, or the enqueue itself failed —
                // fall back to the durable, handler-safe note so the photos/PDF are added
                // BY HAND instead of being silently dropped from evidence/EVA-readiness.
                await writeEvidenceBackfillNote({
                  caseId: targetCaseId,
                  inboundEmailId,
                  author: actor ?? 'System',
                  kind: 'failed',
                });
              }
            } catch {
              /* best-effort — a backfill/note failure must never unwind the link */
            }
          }
          return { promoted: true, promotedField: 'inbound_email.case_id' };
        }
      }
    } else if (row.suggestion_type === 'cancellation') {
      // NEVER mutates case_.status_code on accept. Cancellation is ALWAYS a
      // staff-confirmed close/hold a person applies manually — rules-engine-v2 Phase 2:
      // "Cancellation action: matched case -> propose close/hold with note + audit
      // (staff-confirmed, never automatic)"; ADR-0019 §4's no-silent-mutation rule ("never
      // auto-attach, NEVER auto-cancel"). Accepting this suggestion only records that a
      // person has seen and agreed with the report — the outer reviewAiSuggestion call
      // already writes the generic ai_suggestion_accepted audit for that ("writeAudit
      // only"); no dedicated mutation or extra audit action is minted for this transition
      // (there is no "cancellation confirmed" audit code — only cancellation_proposed,
      // 100000038, which suggest-link already used once at PROPOSE time; re-using it again
      // here on ACCEPT would misrepresent this as a fresh proposal). promoted stays false.
    } else if (row.suggestion_type === 'triage_category' && inboundEmailId) {
      // rules-engine-v2 Phase 4 (ADR-0019 Stage C): accept applies the model's category/
      // subtype via the SAME name<->code mapping reclassifyInbound (inbound.ts) uses
      // (INBOUND_CATEGORY_TO_INT / INBOUND_SUBTYPE_TO_INT) — the same way a staff override
      // does. "FILL-IF-EMPTY" here means "never overwrite a HUMAN decision"
      // (classifier_mode <> 'human'), NOT "only when NULL": category_code/subtype_code are
      // NEVER null once classifyInbound has run (even an abstain still sets 'other'), so a
      // literal NULL guard would make this promotion permanently unreachable. Mirrors
      // upsertInboundEmail's own COALESCE-unless-human guard (internal.ts) — a deterministic
      // OR a previously-accepted LLM label may be upgraded; a staff reclassify never is.
      const proposed = (value as { category?: string; subtype?: string } | null) ?? {};
      const category = typeof proposed.category === 'string' ? proposed.category : undefined;
      const subtype = typeof proposed.subtype === 'string' ? proposed.subtype : undefined;
      const categoryCode = category ? INBOUND_CATEGORY_TO_INT[category as InboundCategory] : undefined;
      const subtypeCode = subtype ? INBOUND_SUBTYPE_TO_INT[subtype as InboundSubtype] : undefined;
      if (category && subtype && categoryCode != null && subtypeCode != null) {
        const cur = await query<Row>(
          `SELECT id, category_code, subtype_code, suggested_category_code, suggested_subtype_code,
                  case_id, source_message_id, work_provider_id, classifier_mode
             FROM inbound_email WHERE id = $1`,
          [inboundEmailId],
        );
        const curRow = cur[0];
        if (curRow) {
          const upd = await query<Row>(
            `UPDATE inbound_email
                SET category_code = $2, subtype_code = $3, classifier_mode = 'llm', updated_at = now()
              WHERE id = $1 AND classifier_mode IS DISTINCT FROM 'human'
            RETURNING id`,
            [inboundEmailId, categoryCode, subtypeCode],
          );
          if (upd[0]) {
            // Override capture — SAME shape as reclassifyInbound's own (compare the
            // ACCEPTED value to the classifier's suggestion, by NAME, and write an
            // improvement_signal on a genuine change). Reused, not duplicated (inbound.ts).
            const suggestedCatName = inboundCategoryFromInt(
              (curRow.suggested_category_code ?? curRow.category_code) as number | null | undefined,
            );
            const suggestedSubName = inboundSubtypeFromInt(
              (curRow.suggested_subtype_code ?? curRow.subtype_code) as number | null | undefined,
            );
            if (category !== suggestedCatName) {
              await writeImprovementSignal(
                curRow,
                'category',
                suggestedCatName ?? '(none)',
                category,
                actor,
                'AI suggestion accepted',
              );
            }
            if (subtype !== suggestedSubName) {
              await writeImprovementSignal(
                curRow,
                'subtype',
                suggestedSubName ?? '(none)',
                subtype,
                actor,
                'AI suggestion accepted',
              );
            }
            await writeAudit({
              action: AUDIT_ACTION.inbound_reclassified,
              ...(curRow.case_id ? { caseId: curRow.case_id as string } : {}),
              summary: `Inbound reclassified by an accepted AI suggestion (category=${category} subtype=${subtype})`,
              before: { category: suggestedCatName ?? null, subtype: suggestedSubName ?? null },
              after: {
                category,
                subtype,
                inboundEmailId,
                sourceMessageId: curRow.source_message_id ?? null,
              },
              ...(actor ? { actor } : {}),
            });
            return { promoted: true, promotedField: 'inbound_email.category_code/subtype_code' };
          }
        }
      }
      // else: unknown category/subtype name (should be unreachable — internalTriageSuggestLink
      // already validated them at write time), the row vanished, or classifier_mode is
      // already 'human' — never overwrite a human decision. promoted stays false either way.
    }
  } catch (e) {
    if (
      q !== query &&
      (row.suggestion_type === 'image_role' || row.suggestion_type === 'registration')
    ) {
      throw e;
    }
    /* non-readiness promotion is supplementary — the acceptance already stands */
  }
  return { promoted: false };
}

/**
 * api/src/functions/ai-suggestions.ts — AI suggestion layer HTTP routes (TKT-015).
 *
 * The Data API side of the observation-first, GATED AI assistant. Three routes:
 *   GET  /api/cases/{id}/ai-suggestions            list pending + recently-reviewed (honest [])
 *   POST /api/ai-suggestions/{id}/review           {decision:'accepted'|'rejected'} — audited;
 *                                                  on accept, promote into the target FILL-IF-EMPTY
 *   POST /api/cases/{id}/ai-suggestions/generate   honest NO-OP when AI_ASSIST_ENABLED is off OR no
 *                                                  model is configured; else PII-scrub + call model
 *
 * SAFETY (TKT-015 acceptance): AI output lands as a SUGGESTION (with model version +
 * confidence), never as a silent mutation. Promotion into evidence/case fields happens
 * ONLY on a human accept, and only FILL-IF-EMPTY (an accept never clobbers a value a
 * person already set). The generate path PII-scrubs every input BEFORE any external model
 * call (reusing @cs/domain scrubPii — the ROADMAP "[BUILD] PII pre-scrub helper").
 *
 * LIVE STATE (2026-07-08): the Foundry account digital-3339-resource HAS a gpt-5 deployment, the API
 * managed identity holds Cognitive Services OpenAI User on it (keyless, granted 2026-07-05), and
 * AI_MODEL_ENDPOINT/AI_MODEL_DEPLOYMENT ARE set on the live apps (live values in the registry).
 * `callModelForSuggestions` is WIRED to a real keyless AOAI structured-output call
 * (lib/aoai-suggestions.ts) and AI_ASSIST_ENABLED was flipped TRUE at the 2026-07-08 go-live
 * (DPIA + residency sign-off recorded) — the generate route is LIVE-ACTING. TKT-127 hardened the
 * generate contract: every zero-generated outcome carries an explicit reason
 * ('disabled' | 'no_input' | 'empty' | 'error') and is logged, so the SPA can explain an empty
 * result and telemetry can explain a failure (the prior catch was silent). TKT-132 WIDENED the
 * generate inputs beyond circumstances + claimant address (empty on most intake cases) to the
 * labelled sections lib/generate-inputs.ts assembles — instruction email text, case overview
 * facts, vehicle data, photo-analysis stamps — scrubbed + size-capped; 'no_input' now honestly
 * means NONE of the widened inputs is present.
 */

import { app } from '@azure/functions';
import {
  type AiSuggestion,
  type AiSuggestionReviewResult,
  type GenerateAiSuggestionsResult,
  type ImageRole,
  type InboundCategory,
  type InboundSubtype,
} from '@cs/domain';
import { evidenceKindCodec, imageRoleCodec } from '@cs/domain/codecs';
import { withRole } from '../lib/auth.js';
import { gates } from '../lib/gates.js';
import { query } from '../lib/db.js';
import { callSuggestionModel, type DraftSuggestion } from '../lib/aoai-suggestions.js';
import { buildGenerateInputs } from '../lib/generate-inputs.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit } from '../lib/audit.js';
import {
  inboundCategoryFromInt,
  inboundSubtypeFromInt,
  isAiReviewState,
  rowToAiSuggestion,
  INBOUND_CATEGORY_TO_INT,
  INBOUND_SUBTYPE_TO_INT,
  type Row,
} from '../lib/mappers.js';
// rules-engine-v2 Phase 4 (ADR-0019 Stage C) — reused, not duplicated: writeImprovementSignal
// is the SAME feedback-provenance writer a staff reclassify uses (inbound.ts).
import { writeImprovementSignal } from './inbound.js';
// TKT-023 — reused, not duplicated: the SAME chaser-satisfaction hook every other attach
// seam calls (auto-link reply, dedup attach, auto-attach — internal.ts). Accepting a
// case_link suggestion IS an attach, so it must satisfy the case's outstanding chasers too.
import { markOutstandingChasersResponded } from './internal.js';
// TKT-145 — on a case_link accept of an attachment-bearing, previously-uncased email,
// enqueue the orchestration evidence backfill (re-fetch from Graph + persist + status
// recompute). The manual "attach by hand" note survives only as the enqueue-failure /
// terminal-failure fallback.
import { enqueueEvidenceBackfill } from '../lib/evidence-backfill-queue.js';
import { writeEvidenceBackfillNote } from '../lib/evidence-backfill-note.js';

/** image_role 'unknown' code — the FILL-IF-EMPTY sentinel for evidence.image_role_code. */
const IMAGE_ROLE_UNKNOWN = 100000003;

// GET /api/cases/{id}/ai-suggestions — pending first, then recent. Honest-empty on any
// read failure (the ai_suggestion table may be unwired on an older DB), so the SPA panel
// never hard-fails: it just shows nothing.
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

// POST /api/ai-suggestions/{id}/review — record the human decision (+ audit). Only the
// pending->accepted transition promotes a value; a re-review is idempotent (no double-promote).
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
      const result: AiSuggestionReviewResult = {
        id,
        reviewState: row.review_state,
        promoted: false,
      };
      return { status: 200, jsonBody: result };
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

/**
 * Promote an accepted suggestion into its target column FILL-IF-EMPTY. Every promote is
 * guarded so it NEVER overwrites a value already set (by a human OR another path). Kinds
 * without a promotion branch here (inspection_address) are accepted WITHOUT
 * auto-promotion — a follow-up reviewer applies them (kept deliberately conservative for
 * the MVP). Best-effort: a promote failure must not undo the recorded acceptance. `actor`
 * (Entra oid/upn) is threaded through so the DEDICATED audit rows this function writes
 * (rules-engine-v2 Phase 2's 'case_link' branch; Phase 4's 'triage_category' branch) carry
 * the same identity as the outer ai_suggestion_accepted/rejected audit in
 * reviewAiSuggestion.
 */
async function promoteAcceptedSuggestion(
  row: Row,
  actor?: string,
): Promise<{ promoted: boolean; promotedField?: string }> {
  const evidenceId = row.evidence_id as string | null;
  const inboundEmailId = row.inbound_email_id as string | null;
  const value = coerceJsonValue(row.suggested_value);
  try {
    if (row.suggestion_type === 'image_role' && evidenceId) {
      const role = (value as { role?: string } | null)?.role;
      const code = role ? imageRoleCodec.toInt(role as ImageRole) : undefined;
      if (code != null) {
        // FILL-IF-EMPTY: only set the role when it is still 'unknown'.
        const upd = await query<Row>(
          `UPDATE evidence SET image_role_code = $2, updated_at = now()
             WHERE id = $1 AND image_role_code = $3 RETURNING id`,
          [evidenceId, code, IMAGE_ROLE_UNKNOWN],
        );
        if (upd[0]) return { promoted: true, promotedField: 'evidence.image_role_code' };
      }
    } else if (row.suggestion_type === 'registration' && evidenceId) {
      const visible = (value as { visible?: boolean } | null)?.visible;
      if (typeof visible === 'boolean') {
        // FILL-IF-EMPTY: registration_visible is tri-state; only set it when still NULL.
        const upd = await query<Row>(
          `UPDATE evidence SET registration_visible = $2, updated_at = now()
             WHERE id = $1 AND registration_visible IS NULL RETURNING id`,
          [evidenceId, visible],
        );
        if (upd[0]) return { promoted: true, promotedField: 'evidence.registration_visible' };
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
          `UPDATE inbound_email SET case_id = $2, triage_state = 'routed', updated_at = now()
             WHERE id = $1 AND case_id IS NULL
           RETURNING id, has_attachments, source_mailbox, source_message_id, subject`,
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
                  await enqueueEvidenceBackfill({
                    inboundEmailId,
                    sourceMailbox,
                    sourceMessageId,
                    targetCaseId,
                    subject: typeof upd[0].subject === 'string' ? upd[0].subject : '',
                  });
                  backfillQueued = true;
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
  } catch {
    /* promotion is supplementary — the acceptance already stands */
  }
  return { promoted: false };
}

/** node-postgres parses jsonb already; tolerate a JSON string too. Never throws. */
function coerceJsonValue(v: unknown): unknown {
  if (typeof v !== 'string') return v ?? null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

// POST /api/cases/{id}/ai-suggestions/generate — run the AI producers for a case.
// HONEST NO-OP when the gate is off OR no model is configured: returns
// { generated: 0, reason: 'disabled' } and touches nothing (no model call, no DB write).
// When ON + configured, it PII-scrubs the case context BEFORE the external model call, then
// persists any suggestions. EVERY zero-generated outcome carries an explicit reason
// (TKT-127: 'disabled' | 'no_input' | 'empty' | 'error' — never a bodyless/unexplained
// nothing), and every outcome is logged to App Insights so an empty generation is
// diagnosable from telemetry. A configured-but-unreachable/failing model degrades to
// { generated: 0, reason: 'error' } with no partial write.
app.http('generateAiSuggestions', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/ai-suggestions/generate',
  handler: withRole('CollisionSpike.User', async (req, invocationCtx, claims) => {
    const caseId = req.params.id;
    // Two-part gate: the master switch AND a configured model endpoint+deployment. Either
    // off -> honest no-op (no DB write, no external call).
    if (!gates.aiAssist() || !gates.aiAssistConfigured()) {
      invocationCtx.log(
        JSON.stringify({
          evt: 'aiSuggestionsGenerate',
          caseId,
          outcome: 'disabled',
          gateOn: gates.aiAssist(),
          modelConfigured: gates.aiAssistConfigured(),
        }),
      );
      const result: GenerateAiSuggestionsResult = { generated: 0, reason: 'disabled' };
      return { status: 200, jsonBody: result };
    }

    try {
      // Minimal case context for the model — never a full case dump (data-protection §6).
      // TKT-132 WIDENED the selection beyond circumstances + claimant address to the labelled
      // input classes buildGenerateInputs assembles (instruction email text, overview facts,
      // vehicle data, photo-analysis stamps) — most intake cases have empty circumstances, so
      // the old two-column prompt made generate a permanent 'no_input' for the live corpus.
      // The claimant address IS included (as a scrubbed geolocation clue) BY DESIGN: the operator
      // adjudicated it "keep it — accept the DPIA posture" (PR46 review / #53, 2026-07-09). The
      // Codex P1 finding — that scrubPii is precision-over-recall and can miss unanchored/free-form
      // addresses — is ACCEPTED under the 2026-07-08 DPIA/GlobalStandard sign-off, not fixed by
      // removing the field.
      const ctx = await query<Row>(
        `SELECT vrm, case_po, eva_accident_circumstances, eva_claimant_address,
                eva_work_provider, eva_vehicle_model, eva_date_of_loss, eva_date_of_instruction,
                eva_mileage, eva_mileage_unit, ov_claim_type, ov_insurer_name, ov_repairer_name
           FROM case_ WHERE id = $1`,
        [caseId],
      );
      if (!ctx[0]) return { status: 404, jsonBody: { error: 'not found' } };

      // The widened extras — each read is BEST-EFFORT (degrades to []): a missing/renamed
      // table must reduce the prompt, never fail a generate that circumstances alone could
      // still serve. instruction text = the case-linked inbound email(s), earliest first (the
      // minting instruction email precedes replies); photo facts = the evidence image stamps.
      const imageKindCode = evidenceKindCodec.toInt('image');
      const [emailRows, imageRows] = await Promise.all([
        query<Row>(
          `SELECT subject, body_preview FROM inbound_email
            WHERE case_id = $1 AND (body_preview IS NOT NULL OR subject IS NOT NULL)
            ORDER BY received_on ASC NULLS LAST, created_at ASC
            LIMIT 2`,
          [caseId],
        ).catch(() => [] as Row[]),
        query<Row>(
          `SELECT image_role_code, registration_visible, excluded, person_reflection
             FROM evidence WHERE case_id = $1 AND kind_code = $2`,
          [caseId, imageKindCode],
        ).catch(() => [] as Row[]),
      ]);

      // Assemble the labelled sections. Every free-text value is PII-SCRUBBED inside
      // buildGenerateInputs BEFORE the external call (@cs/domain scrubPii, VRM kept — it is
      // the domain key the model must see; emails/phones/addresses/postcodes/NINOs/titled
      // names redacted), and per-section + total char caps bound the prompt size.
      const inputs = buildGenerateInputs(ctx[0], {
        instructionEmails: emailRows.map((r) => ({
          subject: typeof r.subject === 'string' ? r.subject : null,
          bodyPreview: typeof r.body_preview === 'string' ? r.body_preview : null,
        })),
        images: imageRows.map((r) => ({
          role: imageRoleCodec.toName(r.image_role_code as number | null) ?? null,
          registrationVisible:
            typeof r.registration_visible === 'boolean' ? r.registration_visible : null,
          excluded: r.excluded === true,
          personReflection: r.person_reflection === true,
        })),
      });

      // NONE of the widened inputs present -> tell the caller so WITHOUT a model call
      // (TKT-127 'no_input': the honest, explainable fast path — no cost, no fabricated
      // output). Post-TKT-132 this genuinely means "the case file holds nothing to reason
      // over", not merely "circumstances are empty".
      if (!inputs.hasInput) {
        invocationCtx.log(
          JSON.stringify({ evt: 'aiSuggestionsGenerate', caseId, outcome: 'no_input' }),
        );
        const result: GenerateAiSuggestionsResult = { generated: 0, reason: 'no_input' };
        return { status: 200, jsonBody: result };
      }

      // Call the model + persist suggestions. Wired to gpt-5 (keyless MI) — reached only when
      // AI_ASSIST_ENABLED is on AND the model is configured (the front-gate above guards this).
      const drafts = await callModelForSuggestions({
        caseId,
        vrm: typeof ctx[0].vrm === 'string' ? ctx[0].vrm : '',
        scrubbedText: inputs.text,
      });

      let generated = 0;
      const actor = actorFromClaims(claims);
      for (const d of drafts) {
        // IDEMPOTENT insert (mirrors the image-analysis producer's NOT EXISTS guard): skip when an
        // equivalent PENDING suggestion for the same (case, evidence, type, value) already exists,
        // so a double-click, a user retry, or a host retry after a late failure never stacks
        // duplicate pending rows / audit events. Keying on suggested_value (not just type) still
        // lets the model emit multiple DISTINCT observations of the same kind (e.g. two different
        // damage_area values) — only an identical rerun is de-duplicated.
        const ins = await query<Row>(
          `INSERT INTO ai_suggestion
             (case_id, evidence_id, suggestion_type, suggested_value, rationale, confidence, model_version)
           SELECT $1, $2, $3, $4::jsonb, $5, $6, $7
            WHERE NOT EXISTS (
              SELECT 1 FROM ai_suggestion
               WHERE suggestion_type = $3
                 AND review_state = 'pending'
                 AND case_id IS NOT DISTINCT FROM $1
                 AND evidence_id IS NOT DISTINCT FROM $2
                 AND suggested_value = $4::jsonb
            )
           RETURNING id`,
          [
            caseId,
            d.evidenceId ?? null,
            d.suggestionType,
            JSON.stringify(d.suggestedValue),
            d.rationale ?? null,
            d.confidence ?? null,
            d.modelVersion ?? gates.aiModelDeployment(),
          ],
        );
        if (ins[0]) {
          generated += 1;
          await writeAudit({
            action: AUDIT_ACTION.ai_suggestion_created,
            caseId,
            summary: `AI suggestion ${d.suggestionType} created`,
            after: { suggestionId: ins[0].id, suggestionType: d.suggestionType },
            ...(actor ? { actor } : {}),
          });
        }
      }

      invocationCtx.log(
        JSON.stringify({
          evt: 'aiSuggestionsGenerate',
          caseId,
          outcome: generated > 0 ? 'generated' : 'empty',
          generated,
          drafts: drafts.length,
          // TKT-132: which input sections fed the prompt (value-free names — safe to log);
          // lets telemetry explain WHY prompts differ across cases (D1 finding: constant 381).
          sections: inputs.sections,
        }),
      );
      // A clean model run with nothing to suggest is an EXPLICIT empty ('empty'),
      // distinct from 'disabled'/'no_input'/'error' — the SPA explains each differently.
      const result: GenerateAiSuggestionsResult =
        generated > 0 ? { generated } : { generated: 0, reason: 'empty' };
      return { status: 200, jsonBody: result };
    } catch (e) {
      // A configured-but-unreachable model (or a transient DB error) degrades honestly —
      // and is LOGGED (TKT-127: the prior silent catch made a live failure look like a
      // quiet "nothing to add", undiagnosable from telemetry).
      invocationCtx.error(
        `[ai-suggestions] generate failed for case ${caseId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      const result: GenerateAiSuggestionsResult = { generated: 0, reason: 'error' };
      return { status: 200, jsonBody: result };
    }
  }),
});

/**
 * Call the configured Azure OpenAI / Foundry model and map its response to draft suggestions
 * (the case/damage-assessment consumer). The PII-scrubbed text is the ONLY case content that
 * leaves the tenant. KEYLESS managed-identity auth (no API-key setting by design) — the mechanics
 * live in lib/aoai-suggestions.ts (reusing aoai-chat.ts's `mintCognitiveToken` + the live triage
 * lane's strict-JSON structured-output shape).
 *
 * WIRED (TKT-015): a real keyless AOAI structured-output call. It only ever fires when the route's
 * front gate (AI_ASSIST_ENABLED + a configured endpoint/deployment) is on — off today, so this is a
 * permanent honest no-op live. A hard model failure THROWS here → the caller's catch degrades to
 * { generated: 0, reason: 'error' } with no partial write; a clean-but-empty run resolves to [].
 */
async function callModelForSuggestions(input: {
  caseId: string;
  vrm: string;
  scrubbedText: string;
}): Promise<DraftSuggestion[]> {
  return callSuggestionModel(input);
}

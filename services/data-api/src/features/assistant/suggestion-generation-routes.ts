/** suggestion-generation-routes — cohesive Data API module. */

import { app } from '@azure/functions';
import { type GenerateAiSuggestionsResult } from '@cs/domain';
import { evidenceKindCodec, imageRoleCodec } from '@cs/domain/codecs';
import { withRole } from '../../platform/auth/staff-auth.js';
import { gates } from '../settings/gates.js';
import { query } from '../../platform/db/client.js';
import { callSuggestionModel, type DraftSuggestion } from './suggestion-client.js';
import { buildGenerateInputs } from './generate-inputs.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit } from '../../shared/audit.js';
import { type Row } from '../../shared/mapping/index.js';

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

async function callModelForSuggestions(input: {
  caseId: string;
  vrm: string;
  scrubbedText: string;
}): Promise<DraftSuggestion[]> {
  return callSuggestionModel(input);
}

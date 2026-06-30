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
 * LIVE STATE: the AI Foundry resource digital-3339-resource has ZERO model deployments, so
 * AI_ASSIST_ENABLED is OFF and AI_MODEL_ENDPOINT/AI_MODEL_DEPLOYMENT are absent — generate is
 * a permanent honest no-op until the operator deploys a model + flips the gate (see TKT-015).
 */

import { app } from '@azure/functions';
import {
  scrubPii,
  type AiSuggestion,
  type AiSuggestionReviewResult,
  type GenerateAiSuggestionsResult,
  type ImageRole,
} from '@cs/domain';
import { imageRoleCodec } from '@cs/domain/codecs';
import { withRole } from '../lib/auth.js';
import { gates } from '../lib/gates.js';
import { query } from '../lib/db.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit } from '../lib/audit.js';
import { isAiReviewState, rowToAiSuggestion, type Row } from '../lib/mappers.js';

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
    const existing = await query<Row>(
      `SELECT id, case_id, evidence_id, suggestion_type, suggested_value, review_state
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
      promotion = await promoteAcceptedSuggestion(row);
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
 * Promote an accepted suggestion into its target column FILL-IF-EMPTY. Only the two
 * concrete evidence-column kinds are auto-promoted today (image_role, registration);
 * every promote is guarded so it NEVER overwrites a value a human already set. Other
 * kinds (inspection_address, triage_category) are accepted WITHOUT auto-promotion —
 * a follow-up reviewer applies them (kept deliberately conservative for the MVP).
 * Best-effort: a promote failure must not undo the recorded acceptance.
 */
async function promoteAcceptedSuggestion(
  row: Row,
): Promise<{ promoted: boolean; promotedField?: string }> {
  const evidenceId = row.evidence_id as string | null;
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
// HONEST NO-OP when the gate is off OR no model is configured (the live state):
// returns { generated: 0, reason: 'disabled' } and touches nothing. When ON + configured,
// it PII-scrubs the case context BEFORE the external model call, then persists any
// suggestions. The model call path is built but dormant — no model is deployed, so a
// configured-but-unreachable model degrades to { generated: 0, reason: 'error' }.
app.http('generateAiSuggestions', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/ai-suggestions/generate',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    // Two-part gate: the master switch AND a configured model endpoint+deployment. Either
    // off -> honest no-op (no DB write, no external call). This is the permanent live path.
    if (!gates.aiAssist() || !gates.aiAssistConfigured()) {
      const result: GenerateAiSuggestionsResult = { generated: 0, reason: 'disabled' };
      return { status: 200, jsonBody: result };
    }

    const caseId = req.params.id;
    try {
      // Minimal case context for the model — never a full case dump (data-protection §6).
      const ctx = await query<Row>(
        `SELECT vrm, eva_accident_circumstances, eva_claimant_address FROM case_ WHERE id = $1`,
        [caseId],
      );
      if (!ctx[0]) return { status: 404, jsonBody: { error: 'not found' } };

      // Assemble the free text the model would reason over, then PII-SCRUB it BEFORE the
      // external call (VRM kept — it is the domain key the model must see; names/emails/
      // phones/addresses/postcodes/NINOs redacted). The scrub summary is counts-only.
      const rawText = [ctx[0].eva_accident_circumstances, ctx[0].eva_claimant_address]
        .filter((s) => typeof s === 'string' && s.trim().length > 0)
        .join('\n');
      const scrubbed = scrubPii(rawText, { redactVrm: false });

      // Call the model + persist suggestions. Dormant today (no deployment) -> 0 drafts.
      const drafts = await callModelForSuggestions({
        caseId,
        vrm: typeof ctx[0].vrm === 'string' ? ctx[0].vrm : '',
        scrubbedText: scrubbed.text,
      });

      let generated = 0;
      const actor = actorFromClaims(claims);
      for (const d of drafts) {
        const ins = await query<Row>(
          `INSERT INTO ai_suggestion
             (case_id, evidence_id, suggestion_type, suggested_value, rationale, confidence, model_version)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7) RETURNING id`,
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

      const result: GenerateAiSuggestionsResult = { generated };
      return { status: 200, jsonBody: result };
    } catch {
      // A configured-but-unreachable model (or a transient DB error) degrades honestly.
      const result: GenerateAiSuggestionsResult = { generated: 0, reason: 'error' };
      return { status: 200, jsonBody: result };
    }
  }),
});

/** A model-produced suggestion before it is persisted. */
interface DraftSuggestion {
  suggestionType: string;
  suggestedValue: unknown;
  evidenceId?: string;
  rationale?: string;
  confidence?: number;
  modelVersion?: string;
}

/**
 * Call the configured Azure OpenAI / Foundry model and map its response to draft
 * suggestions. The PII-scrubbed text is the ONLY case content that would leave the
 * tenant. PREFER managed-identity / keyless auth (no API-key setting by design).
 *
 * DORMANT: digital-3339-resource has no model deployment, so this returns [] — the
 * route stays an honest no-op even if the gate + endpoint settings were flipped on
 * without a real deployment. Wiring the actual call (DefaultAzureCredential bearer ->
 * POST {AI_MODEL_ENDPOINT}/openai/deployments/{AI_MODEL_DEPLOYMENT}/chat/completions,
 * strict-JSON response -> DraftSuggestion[]) is the operator/next step in TKT-015.
 */
async function callModelForSuggestions(_input: {
  caseId: string;
  vrm: string;
  scrubbedText: string;
}): Promise<DraftSuggestion[]> {
  // TODO(TKT-015 operator): deploy a model on digital-3339-resource, set AI_MODEL_ENDPOINT +
  // AI_MODEL_DEPLOYMENT, grant the API managed identity the Cognitive Services OpenAI User
  // role, then implement the keyless chat-completions call here returning strict-JSON drafts.
  return [];
}

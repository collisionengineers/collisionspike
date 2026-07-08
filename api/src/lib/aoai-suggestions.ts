/**
 * api/src/lib/aoai-suggestions.ts — keyless Azure OpenAI (Foundry) structured-output client for
 * the case/damage-assessment SUGGESTION producer (TKT-015). The model call behind
 * `POST /api/cases/{id}/ai-suggestions/generate`'s `callModelForSuggestions`.
 *
 * REUSES the established repo pattern rather than hand-rolling a new HTTP/auth client:
 *   - keyless auth: `mintCognitiveToken` from ./aoai-chat.js (the API app's managed identity,
 *     Cognitive Services audience — the SAME token mint the read-only assistant uses; the API MI
 *     holds `Cognitive Services OpenAI User` on digital-3339-resource, granted 2026-07-05);
 *   - the strict-JSON structured-output shape from the LIVE email-triage lane
 *     (orchestration/src/lib/aoai.ts): AOAI GA v1 `POST {endpoint}/openai/v1/chat/completions`,
 *     `response_format: { type: 'json_schema', json_schema: { strict: true } }`, and the gpt-5
 *     REASONING-model constraints (NO temperature/top_p/penalty/max_tokens — only
 *     `max_completion_tokens` + `reasoning_effort`; verified vs Microsoft Learn "Azure OpenAI
 *     reasoning models" in aoai.ts, 2026-07-02).
 *
 * SUGGESTION-ONLY, PURELY ADDITIVE (TKT-015 acceptance / ADR-0019 §4 "suggestion writer, never an
 * actor"): every output is a `DraftSuggestion` the route persists as a pending `ai_suggestion` row.
 * NONE of the kinds this producer mints (`damage_area`, `damage_severity`, `accident_summary`) has
 * a fill-if-empty promote branch in `promoteAcceptedSuggestion` — so even on a human ACCEPT they
 * are recorded/audited but never auto-written into any case/evidence column (like `inspection_address`
 * / `cancellation`). Promotion is human-confirmed only; the model never mutates state.
 *
 * PII: the CALLER (ai-suggestions.ts) PII-scrubs the case text via @cs/domain `scrubPii` BEFORE
 * calling here (VRM kept — the domain key). This module trusts its `scrubbedText` input.
 *
 * FAILURE POSTURE (matches the route's honest degrade): a HARD failure — network error, timeout,
 * non-2xx, an unparsable/blocked 2xx body — THROWS, so the generate route's catch degrades to
 * `{ generated: 0, reason: 'error' }` with NO partial write. A CLEAN-but-empty response (the model
 * ran and had nothing to suggest → `{ suggestions: [] }`) resolves to `[]` → `{ generated: 0 }`.
 */

import { gates } from './gates.js';
import { mintCognitiveToken } from './aoai-chat.js';

/** A model-produced suggestion before it is persisted — the shape ai-suggestions.ts inserts as an
 *  `ai_suggestion` row (structurally identical to image-analysis.ts's `ImageAnalysisDraft`; kept
 *  separate so this producer + TKT-016's stay independent — see the module doc). */
export interface DraftSuggestion {
  suggestionType: string;
  suggestedValue: unknown;
  evidenceId?: string;
  rationale?: string;
  confidence?: number;
  modelVersion?: string;
}

/** The case context the model reasons over (PII-scrubbed by the caller; VRM kept). */
export interface SuggestionModelInput {
  caseId: string;
  vrm: string;
  scrubbedText: string;
}

/** The observation kinds this case/damage-assessment producer mints — all observation-only (no
 *  auto-promote branch; a human accept records but never writes a case/evidence column). */
export const CASE_ASSESSMENT_SUGGESTION_TYPES = {
  damageArea: 'damage_area',
  damageSeverity: 'damage_severity',
  accidentSummary: 'accident_summary',
} as const;

const T = CASE_ASSESSMENT_SUGGESTION_TYPES;
const KNOWN_TYPES = new Set<string>(Object.values(T));
const SEVERITY_BANDS = new Set(['minor', 'moderate', 'severe', 'unknown']);

const SCHEMA_NAME = 'case_assessment';
const MAX_COMPLETION_TOKENS = 2000;
const REQUEST_TIMEOUT_MS = 30_000;
/** Bound the persisted writes regardless of what the model emits. */
const MAX_DRAFTS = 8;

export const SUGGESTIONS_SYSTEM_PROMPT =
  'You are an expert UK motor-claims vehicle-collision assessor. You are given the vehicle ' +
  'registration and the free-text case notes for ONE claim (personal details have already been ' +
  'removed from the notes). Read ONLY what is written; never invent a fact, a place, a person, or a ' +
  'registration that is not present in the text.\n' +
  'Produce a short list of observations. Each observation is one of:\n' +
  `- ${T.damageArea}: a single damaged area of the vehicle you can infer from the notes ` +
  '(e.g. "front nearside", "rear", "offside doors"). Emit one per distinct area; omit if the notes ' +
  'do not indicate any.\n' +
  `- ${T.damageSeverity}: your overall read of the damage severity — value MUST be exactly one of ` +
  '"minor", "moderate", "severe", or "unknown". Emit at most one.\n' +
  `- ${T.accidentSummary}: one plain-English sentence summarising what happened, for a ` +
  'non-technical case handler. Emit at most one.\n' +
  'For each observation give a confidence from 0 to 1 (your honest belief it is right) and a one-plain-' +
  'sentence rationale describing what in the notes supports it — never how you decided, and never the ' +
  'words "model", "confidence", "JSON", "observation", or similar. If the notes give no usable basis, ' +
  'return an empty list. Never guess to fill the list.';

/** Assemble the user prompt (pure; exported for the shape test). */
export function buildSuggestionsUserPrompt(input: SuggestionModelInput): string {
  return [
    `Vehicle registration: ${input.vrm ? input.vrm : '(unknown)'}`,
    'Case notes (personal details removed):',
    input.scrubbedText && input.scrubbedText.trim() ? input.scrubbedText.trim() : '(none)',
  ].join('\n');
}

/** Strict json_schema for the assessment output (pure; exported for the schema-shape test). Every
 *  property is required + additionalProperties:false at every level — AOAI strict-mode requires it. */
export function buildSuggestionsResponseSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: Object.values(T) },
            value: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            rationale: { type: 'string' },
          },
          required: ['type', 'value', 'confidence', 'rationale'],
          additionalProperties: false,
        },
      },
    },
    required: ['suggestions'],
    additionalProperties: false,
  };
}

/** Pure AOAI GA v1 request-body assembly (unit-testable without a network call). Carries NO
 *  temperature/top_p/penalty/max_tokens — gpt-5 is a reasoning model and rejects them. */
export function buildSuggestionsRequestBody(
  input: SuggestionModelInput,
  deployment: string,
): Record<string, unknown> {
  return {
    model: deployment,
    messages: [
      { role: 'system', content: SUGGESTIONS_SYSTEM_PROMPT },
      { role: 'user', content: buildSuggestionsUserPrompt(input) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: SCHEMA_NAME, strict: true, schema: buildSuggestionsResponseSchema() },
    },
    max_completion_tokens: MAX_COMPLETION_TOKENS,
    reasoning_effort: 'low',
  };
}

function clamp01(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

interface AoaiChatCompletionResponse {
  model?: string;
  system_fingerprint?: string;
  choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
}

/** Wrap one item's value in a self-describing jsonb payload keyed by its kind (mirrors the existing
 *  per-type value shapes — image_role `{ role }`, registration `{ visible }`, triage `{ category }`). */
function suggestedValueFor(type: string, value: string): unknown {
  switch (type) {
    case T.damageArea:
      return { area: value };
    case T.damageSeverity:
      return { severity: value };
    case T.accidentSummary:
    default:
      return { summary: value };
  }
}

/**
 * Parse a 2xx AOAI body into draft suggestions, or NULL when the body is unusable — a content
 * filter, an empty/absent message, an unparsable content string, or a body with no `suggestions`
 * array (a strict-mode contract violation). NULL is the caller's "hard failure" signal (→ throw →
 * route `reason:'error'`); a WELL-FORMED body whose `suggestions` is empty returns `[]` (a clean
 * "nothing to suggest"). Never throws. `deployment` feeds the model_version stamp
 * `<deployment>:<response-model|system_fingerprint|unknown>` (mirrors the triage lane's stamp).
 */
export function parseSuggestionsResponse(json: unknown, deployment: string): DraftSuggestion[] | null {
  const body = json as AoaiChatCompletionResponse | undefined;
  const choice = body?.choices?.[0];
  if (!choice || choice.finish_reason === 'content_filter') return null;
  const content = choice.message?.content;
  if (typeof content !== 'string' || content.trim() === '') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null; // strict-mode should prevent this — treat as a hard failure, not a silent empty
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const items = (parsed as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(items)) return null;

  const modelVersion = `${deployment}:${body?.model ?? body?.system_fingerprint ?? 'unknown'}`;
  const drafts: DraftSuggestion[] = [];
  for (const raw of items) {
    if (drafts.length >= MAX_DRAFTS) break;
    if (typeof raw !== 'object' || raw === null) continue;
    const it = raw as { type?: unknown; value?: unknown; confidence?: unknown; rationale?: unknown };
    const type = typeof it.type === 'string' ? it.type : '';
    if (!KNOWN_TYPES.has(type)) continue; // ignore anything off the closed enum (defensive)
    let value = typeof it.value === 'string' ? it.value.trim() : '';
    if (!value) continue;
    if (type === T.damageSeverity) {
      const band = value.toLowerCase();
      value = SEVERITY_BANDS.has(band) ? band : 'unknown';
    } else {
      value = value.slice(0, 400);
    }
    const rationale = typeof it.rationale === 'string' ? it.rationale.trim().slice(0, 400) : '';
    drafts.push({
      suggestionType: type,
      suggestedValue: suggestedValueFor(type, value),
      confidence: clamp01(it.confidence),
      modelVersion,
      ...(rationale ? { rationale } : {}),
    });
  }
  return drafts;
}

/** Injected collaborators (unit tests supply fakes; production uses the real fetch + MI token). */
export interface SuggestionModelDeps {
  fetchImpl?: typeof fetch;
  mintToken?: () => Promise<string>;
  endpoint?: string;
  deployment?: string;
}

/**
 * Call the configured AOAI deployment for case/damage-assessment suggestions and map the strict-JSON
 * response to `DraftSuggestion[]`.
 *
 * THROWS on a hard failure (unreachable, timeout, non-2xx, unparsable/blocked 2xx body) so the
 * generate route degrades to `{ generated: 0, reason: 'error' }` with no partial write. Resolves
 * with `[]` when the model runs cleanly but has nothing to suggest. Returns `[]` WITHOUT any network
 * call when no endpoint/deployment is configured (defensive — the route already gate-checks
 * `aiAssistConfigured()` before ever calling this).
 */
export async function callSuggestionModel(
  input: SuggestionModelInput,
  deps: SuggestionModelDeps = {},
): Promise<DraftSuggestion[]> {
  const endpoint = deps.endpoint ?? gates.aiModelEndpoint();
  const deployment = deps.deployment ?? gates.aiModelDeployment();
  if (!endpoint || !deployment) return [];

  const doFetch = deps.fetchImpl ?? fetch;
  const mint = deps.mintToken ?? mintCognitiveToken;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const token = await mint();
    const url = `${endpoint.replace(/\/$/, '')}/openai/v1/chat/completions`;
    const res = await doFetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSuggestionsRequestBody(input, deployment)),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`AOAI suggestions ${res.status}: ${errText.slice(0, 200)}`);
    }
    const json = (await res.json()) as unknown;
    const drafts = parseSuggestionsResponse(json, deployment);
    if (drafts === null) throw new Error('AOAI suggestions: unparsable or blocked response');
    return drafts;
  } finally {
    clearTimeout(timer);
  }
}

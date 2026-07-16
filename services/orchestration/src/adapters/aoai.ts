/** *
 * Azure OpenAI (Foundry) triage-assist client — rules-engine-v2 Phase 4 (ADR-0019 Stage C:
 * "the gated LLM/embeddings pass is a suggestion writer, never an actor"). Called ONLY from
 * the gated `triageClassify` activity (`workflows/intake/triage-classify.ts`), which is
 * itself only ever scheduled for abstain/`uncorroborated_*` rows (ADR-0015's 2026-06-29
 * update). Every function here is safe to call speculatively — `callTriageModel` NEVER
 * throws; a misconfigured endpoint, an auth failure, a timeout, and a content-filter block
 * all degrade to `{ abstain: true, reason }`, never a thrown error that could sink the
 * (best-effort) calling activity.
 *
 * Model surface: the AOAI GA v1 API (`POST {endpoint}/openai/v1/chat/completions`),
 * structured outputs (`response_format: { type: 'json_schema', json_schema: { strict: true
 * } }`), enums locked to the live `@cs/domain` inbound-email taxonomy. gpt-5 is a
 * REASONING model — it rejects `temperature`/`top_p`/penalty params and `max_tokens`
 * (verified against Microsoft Learn's "Azure OpenAI reasoning models" doc, 2026-07-02); use
 * `max_completion_tokens` + `reasoning_effort` instead. NEVER pin/branch on a taxonomy
 * count in prose here (CLAUDE.md doc-hygiene) — the taxonomy is enumerated live from
 * `@cs/domain`'s `INBOUND_CATEGORIES`/`INBOUND_SUBTYPES`, so a future append-only addition
 * is picked up automatically (a name with no curated one-liner below still gets a safe
 * generic description, never dropped from the prompt).
 *
 * Auth: Entra token via the orchestration app's managed identity — mirrors
 * `lib/data-api.ts`'s `getDataApiToken()` (same `IDENTITY_ENDPOINT`/`IDENTITY_HEADER`
 * REST contract), scoped to the Cognitive Services audience instead of the Data API one.
 * The `IDENTITY_ENDPOINT` token endpoint's `resource` query parameter takes the bare Entra
 * resource URI (e.g. `https://cognitiveservices.azure.com`) — NOT an MSAL-style
 * `<resource>/.default` scope string (that suffix is what `DefaultAzureCredential`-based
 * SDKs accept and strip internally before calling this same REST endpoint). This module
 * exposes the conventional `/.default` scope constant for readability/future-SDK-swap, and
 * strips the suffix itself when building the raw HTTP request.
 *
 * Local dev: NO managed identity exists off-Azure, so `IDENTITY_ENDPOINT` is absent when
 * running under `func start` on a workstation. Opt-in ONLY (`AOAI_DEV_TOKEN=1`, never
 * silently attempted) fallback shells out to `az account get-access-token` — the
 * OPERATOR's own `az login` session (G5 pre-authorises AI testing on repo data; ADR-0015
 * §"AI-test authority"). This mirrors `data-api.ts`'s local-dev short-circuit in SPIRIT
 * (an explicit, narrow escape hatch for off-Azure runs) though not mechanism — data-api.ts
 * reads a static `DATA_API_TOKEN` app-setting; there is no equivalent static setting here
 * because a Cognitive Services token is short-lived and this lib has no "local fake" to
 * fall back to, so it fetches a REAL token via the CLI instead.
 *
 * PII: the caller (triage-classify.ts) is responsible for PII-scrubbing subject/body
 * BEFORE calling `callTriageModel` (via `@cs/domain`'s `scrubPii`) — this module trusts
 * its `subjectScrubbed`/`bodyScrubbed` inputs and does no scrubbing itself.
 */

import { INBOUND_CATEGORIES, INBOUND_SUBTYPES, type InboundCategory, type InboundSubtype } from '@cs/domain';
import { gates } from '@cs/domain/gates';

/* ============================================================
   Token mint — MSI (App Service/Functions IDENTITY_ENDPOINT REST contract), cached,
   dev fallback. Mirrors lib/data-api.ts's getDataApiToken() shape.
   ============================================================ */

/** Conventional MSAL-style scope string (readability / future `DefaultAzureCredential`
 *  swap) — see the module doc for why the raw HTTP path below strips the `/.default`. */
export const COGNITIVE_SERVICES_SCOPE = 'https://cognitiveservices.azure.com/.default';

let cachedToken: { value: string; expiresAt: number } | null = null;

/** `<scope>/.default` -> the bare Entra resource URI that IDENTITY_ENDPOINT
 *  `resource=` query parameter expects. Exported for the unit test; pure. */
export function resourceFromScope(scope: string): string {
  return scope.endsWith('/.default') ? scope.slice(0, -'/.default'.length) : scope;
}

/**
 * Mint (or return the cached) Entra bearer token for the Cognitive Services audience.
 * THROWS on failure — callers in this module always wrap it so a mint failure degrades to
 * `{ abstain: true }`, never an unhandled rejection.
 */
export async function mintCognitiveToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.value;

  const idEndpoint = process.env.IDENTITY_ENDPOINT;
  const idHeader = process.env.IDENTITY_HEADER;

  if (idEndpoint && idHeader) {
    const resource = resourceFromScope(COGNITIVE_SERVICES_SCOPE);
    const url = `${idEndpoint}?resource=${encodeURIComponent(resource)}&api-version=2019-08-01`;
    const res = await fetch(url, { headers: { 'X-IDENTITY-HEADER': idHeader } });
    if (!res.ok) throw new Error(`MSI token (cognitiveservices) ${res.status}`);
    const json = (await res.json()) as { access_token: string; expires_on?: string };
    cachedToken = {
      value: json.access_token,
      expiresAt: json.expires_on ? Number(json.expires_on) * 1000 : now + 3_300_000,
    };
    return cachedToken.value;
  }

  // Dev/local fallback ONLY — explicit opt-in so a stray local run never silently shells
  // out to the CLI. No IDENTITY_ENDPOINT means this process isn't running on Azure
  // Functions/App Service (the platform always sets it), so MSI is not available at all.
  if (process.env.AOAI_DEV_TOKEN === '1') {
    const { execFile } = await import('node:child_process');
    const token = await new Promise<string>((resolve, reject) => {
      execFile(
        'az',
        ['account', 'get-access-token', '--resource', 'https://cognitiveservices.azure.com', '--query', 'accessToken', '-o', 'tsv'],
        (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout.trim());
        },
      );
    });
    if (!token) throw new Error('az account get-access-token returned no token');
    // az does not report an expiry here; cache conservatively (most Entra tokens run ~60min).
    cachedToken = { value: token, expiresAt: now + 3_000_000 };
    return token;
  }

  throw new Error(
    'missing IDENTITY_ENDPOINT/IDENTITY_HEADER for Cognitive Services auth (set AOAI_DEV_TOKEN=1 to use the operator az-cli session for local dev)',
  );
}

/* ============================================================
   Taxonomy prompt material — enumerated from @cs/domain, never hand-duplicated (so a
   future append-only taxonomy addition is automatically included in the prompt + schema).
   ============================================================ */

/** One-line, plain-English definitions for the model's system prompt. A category/subtype
 *  without a curated entry still gets a safe generic line (see the two lookup helpers
 *  below) — the taxonomy enumeration below can never silently omit a live option. */
const CATEGORY_DEFINITIONS: Partial<Record<InboundCategory, string>> = {
  receiving_work: 'An instruction or audit request that should become a case, for a new or an existing client.',
  query: 'A question about work already in progress, or a new enquiry — no new work to log yet.',
  other: 'Anything that is not a work item, a query, billing, or a cancellation report — the catch-all.',
  billing: 'An invoice, fee query, or payment matter about work already carried out.',
  non_actionable: 'A short receipt/acknowledgement/no-action-needed message (e.g. "thanks", an auto-reply).',
  case_update: 'New information — evidence, photographs, or an answer — for a case already open.',
  cancellation: 'A claim or case reported cancelled, closed, or withdrawn.',
  pre_instruction:
    'Directions to follow when a formal instruction arrives later — no instruction yet, so no case should be opened.',
  website_enquiry:
    'A prospective customer enquiry submitted through the Collision Engineers website — never an existing-case update.',
};

const SUBTYPE_DEFINITIONS: Partial<Record<InboundSubtype, string>> = {
  existing_provider_instruction: 'An instruction from a sender who is a known work provider.',
  existing_provider_audit: 'An audit / re-inspection instruction from a known work provider.',
  existing_provider_diminution: 'A diminution-in-value instruction from a known work provider.',
  new_client_work: 'An instruction from a sender who is not a known work provider.',
  query_existing_work: 'A question referring to a case already in progress.',
  query_new_enquiry: 'A question from someone with no case in progress yet.',
  billing_request: 'An invoice or payment request tied to work already carried out.',
  case_summary: 'A status digest or summary covering one or more cases.',
  acknowledgement: 'A short "received / thanks / noted" reply that needs no action.',
  other: 'None of the other subtypes apply.',
  images_received: 'Photographs with no other new instruction content.',
  cancellation_notice: 'The usual subtype for a cancellation report.',
  update_general: 'New information on an existing case that is not photographs alone.',
  payment_remittance:
    'A payment made TO us — a remittance advice or transfer notice for work already done (not a request for our invoice).',
  pre_instruction_directions: 'The usual subtype for pre-instruction directions.',
  website_general_enquiry: 'A general enquiry submitted through the Collision Engineers website contact form.',
};

function categoryLine(name: InboundCategory): string {
  return `- ${name}: ${CATEGORY_DEFINITIONS[name] ?? 'A taxonomy category (no further description on file).'}`;
}

function subtypeLine(name: InboundSubtype): string {
  return `- ${name}: ${SUBTYPE_DEFINITIONS[name] ?? 'A taxonomy subtype (no further description on file).'}`;
}

/** Pure; exported so the "schema shape" unit test can assert the prompt mentions every
 *  live category/subtype without hand-duplicating the taxonomy list in the test file. */
export function buildSystemPrompt(): string {
  return [
    'You triage inbound emails for a vehicle-collision engineering business. A fast, deterministic ' +
      'rule pass already ran on this message and could not confidently place it — you are a second ' +
      'opinion for that one message, not a first pass and not a replacement for the rules.',
    'Choose the single best category and subtype from the lists below. Give a confidence from 0 to 1 ' +
      '(your honest belief the label is right, not a fixed value). Write a rationale of one plain ' +
      'sentence, in everyday English, for a non-technical case handler: describe what the message is ' +
      'about, never how you decided. Never use the words "classifier", "signals", "model", ' +
      '"confidence", "rule", "category", "subtype", "JSON", or any similar technical term in the ' +
      'rationale. Never invent a case number, reference, or vehicle registration that is not present ' +
      'in the message text you were given.',
    `Categories:\n${INBOUND_CATEGORIES.map(categoryLine).join('\n')}`,
    `Subtypes:\n${INBOUND_SUBTYPES.map(subtypeLine).join('\n')}`,
    'Pick the subtype that belongs with your chosen category; if none fits well, use that category\'s ' +
      '"other" or general subtype.',
  ].join('\n\n');
}

function buildUserPrompt(input: CallTriageModelInput): string {
  const attachments = input.attachmentFilenames.length ? input.attachmentFilenames.join(', ') : '(none)';
  const signals = input.deterministicSignals.length ? input.deterministicSignals.join(', ') : '(none)';
  return [
    `Sender domain: ${input.senderDomain || '(unknown)'}`,
    `Attachment filenames: ${attachments}`,
    `Subject: ${input.subjectScrubbed || '(none)'}`,
    `Body:\n${input.bodyScrubbed || '(none)'}`,
    '---',
    'The deterministic rule pass proposed (but did not confidently commit to):',
    `category=${input.deterministicCategory || '(none)'} subtype=${input.deterministicSubtype || '(none)'} ` +
      `signals=${signals}`,
  ].join('\n');
}

/* ============================================================
   Request / response shapes.
   ============================================================ */

export interface CallTriageModelInput {
  subjectScrubbed: string;
  bodyScrubbed: string;
  senderDomain: string;
  attachmentFilenames: readonly string[];
  deterministicCategory: string;
  deterministicSubtype: string;
  deterministicSignals: readonly string[];
}

export interface TriageModelSuggestion {
  category: InboundCategory;
  subtype: InboundSubtype;
  confidence: number;
  rationale: string;
  /** AOAI response `model` field (e.g. 'gpt-5-2025-08-07'), when present — feeds the
   *  caller's `model_version` stamp ('<deployment>:<modelVersion-from-response>'). */
  responseModel?: string;
  /** AOAI response `system_fingerprint`, when present (fallback for the stamp above). */
  systemFingerprint?: string;
}

export interface TriageModelAbstain {
  abstain: true;
  /** Short, machine-readable reason — for counts-only telemetry, never shown to staff. */
  reason: string;
}

export type TriageModelResult = TriageModelSuggestion | TriageModelAbstain;

const MAX_COMPLETION_TOKENS = 2000;
const REQUEST_TIMEOUT_MS = 15_000;
const SCHEMA_NAME = 'triage_classification';

/** Strict JSON schema, enums locked to the live taxonomy (pure — rebuilt fresh each call
 *  is cheap; exported for the "schema shape" unit test). */
export function buildTriageResponseSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      category: { type: 'string', enum: [...INBOUND_CATEGORIES] },
      subtype: { type: 'string', enum: [...INBOUND_SUBTYPES] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      rationale: { type: 'string' },
    },
    required: ['category', 'subtype', 'confidence', 'rationale'],
    additionalProperties: false,
  };
}

/**
 * Pure request-body assembly (the AOAI GA v1 `chat/completions` contract) — split out so
 * it is unit-testable without a network call. Deliberately carries NO
 * temperature/top_p/penalty/max_tokens fields: gpt-5 is a reasoning model and rejects them
 * (Microsoft Learn "Azure OpenAI reasoning models" — Not Supported list, verified
 * 2026-07-02).
 */
export function buildTriageRequestBody(input: CallTriageModelInput, deployment: string): Record<string, unknown> {
  return {
    model: deployment,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(input) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: SCHEMA_NAME,
        strict: true,
        schema: buildTriageResponseSchema(),
      },
    },
    max_completion_tokens: MAX_COMPLETION_TOKENS,
    reasoning_effort: 'low',
  };
}

/* ============================================================
   Response mapping — pure, exported for the "content_filter mapping" unit test.
   ============================================================ */

const KNOWN_CATEGORIES = new Set<string>(INBOUND_CATEGORIES);
const KNOWN_SUBTYPES = new Set<string>(INBOUND_SUBTYPES);

interface AoaiErrorBody {
  error?: { code?: string; message?: string };
}

interface AoaiChatCompletionResponse {
  model?: string;
  system_fingerprint?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string };
  }>;
}

/**
 * Map a non-2xx AOAI response to an abstain result. A prompt-side content-filter block
 * surfaces as HTTP 400 with `error.code === 'content_filter'` (per the task's stated
 * contract) — mapped to the DISTINCT reason `'content_filter'` so counts-only telemetry
 * can tell "the service declined to answer this content" apart from a generic failure.
 */
export function abstainForErrorResponse(status: number, body: unknown): TriageModelAbstain {
  const code = (body as AoaiErrorBody | undefined)?.error?.code;
  if (code === 'content_filter') return { abstain: true, reason: 'content_filter' };
  return { abstain: true, reason: code ? `http_${status}_${code}` : `http_${status}` };
}

/**
 * Parse a 2xx AOAI response body into a suggestion or an abstain. Never throws — any
 * unexpected shape (missing choices, unparsable content, an out-of-taxonomy value) is an
 * abstain, never an exception; `strict: true` on the request should make the "out of
 * taxonomy" case unreachable, but this never trusts that blindly (mirrors this codebase's
 * "never trust the caller alone" convention — e.g. packages/domain/src/domain/dedup.ts).
 */
export function parseTriageModelResponse(json: unknown): TriageModelResult {
  const body = json as AoaiChatCompletionResponse | undefined;
  const choice = body?.choices?.[0];
  if (!choice) return { abstain: true, reason: 'empty_response' };

  // A prompt-side filter is the documented 400 path (abstainForErrorResponse, above); a
  // COMPLETION-side filter can still surface here as a 200 with finish_reason:
  // 'content_filter' (Microsoft Learn "Azure OpenAI frequently asked questions" — a
  // status-200 response can carry this when the model's OWN output, not the prompt,
  // trips the content policy). Defensive addition beyond the task's literal 400-only
  // spec — cheap, and the correct behaviour either way is the same: abstain.
  if (choice.finish_reason === 'content_filter') {
    return { abstain: true, reason: 'content_filter' };
  }

  const content = choice.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    return { abstain: true, reason: 'empty_response' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { abstain: true, reason: 'parse_error' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { abstain: true, reason: 'parse_error' };
  }

  const candidate = parsed as { category?: unknown; subtype?: unknown; confidence?: unknown; rationale?: unknown };
  const category = typeof candidate.category === 'string' ? candidate.category : '';
  const subtype = typeof candidate.subtype === 'string' ? candidate.subtype : '';
  if (!KNOWN_CATEGORIES.has(category) || !KNOWN_SUBTYPES.has(subtype)) {
    return { abstain: true, reason: 'invalid_taxonomy' };
  }

  const rationale = typeof candidate.rationale === 'string' ? candidate.rationale.trim() : '';
  if (!rationale) return { abstain: true, reason: 'empty_rationale' };

  const rawConfidence = typeof candidate.confidence === 'number' ? candidate.confidence : 0;
  const confidence = Math.min(1, Math.max(0, rawConfidence));

  return {
    category: category as InboundCategory,
    subtype: subtype as InboundSubtype,
    confidence,
    rationale,
    ...(typeof body?.model === 'string' ? { responseModel: body.model } : {}),
    ...(typeof body?.system_fingerprint === 'string' ? { systemFingerprint: body.system_fingerprint } : {}),
  };
}

/* ============================================================
   The call.
   ============================================================ */

/**
 * Call the configured AOAI deployment for a second-opinion triage classification.
 * NEVER THROWS — every failure mode (not configured, auth failure, network error,
 * timeout, non-2xx, content filter, malformed response) degrades to
 * `{ abstain: true, reason }`. Callers still PII-scrub subject/body before calling this
 * (see the module doc) — this function trusts its inputs.
 */
export async function callTriageModel(input: CallTriageModelInput): Promise<TriageModelResult> {
  const endpoint = gates.aiModelEndpoint();
  const deployment = gates.aiModelDeployment();
  if (!endpoint || !deployment) {
    return { abstain: true, reason: 'model_not_configured' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const token = await mintCognitiveToken();
    const url = `${endpoint.replace(/\/$/, '')}/openai/v1/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildTriageRequestBody(input, deployment)),
      signal: controller.signal,
    });

    const json: unknown = await res.json().catch(() => undefined);

    if (!res.ok) {
      return abstainForErrorResponse(res.status, json);
    }
    return parseTriageModelResponse(json);
  } catch (e) {
    const isAbort = e instanceof Error && e.name === 'AbortError';
    return { abstain: true, reason: isAbort ? 'timeout' : 'request_failed' };
  } finally {
    clearTimeout(timer);
  }
}

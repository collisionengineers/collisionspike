/**
 * orchestration/src/lib/image-classify.ts
 *
 * Vehicle-inspection IMAGE classifier (TKT-064) — the live-pipeline counterpart of the
 * one-shot backfill. Given ONE evidence image it returns its EVA role
 * (overview / damage_closeup / additional / other), whether a registration plate is
 * legibly visible (+ the plate text), and whether a person / photographer reflection is
 * present (the ADR "person reflection = unusable" exclusion rule).
 *
 * Model surface + auth mirror `lib/aoai.ts` exactly: the AOAI GA v1
 * `POST {endpoint}/openai/v1/chat/completions`, gpt-5 (a REASONING model — no
 * temperature/top_p/max_tokens; `max_completion_tokens` + `reasoning_effort` instead),
 * structured outputs (`json_schema`, strict), and the Cognitive Services managed-identity
 * token from `mintCognitiveToken()`. Endpoint + deployment come from the SAME
 * `AI_MODEL_ENDPOINT` / `AI_MODEL_DEPLOYMENT` settings the triage-assist path uses.
 *
 * NEVER THROWS — a missing model config, an auth failure, a timeout, a content-filter
 * block, or any malformed response degrades to `null` (the caller then persists the image
 * with role `unknown`, exactly as before this classifier existed). Image classification is
 * best-effort defence-in-depth on the intake path and must never sink a (best-effort)
 * persist activity.
 */

import { gates } from '@cs/domain/gates';
import { mintCognitiveToken } from './aoai.js';

export type ImageRoleName = 'overview' | 'damage_closeup' | 'additional' | 'other';

export interface ImageClassification {
  role: ImageRoleName;
  registrationVisible: boolean;
  plateText: string;
  personReflection: boolean;
  confidence: number;
}

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_COMPLETION_TOKENS = 3000;
const SCHEMA_NAME = 'vehicle_image_classification';

const SYSTEM_PROMPT =
  'You are an expert UK motor-claims vehicle-inspection image classifier. You are shown ONE ' +
  'photo from a case’s evidence set. Classify it precisely.\n' +
  'role: "overview" = a WIDE shot showing most/all of the whole vehicle (used to identify the ' +
  'car); prefer this when the full vehicle and ideally its number plate are visible. ' +
  '"damage_closeup" = a close-up focused on damage (dent, scratch, crack, broken panel/light/' +
  'bumper). "additional" = any other genuine vehicle photo (interior, dashboard/odometer, VIN ' +
  'plate, tyre, engine bay, a plate-only close-up with no damage, a partial panel with no clear ' +
  'damage). "other" = NOT a vehicle photo (document/letter scan, screenshot, form, logo, email, ' +
  'blank/corrupt).\n' +
  'registration_visible: true ONLY if a UK number plate is present AND its characters are legibly ' +
  'readable in THIS image; else false. plate_text: the registration (UPPERCASE, no spaces) or "" ' +
  'if none/illegible. person_reflection: true if a person’s face or human reflection is ' +
  'visible (e.g. the photographer reflected in paintwork/glass/window). Judge only what is visible.';

function buildResponseSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      role: { type: 'string', enum: ['overview', 'damage_closeup', 'additional', 'other'] },
      registration_visible: { type: 'boolean' },
      plate_text: { type: 'string' },
      person_reflection: { type: 'boolean' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['role', 'registration_visible', 'plate_text', 'person_reflection', 'confidence'],
    additionalProperties: false,
  };
}

/** Pure request-body assembly (AOAI GA v1 chat/completions, gpt-5 reasoning params) — no
 *  temperature/max_tokens (gpt-5 rejects them). Exported for the unit test. */
export function buildImageRequestBody(
  imageBase64: string,
  contentType: string,
  deployment: string,
  caseVrm?: string,
): Record<string, unknown> {
  const ctype = contentType && contentType.startsWith('image/') ? contentType : 'image/jpeg';
  const dataUrl = `data:${ctype};base64,${imageBase64}`;
  const hint = caseVrm ? ` The case vehicle registration is '${caseVrm}'.` : '';
  return {
    model: deployment,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Classify this vehicle inspection photo.' + hint },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: SCHEMA_NAME, strict: true, schema: buildResponseSchema() },
    },
    max_completion_tokens: MAX_COMPLETION_TOKENS,
    reasoning_effort: 'low',
  };
}

const ROLE_NAMES = new Set<ImageRoleName>(['overview', 'damage_closeup', 'additional', 'other']);

/** Parse a 2xx AOAI body into a classification or null. Never throws. Exported for tests. */
export function parseImageResponse(json: unknown): ImageClassification | null {
  const body = json as { choices?: Array<{ finish_reason?: string; message?: { content?: string } }> } | undefined;
  const choice = body?.choices?.[0];
  if (!choice || choice.finish_reason === 'content_filter') return null;
  const content = choice.message?.content;
  if (typeof content !== 'string' || content.trim() === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const c = parsed as Record<string, unknown>;
  const role = typeof c.role === 'string' && ROLE_NAMES.has(c.role as ImageRoleName) ? (c.role as ImageRoleName) : null;
  if (!role) return null;
  return {
    role,
    registrationVisible: c.registration_visible === true,
    plateText: typeof c.plate_text === 'string' ? c.plate_text.trim().slice(0, 16) : '',
    personReflection: c.person_reflection === true,
    confidence:
      typeof c.confidence === 'number' ? Math.min(1, Math.max(0, c.confidence)) : 0,
  };
}

/**
 * Classify one image. Returns the classification, or `null` on ANY failure (not configured,
 * auth, timeout, non-2xx, content filter, malformed) — the caller falls back to role
 * `unknown`. Gate/config check is the caller's job (this runs only when
 * gates.imageRoleClassifyEnabled()); still degrades safely if called speculatively.
 */
export async function classifyImage(input: {
  imageBase64: string;
  contentType?: string;
  caseVrm?: string;
}): Promise<ImageClassification | null> {
  const endpoint = gates.aiModelEndpoint();
  const deployment = gates.aiModelDeployment();
  if (!endpoint || !deployment) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const token = await mintCognitiveToken();
    const url = `${endpoint.replace(/\/$/, '')}/openai/v1/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(
        buildImageRequestBody(input.imageBase64, input.contentType ?? 'image/jpeg', deployment, input.caseVrm),
      ),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json: unknown = await res.json().catch(() => undefined);
    return parseImageResponse(json);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Map a classification to the evidence image-metadata fields the persist seam writes.
 * Policy (mirrors the one-shot backfill): person-reflection -> excluded (domain rule);
 * non-vehicle "other" -> not accepted; overview/damage/additional -> accepted for EVA.
 */
export function classificationToEvidenceFields(c: ImageClassification): {
  imageRole: ImageRoleName;
  registrationVisible: boolean;
  acceptedForEva: boolean;
  excluded: boolean;
  exclusionReason?: string;
} {
  if (c.personReflection) {
    return {
      imageRole: c.role,
      registrationVisible: c.registrationVisible,
      acceptedForEva: false,
      excluded: true,
      exclusionReason: 'person reflection detected (auto-classified)',
    };
  }
  const accepted = c.role !== 'other';
  return {
    imageRole: c.role,
    registrationVisible: c.registrationVisible,
    acceptedForEva: accepted,
    excluded: false,
  };
}

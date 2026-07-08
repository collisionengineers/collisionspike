/**
 * api/src/lib/image-analysis-adapters.ts — the NETWORK-backed stage adapters for the image-analysis
 * producer (TKT-016). This is the impure seam the pure pipeline (image-analysis.ts) is injected
 * with in production; the offline test injects fakes instead, so nothing here runs under `vitest`.
 *
 * AUTH: keyless / managed-identity throughout — NO key app-settings by design.
 *   - the gpt-5 vision + same-vehicle calls mint a Cognitive Services token via the API app MI
 *     (aoai-chat.ts::mintCognitiveToken; the MI holds `Cognitive Services OpenAI User` on the
 *     Foundry account digital-3339-resource) and POST the AOAI GA v1 chat/completions contract;
 *   - the registration read routes to the LOCAL fast-alpr `/api/plate-ocr` route (UK-resident,
 *     zero-egress — TKT-017) via a function key (OCR_FN_URL/OCR_FN_KEY);
 *   - the address stage reuses the existing location-assist Function (corpus + provider history).
 *
 * EVERY adapter is best-effort and returns null on ANY failure (not configured / auth / timeout /
 * non-2xx / content filter / malformed) — the pipeline then degrades that stage gracefully.
 */

import { gates } from './gates.js';
import { mintCognitiveToken } from './aoai-chat.js';
import { callPlateOcr, callLocationSuggest } from './functions-client.js';
import { resolveAssistImageBase64 } from './evidence-bytes.js';
import {
  SCENE_SYSTEM_PROMPT,
  SAME_VEHICLE_SYSTEM_PROMPT,
  buildSceneResponseSchema,
  buildSameVehicleResponseSchema,
  parseSceneResponse,
  parseSameVehicleResponse,
  type ImageAnalysisAdapters,
  type SceneAnalysis,
  type SameVehicleResult,
  type PlateReadResult,
  type AddressCandidate,
  type ImageInput,
  type CaseContext,
} from './image-analysis.js';

const REQUEST_TIMEOUT_MS = 30_000;
const SCENE_MAX_COMPLETION_TOKENS = 3000;
const SAMEVEHICLE_MAX_COMPLETION_TOKENS = 1500;

/** Pure request-body assembly for the per-image scene call (gpt-5 reasoning params — no
 *  temperature/max_tokens). Exported for readability/tests. */
export function buildSceneRequestBody(
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
      { role: 'system', content: SCENE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Observe this vehicle inspection photo.' + hint },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'vehicle_scene_analysis', strict: true, schema: buildSceneResponseSchema() },
    },
    max_completion_tokens: SCENE_MAX_COMPLETION_TOKENS,
    reasoning_effort: 'low',
  };
}

/** Pure request-body assembly for the text-only same-vehicle call. */
export function buildSameVehicleRequestBody(
  descriptors: Array<{ evidenceId: string; descriptor?: string }>,
  deployment: string,
): Record<string, unknown> {
  const list = descriptors
    .map((d, i) => `${i + 1}. id=${d.evidenceId}: ${d.descriptor?.trim() || '(no description)'}`)
    .join('\n');
  return {
    model: deployment,
    messages: [
      { role: 'system', content: SAME_VEHICLE_SYSTEM_PROMPT },
      { role: 'user', content: `Vehicle descriptions from one case:\n${list}` },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'same_vehicle_judgement', strict: true, schema: buildSameVehicleResponseSchema() },
    },
    max_completion_tokens: SAMEVEHICLE_MAX_COMPLETION_TOKENS,
    reasoning_effort: 'low',
  };
}

/** One AOAI chat/completions round-trip → parsed JSON body, or null on any failure. Never throws. */
async function postAoai(body: Record<string, unknown>): Promise<unknown> {
  const endpoint = gates.aiModelEndpoint();
  if (!endpoint) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const token = await mintCognitiveToken();
    const url = `${endpoint.replace(/\/$/, '')}/openai/v1/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json().catch(() => undefined);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build the live, network-backed adapters. The route hands these to `runImageAnalysis`. The gate +
 * model-configured check is the route's job (gates.imageAnalysisEnabled()); each adapter still
 * degrades safely if a per-stage dependency (OCR Function, location-assist) is absent.
 */
export function makeImageAnalysisAdapters(): ImageAnalysisAdapters {
  const deployment = gates.aiModelDeployment();

  return {
    async analyzeScene(img: ImageInput, ctx: CaseContext): Promise<SceneAnalysis | null> {
      if (!deployment) return null;
      const json = await postAoai(
        buildSceneRequestBody(img.imageBase64, img.contentType ?? 'image/jpeg', deployment, ctx.caseVrm),
      );
      return json ? parseSceneResponse(json) : null;
    },

    async compareSameVehicle(scenes, _ctx): Promise<SameVehicleResult | null> {
      if (!deployment || scenes.length < 2) return null;
      const json = await postAoai(buildSameVehicleRequestBody(scenes, deployment));
      return json ? parseSameVehicleResponse(json) : null;
    },

    async readPlate(img: ImageInput, ctx: CaseContext): Promise<PlateReadResult | null> {
      // LOCAL fast-alpr — zero egress. Throws when OCR_FN_URL/KEY are absent or the call fails;
      // caught here so the reg stage degrades (the VLM visibility tri-state still stands).
      try {
        const r = await callPlateOcr({
          imageBase64: img.imageBase64,
          filename: img.filename,
          ...(ctx.caseVrm ? { caseVrm: ctx.caseVrm } : {}),
        });
        return {
          plateText: r.plate_text ?? '',
          registrationVisible: r.registration_visible === true,
          vrmMatch: r.vrm_match ?? null,
          confidence: r.confidence ?? null,
        };
      } catch {
        return null;
      }
    },

    async suggestAddress(ctx: CaseContext, images: ImageInput[], hints): Promise<AddressCandidate[] | null> {
      // Only run when location-assist is actionable; otherwise the address stage degrades.
      if (!gates.locationAssistEnabled()) return null;
      try {
        // Enrich photo_refs with inline bytes (the location Function can't read Box directly) —
        // the same on-case, RLS-scoped, capped byte path proxy.ts uses (TKT-077).
        const ids = images.map((i) => i.evidenceId);
        const bytesById = await resolveAssistImageBase64(ids);
        const photo_refs = images.map((i) => {
          const b64 = bytesById.get(i.evidenceId);
          return {
            evidence_id: i.evidenceId,
            ...(i.imageRole ? { image_role: i.imageRole } : {}),
            ...(b64 ? { image_base64: b64 } : {}),
          };
        });
        const text_clues = {
          ...(ctx.accidentCircumstances ? { accident_circumstances: ctx.accidentCircumstances } : {}),
          ...(ctx.claimantAddress ? { claimant_address: ctx.claimantAddress } : {}),
          // Feed the VLM's landmark/signage clues as extra geocode text (business names, road names).
          ...(hints.length ? { photo_location_hints: hints.map((h) => h.detail).join('; ') } : {}),
        };
        const body = {
          case_id: ctx.caseId,
          ...(ctx.casePo ? { case_po: ctx.casePo } : {}),
          photo_refs,
          ...(Object.keys(text_clues).length ? { text_clues } : {}),
          max_candidates: 5,
        };
        const resp = (await callLocationSuggest(body)) as {
          candidates?: Array<{
            label?: string;
            addressLines?: string[];
            postcode?: string;
            confidence?: number;
            evidence?: Array<{ kind: string; detail: string; sourcePhotoRef?: string }>;
            sourcePhotoRef?: string;
          }>;
        };
        const candidates = resp?.candidates ?? [];
        return candidates.map((c) => ({
          label: c.label,
          addressLines: c.addressLines,
          postcode: c.postcode,
          confidence: typeof c.confidence === 'number' ? c.confidence : 0,
          evidence: c.evidence,
          sourcePhotoRef: c.sourcePhotoRef,
        }));
      } catch {
        return null;
      }
    },
  };
}

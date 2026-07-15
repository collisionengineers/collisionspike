/**
 * services/data-api/src/features/assistant/image-analysis.ts — the staged image-analysis suggestion PRODUCER (TKT-016).
 *
 * PURE ORCHESTRATION over injectable adapters — NO network, NO Postgres, NO Azure SDK here, so
 * the whole staged sequence is unit-testable offline against a sample image set (the acceptance
 * proof). The gated HTTP route (services/data-api/src/features/assistant/image-analysis-routes.ts) wires the REAL adapters
 * (the gpt-5 vision call, the fast-alpr /api/plate-ocr call, the location-assist call) and
 * persists each draft as an `ai_suggestion` row; the test injects fakes + fixtures.
 *
 * THE CARDINAL CONSTRAINT — observation-first, suggestion-only, ADDITIVE.
 *   Every output is an `ImageAnalysisDraft` that the route persists as an `ai_suggestion`
 *   (review_state DEFAULT 'pending'). This module NEVER writes `evidence.image_role_code`,
 *   `evidence.registration_visible`, `evidence.excluded`, `case_.vrm`, or any inspection-address
 *   column — the live TKT-064 classifier owns those, and reconciling a suggestion model against
 *   that live auto-writer is TKT-088/112 (operator-blocked, NOT this ticket). Promotion into any
 *   of those columns happens ONLY through the EXISTING human-accept path
 *   (POST /api/ai-suggestions/{id}/review → promoteAcceptedSuggestion, FILL-IF-EMPTY). By
 *   construction this module has no such capability — it returns data, nothing else.
 *   ADR-0013: a detected VRM or address is a suggestion, never an auto-apply; staff pick.
 *
 * The staged sequence (TKT-016 Problem section):
 *   1. confirm the image contains a vehicle                        -> vehicle_present  (per image)
 *   2. confirm the set is all the same vehicle                     -> same_vehicle     (set)
 *   3. detect whether a registration is visible                    -\
 *   4. OCR the reg (LOCAL fast-alpr — TKT-017, never the VLM)       -> registration    (per image)
 *   5. detect background readable items (signs/phones/signage)     -> background_text  (per image)
 *   6. OCR those + attempt geolocation via landmarks               -> location_hint    (set)
 *   7. compare to the address corpus (inside the location adapter) -\
 *   8. best inspection-address suggestion from provider history     -> address_suggestion (set)
 *
 * GRACEFUL DEGRADATION: every stage is independently guarded. A failed/absent adapter yields NO
 * suggestion for that stage (an honest empty), never a crash and never an auto-write. The pipeline
 * always returns; `stageOutcomes` records what happened for the run audit.
 */

import { canonicalizeVrm } from '@cs/domain';

/** The image-analysis observation kinds this producer mints (added to the AiSuggestionType
 *  open vocabulary in @cs/domain). `registration` reuses the existing kind so the existing
 *  fill-if-empty promote branch (evidence.registration_visible) still applies on human accept. */
export const IMAGE_ANALYSIS_SUGGESTION_TYPES = {
  vehiclePresent: 'vehicle_present',
  sameVehicle: 'same_vehicle',
  registration: 'registration',
  backgroundText: 'background_text',
  locationHint: 'location_hint',
  addressSuggestion: 'address_suggestion',
} as const;

const T = IMAGE_ANALYSIS_SUGGESTION_TYPES;

/** The registration visibility tri-state (TKT-017 finding F3 — a garbled read of a PRESENT plate
 *  must be distinguishable from an ABSENT plate; a boolean cannot express that). */
export type RegVisibility = 'visible_readable' | 'visible_unreadable' | 'not_visible';

/** One persisted image the pipeline reasons over (bytes resolved by the caller, blob → Box). */
export interface ImageInput {
  evidenceId: string;
  /** Filename WITH a raster extension (fast-alpr rejects a non-image extension). */
  filename: string;
  imageBase64: string;
  contentType?: string;
  imageRole?: string;
}

/** Minimal, PII-light case context (never a full case dump). */
export interface CaseContext {
  caseId: string;
  casePo?: string;
  /** The case vehicle registration, when known — used ONLY to CROSS-CHECK a read (never written). */
  caseVrm?: string;
  accidentCircumstances?: string;
  claimantAddress?: string;
}

/** Stage 1/3/5/6 — one gpt-5 vision structured observation for ONE image. */
export interface SceneAnalysis {
  vehiclePresent: boolean;
  /** Short free-text descriptor (colour/make/model) — the same-vehicle grouping signal. */
  vehicleDescriptor?: string;
  registrationVisible: boolean;
  visibility: RegVisibility;
  /** The VLM's OWN plate read — a CROSS-CHECK of fast-alpr, never the reader of record. */
  plateTextGuess?: string;
  personReflection?: boolean;
  backgroundItems?: Array<{ text: string; kind: string }>;
  locationHints?: Array<{ detail: string; kind: string }>;
  confidence: number;
}

/** Stage 2 — the set-level same-vehicle judgement. */
export interface SameVehicleResult {
  sameVehicle: boolean;
  confidence: number;
  /** evidence_ids that appear to show a DIFFERENT vehicle (third-party car in frame, etc.). */
  outliers?: string[];
  rationale?: string;
}

/** Stage 4 — the local fast-alpr plate read (the reader of record). */
export interface PlateReadResult {
  plateText: string;
  registrationVisible: boolean;
  vrmMatch?: string | null;
  confidence?: number | null;
}

/** Stage 7/8 — one ranked inspection-address candidate from the location adapter. */
export interface AddressCandidate {
  label?: string;
  addressLines?: string[];
  postcode?: string;
  confidence: number;
  evidence?: Array<{ kind: string; detail: string; sourcePhotoRef?: string }>;
  sourcePhotoRef?: string;
}

/** The injectable stage adapters. The route provides network-backed impls; the test provides
 *  fakes. EACH adapter MAY return null (its dependency is off/unreachable) — the pipeline treats
 *  null and a thrown error identically: that stage degrades to no suggestion. */
export interface ImageAnalysisAdapters {
  /** Stage 1/3/5/6 — gpt-5 vision structured observation per image. */
  analyzeScene(img: ImageInput, ctx: CaseContext): Promise<SceneAnalysis | null>;
  /** Stage 2 — same-vehicle judgement over the per-image descriptors. */
  compareSameVehicle(
    scenes: Array<{ evidenceId: string; descriptor?: string }>,
    ctx: CaseContext,
  ): Promise<SameVehicleResult | null>;
  /** Stage 4 — LOCAL fast-alpr plate read (never the VLM). */
  readPlate(img: ImageInput, ctx: CaseContext): Promise<PlateReadResult | null>;
  /** Stage 7/8 — location-assist candidates (compares to the inspection-address corpus + provider
   *  history internally; proposes, never auto-applies). */
  suggestAddress(
    ctx: CaseContext,
    images: ImageInput[],
    hints: Array<{ detail: string; kind: string; sourcePhotoRef?: string }>,
  ): Promise<AddressCandidate[] | null>;
}

/** One suggestion the pipeline emits — the SAME shape ai-suggestions.ts persists (DraftSuggestion). */
export interface ImageAnalysisDraft {
  suggestionType: string;
  suggestedValue: unknown;
  evidenceId?: string;
  rationale?: string;
  confidence?: number;
  modelVersion?: string;
}

export type StageOutcome = 'ok' | 'empty' | 'degraded' | 'skipped';

export interface PipelineResult {
  drafts: ImageAnalysisDraft[];
  /** Per-stage: 'ok' (≥1 draft), 'empty' (ran, nothing to suggest), 'degraded' (adapter failed),
   *  'skipped' (precondition not met). Feeds the run-level image_analysis_generated audit. */
  stageOutcomes: Record<string, StageOutcome>;
}

export interface RunOptions {
  /** model_version stamp for the VLM scene/same-vehicle drafts (e.g. the deployment name). */
  sceneModelVersion?: string;
  /** model_version stamp for the fast-alpr registration drafts. */
  plateModelVersion?: string;
}

const STAGE_KEYS = [
  T.vehiclePresent,
  T.sameVehicle,
  T.registration,
  T.backgroundText,
  T.locationHint,
  T.addressSuggestion,
] as const;

function clamp01(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/**
 * Run the staged image-analysis sequence and return the observation drafts. PURE: no side effects
 * beyond the injected adapters (which the route makes read-only/idempotent). Never throws.
 */
export async function runImageAnalysis(
  ctx: CaseContext,
  images: ImageInput[],
  adapters: ImageAnalysisAdapters,
  opts: RunOptions = {},
): Promise<PipelineResult> {
  const sceneModel = opts.sceneModelVersion ?? 'gpt-5-vision';
  const plateModel = opts.plateModelVersion ?? 'fast-alpr';
  const stageOutcomes: Record<string, StageOutcome> = {};

  // Buckets keep the emitted drafts in a stable, stage-numbered order.
  const vehicleDrafts: ImageAnalysisDraft[] = [];
  const sameVehicleDrafts: ImageAnalysisDraft[] = [];
  const registrationDrafts: ImageAnalysisDraft[] = [];
  const backgroundDrafts: ImageAnalysisDraft[] = [];
  const locationDrafts: ImageAnalysisDraft[] = [];
  const addressDrafts: ImageAnalysisDraft[] = [];

  if (images.length === 0) {
    for (const k of STAGE_KEYS) stageOutcomes[k] = 'skipped';
    return { drafts: [], stageOutcomes };
  }

  // ---- Stage 1 (+3/5/6 material) — scene analysis per image ----------------------------------
  const scenes: Array<{ img: ImageInput; scene: SceneAnalysis }> = [];
  let sceneFailures = 0;
  for (const img of images) {
    let scene: SceneAnalysis | null = null;
    try {
      scene = await adapters.analyzeScene(img, ctx);
    } catch {
      scene = null;
    }
    if (!scene) {
      sceneFailures += 1;
      continue;
    }
    scenes.push({ img, scene });
    vehicleDrafts.push({
      suggestionType: T.vehiclePresent,
      evidenceId: img.evidenceId,
      suggestedValue: {
        present: scene.vehiclePresent === true,
        descriptor: scene.vehicleDescriptor ?? null,
        personReflection: scene.personReflection === true,
      },
      rationale: scene.vehiclePresent
        ? 'This photo appears to show a vehicle.'
        : 'This photo does not appear to show a vehicle.',
      confidence: clamp01(scene.confidence),
      modelVersion: sceneModel,
    });
  }
  stageOutcomes[T.vehiclePresent] = scenes.length > 0 ? 'ok' : sceneFailures > 0 ? 'degraded' : 'empty';

  // ---- Stage 3+4 — registration observation (VLM visibility tri-state + LOCAL fast-alpr read) --
  // Only images the VLM says show a plate (readable OR unreadable) get a reg read attempt. The
  // fast-alpr read is the reader of record; the VLM's plate_text is a cross-check only.
  const vrmCanon = ctx.caseVrm ? canonicalizeVrm(ctx.caseVrm) : '';
  let regAttempts = 0;
  let regFailures = 0;
  for (const { img, scene } of scenes) {
    if (scene.visibility === 'not_visible' && !scene.registrationVisible) continue;
    regAttempts += 1;
    let read: PlateReadResult | null = null;
    try {
      read = await adapters.readPlate(img, ctx);
    } catch {
      read = null;
    }
    // A read failure on an image the VLM says HAS a plate is a degrade for that image, but we
    // still emit the visibility observation (the tri-state is useful on its own — F3).
    if (!read && scene.visibility !== 'visible_unreadable' && !scene.registrationVisible) {
      regFailures += 1;
      continue;
    }
    if (!read) regFailures += 1;

    const detected = (read?.plateText ?? '').trim();
    const normalised = detected ? canonicalizeVrm(detected) : '';
    const matchesCaseVrm = normalised.length > 0 && vrmCanon.length > 0 && normalised === vrmCanon;
    // Prefer the local reader's visibility; fall back to the VLM's tri-state.
    const visibility: RegVisibility =
      read?.registrationVisible === true
        ? 'visible_readable'
        : scene.visibility === 'visible_readable' && !detected
          ? 'visible_unreadable' // VLM saw it readable but the reader of record could not read it
          : scene.visibility;

    registrationDrafts.push({
      suggestionType: T.registration,
      evidenceId: img.evidenceId,
      suggestedValue: {
        // `visible` is retained for the EXISTING fill-if-empty promote branch
        // (evidence.registration_visible) — human-accept only; never written here.
        visible: read?.registrationVisible === true || visibility === 'visible_readable',
        visibility,
        detectedVrm: detected || null,
        normalisedVrm: normalised || null,
        vlmPlateGuess: (scene.plateTextGuess ?? '').trim() || null,
        matchesCaseVrm,
        reader: 'fast-alpr',
        crossCheck: sceneModel,
      },
      rationale:
        visibility === 'visible_readable'
          ? detected
            ? `A registration reads on this photo${matchesCaseVrm ? ' and matches the case vehicle' : ''}.`
            : 'A registration appears legible on this photo.'
          : visibility === 'visible_unreadable'
            ? 'A registration plate is present but could not be read clearly.'
            : 'No registration is clearly visible on this photo.',
      confidence: clamp01(read?.confidence ?? scene.confidence),
      modelVersion: detected ? plateModel : sceneModel,
    });
  }
  // 'degraded' when the reader of record failed on ≥1 plated image (even though the VLM
  // visibility observation was still emitted — F3), so the run audit reflects the reader miss.
  stageOutcomes[T.registration] =
    regAttempts === 0
      ? 'empty'
      : regFailures > 0
        ? 'degraded'
        : registrationDrafts.length > 0
          ? 'ok'
          : 'empty';

  // ---- Stage 5 — background readable items (signs / phone numbers / signage) -------------------
  let bgImages = 0;
  for (const { img, scene } of scenes) {
    const items = (scene.backgroundItems ?? []).filter((i) => i && typeof i.text === 'string' && i.text.trim());
    if (items.length === 0) continue;
    bgImages += 1;
    backgroundDrafts.push({
      suggestionType: T.backgroundText,
      evidenceId: img.evidenceId,
      suggestedValue: {
        items: items.map((i) => ({ text: i.text.trim(), kind: (i.kind ?? 'text').trim() || 'text' })),
      },
      rationale: `Readable background detail found: ${items
        .map((i) => `"${i.text.trim()}"`)
        .slice(0, 4)
        .join(', ')}.`,
      confidence: clamp01(scene.confidence),
      modelVersion: sceneModel,
    });
  }
  stageOutcomes[T.backgroundText] =
    backgroundDrafts.length > 0 ? 'ok' : scenes.length === 0 ? 'skipped' : 'empty';

  // ---- Stage 6 — location hints from landmarks / signage (aggregated across the set) -----------
  const allHints: Array<{ detail: string; kind: string; sourcePhotoRef?: string }> = [];
  for (const { img, scene } of scenes) {
    for (const h of scene.locationHints ?? []) {
      if (h && typeof h.detail === 'string' && h.detail.trim()) {
        allHints.push({ detail: h.detail.trim(), kind: (h.kind ?? 'photo_location').trim() || 'photo_location', sourcePhotoRef: img.evidenceId });
      }
    }
  }
  if (allHints.length > 0) {
    locationDrafts.push({
      suggestionType: T.locationHint,
      suggestedValue: { hints: allHints },
      rationale: `Possible location clues from the photos: ${allHints
        .map((h) => h.detail)
        .slice(0, 4)
        .join('; ')}.`,
      confidence: clamp01(scenes.reduce((m, s) => Math.max(m, s.scene.confidence), 0)),
      modelVersion: sceneModel,
    });
  }
  stageOutcomes[T.locationHint] = allHints.length > 0 ? 'ok' : scenes.length === 0 ? 'skipped' : 'empty';

  // ---- Stage 2 — same-vehicle over the per-image descriptors -----------------------------------
  const vehicleScenes = scenes.filter((s) => s.scene.vehiclePresent);
  if (vehicleScenes.length >= 2) {
    let sv: SameVehicleResult | null = null;
    try {
      sv = await adapters.compareSameVehicle(
        vehicleScenes.map((s) => ({ evidenceId: s.img.evidenceId, descriptor: s.scene.vehicleDescriptor })),
        ctx,
      );
    } catch {
      sv = null;
    }
    if (sv) {
      sameVehicleDrafts.push({
        suggestionType: T.sameVehicle,
        suggestedValue: {
          sameVehicle: sv.sameVehicle === true,
          outliers: sv.outliers ?? [],
          comparedEvidenceIds: vehicleScenes.map((s) => s.img.evidenceId),
        },
        rationale:
          sv.rationale?.trim() ||
          (sv.sameVehicle
            ? 'The photos appear to show the same vehicle.'
            : 'The photos may show more than one vehicle — please check.'),
        confidence: clamp01(sv.confidence),
        modelVersion: sceneModel,
      });
      stageOutcomes[T.sameVehicle] = 'ok';
    } else {
      stageOutcomes[T.sameVehicle] = 'degraded';
    }
  } else {
    stageOutcomes[T.sameVehicle] = 'skipped'; // need ≥2 vehicle photos to compare
  }

  // ---- Stage 7+8 — ranked inspection-address suggestion (corpus + provider history) ------------
  // The location adapter compares to the inspection_address corpus + provider history internally
  // and returns candidates; we RANK them (confidence desc) and emit the best as ONE
  // address_suggestion. NEVER auto-selected (ADR-0013) — it is a pending suggestion staff pick.
  let addressCandidates: AddressCandidate[] | null = null;
  try {
    addressCandidates = await adapters.suggestAddress(ctx, images, allHints);
  } catch {
    addressCandidates = null;
  }
  if (addressCandidates === null) {
    stageOutcomes[T.addressSuggestion] = 'degraded';
  } else {
    const ranked = [...addressCandidates].sort((a, b) => clamp01(b.confidence) - clamp01(a.confidence));
    if (ranked.length === 0) {
      stageOutcomes[T.addressSuggestion] = 'empty';
    } else {
      const best = ranked[0];
      addressDrafts.push({
        suggestionType: T.addressSuggestion,
        suggestedValue: {
          best: {
            label: best.label ?? null,
            lines: (best.addressLines ?? []).filter((l) => (l ?? '').trim()),
            postcode: (best.postcode ?? '').trim() || null,
            evidence: best.evidence ?? [],
            sourcePhotoRef: best.sourcePhotoRef ?? null,
          },
          // Keep the full ranking so the reviewer can pick a runner-up; ordering only.
          candidates: ranked.map((c) => ({
            label: c.label ?? null,
            lines: (c.addressLines ?? []).filter((l) => (l ?? '').trim()),
            postcode: (c.postcode ?? '').trim() || null,
            confidence: clamp01(c.confidence),
          })),
          autoApplied: false, // explicit: ADR-0013 — never auto-select
        },
        rationale: best.label
          ? `Best inspection-address match from the provider's known sites and the photo/text clues: ${best.label}.`
          : "Best inspection-address match from the provider's known sites and the photo/text clues.",
        confidence: clamp01(best.confidence),
        modelVersion: sceneModel,
      });
      stageOutcomes[T.addressSuggestion] = 'ok';
    }
  }

  const drafts = [
    ...vehicleDrafts,
    ...sameVehicleDrafts,
    ...registrationDrafts,
    ...backgroundDrafts,
    ...locationDrafts,
    ...addressDrafts,
  ];
  return { drafts, stageOutcomes };
}

/* ============================================================
   VLM scene prompt / schema / response parse (pure — the real adapter wires the network around
   these; exported so the schema shape is unit-testable, mirroring aoai.ts / image-classify.ts).
   gpt-5 is a REASONING model — the request carries no temperature/top_p/max_tokens (only
   max_completion_tokens + reasoning_effort); the request-body builder lives in the adapter.
   ============================================================ */

export const SCENE_SYSTEM_PROMPT =
  'You are an expert UK motor-claims vehicle-inspection image analyst. You are shown ONE photo ' +
  'from a case evidence set. Observe ONLY what is visible; never guess a registration, phone ' +
  'number, or place that is not legibly present.\n' +
  'vehicle_present: true if the photo shows a road vehicle (car/van/motorcycle/etc.), else false.\n' +
  'vehicle_descriptor: a SHORT plain phrase for the main vehicle (colour + body + make/model if ' +
  'legible, e.g. "silver Ford Focus hatchback"), or "" if none.\n' +
  'registration_visible: true ONLY if a UK number plate is present AND legibly readable.\n' +
  'visibility: "visible_readable" (a plate is present and readable), "visible_unreadable" (a ' +
  'plate is present but you cannot read the characters), or "not_visible" (no plate).\n' +
  'plate_text: the registration you read (UPPERCASE, no spaces) or "" — this is only a cross-check.\n' +
  'person_reflection: true if a person/face/photographer reflection is visible.\n' +
  'background_items: readable non-vehicle detail in the scene — street signs, business signage, ' +
  'phone numbers, shop names — each { text, kind } (kind ∈ street_sign|business|phone|signage|other).\n' +
  'location_hints: clues that could indicate WHERE the photo was taken — a named landmark, a road ' +
  'name, a distinctive building — each { detail, kind } (kind ∈ landmark|road_name|building|other).\n' +
  'confidence: your honest 0..1 belief in this observation overall.';

/** The strict json_schema for the scene observation (pure; exported for the schema-shape test). */
export function buildSceneResponseSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      vehicle_present: { type: 'boolean' },
      vehicle_descriptor: { type: 'string' },
      registration_visible: { type: 'boolean' },
      visibility: { type: 'string', enum: ['visible_readable', 'visible_unreadable', 'not_visible'] },
      plate_text: { type: 'string' },
      person_reflection: { type: 'boolean' },
      background_items: {
        type: 'array',
        items: {
          type: 'object',
          properties: { text: { type: 'string' }, kind: { type: 'string' } },
          required: ['text', 'kind'],
          additionalProperties: false,
        },
      },
      location_hints: {
        type: 'array',
        items: {
          type: 'object',
          properties: { detail: { type: 'string' }, kind: { type: 'string' } },
          required: ['detail', 'kind'],
          additionalProperties: false,
        },
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: [
      'vehicle_present',
      'vehicle_descriptor',
      'registration_visible',
      'visibility',
      'plate_text',
      'person_reflection',
      'background_items',
      'location_hints',
      'confidence',
    ],
    additionalProperties: false,
  };
}

const VISIBILITY_VALUES = new Set<RegVisibility>(['visible_readable', 'visible_unreadable', 'not_visible']);

/** Parse a 2xx AOAI body's json_schema content into a SceneAnalysis, or null. Never throws.
 *  Exported so the adapter and its test share one parser. */
export function parseSceneResponse(json: unknown): SceneAnalysis | null {
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
  const visibility = typeof c.visibility === 'string' && VISIBILITY_VALUES.has(c.visibility as RegVisibility)
    ? (c.visibility as RegVisibility)
    : c.registration_visible === true
      ? 'visible_readable'
      : 'not_visible';
  const items = Array.isArray(c.background_items)
    ? (c.background_items as unknown[])
        .filter((i): i is { text: string; kind?: string } => !!i && typeof (i as { text?: unknown }).text === 'string')
        .map((i) => ({ text: String(i.text).slice(0, 200), kind: String((i as { kind?: unknown }).kind ?? 'other').slice(0, 40) }))
    : [];
  const hints = Array.isArray(c.location_hints)
    ? (c.location_hints as unknown[])
        .filter((i): i is { detail: string; kind?: string } => !!i && typeof (i as { detail?: unknown }).detail === 'string')
        .map((i) => ({ detail: String(i.detail).slice(0, 200), kind: String((i as { kind?: unknown }).kind ?? 'other').slice(0, 40) }))
    : [];
  return {
    vehiclePresent: c.vehicle_present === true,
    vehicleDescriptor: typeof c.vehicle_descriptor === 'string' ? c.vehicle_descriptor.trim().slice(0, 160) : '',
    registrationVisible: c.registration_visible === true,
    visibility,
    plateTextGuess: typeof c.plate_text === 'string' ? c.plate_text.trim().slice(0, 16) : '',
    personReflection: c.person_reflection === true,
    backgroundItems: items,
    locationHints: hints,
    confidence: clamp01(c.confidence),
  };
}

/* ---- Same-vehicle (stage 2) — text-only prompt over the per-image descriptors (no new image
   egress: it reuses the descriptors stage 1 already produced). ---------------------------------- */

export const SAME_VEHICLE_SYSTEM_PROMPT =
  'You compare short descriptions of vehicles photographed for ONE motor-claim case and judge ' +
  'whether they all describe the SAME vehicle. Answer same_vehicle true/false, list the ids of ' +
  'any that look like a DIFFERENT vehicle in outliers, give a 0..1 confidence and one plain ' +
  'sentence of rationale. Do not invent a registration.';

export function buildSameVehicleResponseSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      same_vehicle: { type: 'boolean' },
      outliers: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      rationale: { type: 'string' },
    },
    required: ['same_vehicle', 'outliers', 'confidence', 'rationale'],
    additionalProperties: false,
  };
}

/** Parse a 2xx AOAI body into a SameVehicleResult, or null. Never throws. */
export function parseSameVehicleResponse(json: unknown): SameVehicleResult | null {
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
  return {
    sameVehicle: c.same_vehicle === true,
    outliers: Array.isArray(c.outliers) ? (c.outliers as unknown[]).filter((s): s is string => typeof s === 'string') : [],
    confidence: clamp01(c.confidence),
    rationale: typeof c.rationale === 'string' ? c.rationale.trim().slice(0, 400) : '',
  };
}

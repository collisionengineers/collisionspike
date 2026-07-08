/**
 * api/src/lib/image-analysis.test.ts — OFFLINE acceptance proof for TKT-016.
 *
 * Runs the staged image-analysis sequence over a SAMPLE image set with INJECTED fake adapters
 * (no network, no Postgres) and proves:
 *   (1) the staged observations + a ranked address suggestion come back AS suggestions
 *       (drafts the route persists with review_state 'pending' — never auto-confirmed);
 *   (2) every stage degrades GRACEFULLY on failure (a failed stage yields no suggestion / an
 *       honest empty, never a crash and never an auto-write);
 *   (3) the CARDINAL non-collision invariant: the pipeline can only produce ai_suggestion drafts
 *       — it has no capability to write evidence.image_role_code / registration_visible / excluded
 *       or case_.vrm (structural: it is a pure function that returns drafts).
 *
 * The sample set is derived from the committed TKT-040 evidence photos (the only real CE vehicle
 * photos in-repo — 4 damage close-ups; one carries a partially-cropped current-style plate). The
 * bytes are irrelevant here (the adapters are fakes keyed on filename), so we use metadata only.
 */

import { describe, it, expect } from 'vitest';
import {
  runImageAnalysis,
  buildSceneResponseSchema,
  buildSameVehicleResponseSchema,
  parseSceneResponse,
  parseSameVehicleResponse,
  IMAGE_ANALYSIS_SUGGESTION_TYPES as T,
  type ImageAnalysisAdapters,
  type ImageInput,
  type CaseContext,
  type SceneAnalysis,
} from './image-analysis.js';

/* ---- the sample image set (TKT-040-derived; metadata only) ---- */
const SAMPLE_IMAGES: ImageInput[] = [
  { evidenceId: 'ev-1', filename: '2_CLVDamage4-V1.jpg', imageBase64: 'AAAA', contentType: 'image/jpeg' },
  { evidenceId: 'ev-2', filename: '3_CLVDamage3-V1.jpg', imageBase64: 'AAAA', contentType: 'image/jpeg' },
  { evidenceId: 'ev-3', filename: '4_CLVDamage2-V1.jpg', imageBase64: 'AAAA', contentType: 'image/jpeg' },
  { evidenceId: 'ev-4', filename: 'CLVDamage5-V1.jpg', imageBase64: 'AAAA', contentType: 'image/jpeg' }, // partial plate
];
const CTX: CaseContext = {
  caseId: 'case-abc',
  casePo: 'HMA26001',
  caseVrm: 'WN14XPZ',
  accidentCircumstances: 'Rear-ended at the junction of Smith Road and the A34.',
  claimantAddress: 'redacted',
};

/** A fully-working fake adapter set (the happy path). ev-4 carries the (partial) plate. */
function goodAdapters(): ImageAnalysisAdapters {
  return {
    async analyzeScene(img): Promise<SceneAnalysis | null> {
      const hasPlate = img.evidenceId === 'ev-4';
      return {
        vehiclePresent: true,
        vehicleDescriptor: 'silver Toyota hatchback',
        registrationVisible: hasPlate,
        visibility: hasPlate ? 'visible_readable' : 'not_visible',
        plateTextGuess: hasPlate ? 'WN14 XPZ' : '',
        personReflection: false,
        backgroundItems: img.evidenceId === 'ev-1' ? [{ text: 'SMITH RECOVERY', kind: 'business' }] : [],
        locationHints: img.evidenceId === 'ev-1' ? [{ detail: 'sign reads Smith Recovery, Acton', kind: 'business' }] : [],
        confidence: 0.8,
      };
    },
    async compareSameVehicle() {
      return { sameVehicle: true, confidence: 0.9, outliers: [], rationale: 'All photos show the same silver hatchback.' };
    },
    async readPlate(img) {
      return img.evidenceId === 'ev-4'
        ? { plateText: 'WN14XPZ', registrationVisible: true, vrmMatch: 'WN14XPZ', confidence: 0.87 }
        : { plateText: '', registrationVisible: false, vrmMatch: null, confidence: null };
    },
    async suggestAddress() {
      return [
        { label: 'Smith Recovery, Acton', addressLines: ['Unit 4', 'Acton'], postcode: 'W3 7QE', confidence: 0.72, evidence: [{ kind: 'photo_sign', detail: 'sign reads Smith Recovery' }] },
        { label: 'Depot 2', addressLines: ['Depot 2'], postcode: 'W3 0AA', confidence: 0.4 },
      ];
    },
  };
}

const byType = <D extends { suggestionType: string }>(drafts: D[], type: string): D[] =>
  drafts.filter((d) => d.suggestionType === type);

describe('runImageAnalysis — staged sequence (TKT-016 acceptance)', () => {
  it('returns the staged observations + a ranked address suggestion, all as pending-bound drafts', async () => {
    const { drafts, stageOutcomes } = await runImageAnalysis(CTX, SAMPLE_IMAGES, goodAdapters());

    // Stage 1 — one vehicle_present per image.
    expect(byType(drafts, T.vehiclePresent)).toHaveLength(4);
    // Stage 2 — one set-level same_vehicle.
    const sv = byType(drafts, T.sameVehicle);
    expect(sv).toHaveLength(1);
    expect((sv[0].suggestedValue as { sameVehicle: boolean }).sameVehicle).toBe(true);
    // Stage 3+4 — one registration observation for the plated image, carrying the tri-state + read.
    const reg = byType(drafts, T.registration);
    expect(reg).toHaveLength(1);
    const regVal = reg[0].suggestedValue as { visibility: string; detectedVrm: string; matchesCaseVrm: boolean; reader: string };
    expect(regVal.visibility).toBe('visible_readable');
    expect(regVal.detectedVrm).toBe('WN14XPZ');
    expect(regVal.matchesCaseVrm).toBe(true);
    expect(regVal.reader).toBe('fast-alpr'); // reg reader of record is fast-alpr, NOT the VLM
    // Stage 5 — background_text for the image with signage.
    expect(byType(drafts, T.backgroundText)).toHaveLength(1);
    // Stage 6 — one aggregated location_hint.
    expect(byType(drafts, T.locationHint)).toHaveLength(1);
    // Stage 7+8 — one ranked address_suggestion, best-first, NEVER auto-applied.
    const addr = byType(drafts, T.addressSuggestion);
    expect(addr).toHaveLength(1);
    const addrVal = addr[0].suggestedValue as { autoApplied: boolean; candidates: { confidence: number }[]; best: { label: string } };
    expect(addrVal.autoApplied).toBe(false);
    expect(addrVal.best.label).toBe('Smith Recovery, Acton');
    expect(addrVal.candidates[0].confidence).toBeGreaterThanOrEqual(addrVal.candidates[1].confidence); // ranked desc

    // Every stage ran cleanly.
    expect(stageOutcomes).toMatchObject({
      [T.vehiclePresent]: 'ok',
      [T.sameVehicle]: 'ok',
      [T.registration]: 'ok',
      [T.backgroundText]: 'ok',
      [T.locationHint]: 'ok',
      [T.addressSuggestion]: 'ok',
    });

    // CARDINAL invariant: the pipeline emits ONLY ai_suggestion drafts (no evidence/case column
    // write is even representable) — every draft is one of the known suggestion kinds.
    const allowed = new Set(Object.values(T));
    for (const d of drafts) expect(allowed.has(d.suggestionType as never)).toBe(true);
    // And no draft carries a review_state — that is set by the DB DEFAULT 'pending' at persist,
    // so a draft can NEVER arrive pre-accepted.
    for (const d of drafts) expect('reviewState' in (d as object)).toBe(false);
  });

  it('degrades gracefully when the VLM scene stage fails entirely (no crash, honest empties)', async () => {
    const adapters = { ...goodAdapters(), analyzeScene: async () => null };
    const { drafts, stageOutcomes } = await runImageAnalysis(CTX, SAMPLE_IMAGES, adapters);
    // No scenes → no per-image observations, and same_vehicle/registration/background/location empty.
    expect(byType(drafts, T.vehiclePresent)).toHaveLength(0);
    expect(byType(drafts, T.registration)).toHaveLength(0);
    expect(stageOutcomes[T.vehiclePresent]).toBe('degraded');
    expect(stageOutcomes[T.sameVehicle]).toBe('skipped'); // <2 vehicle scenes
    // The address stage is independent (its own adapter) — it can still produce.
    expect(byType(drafts, T.addressSuggestion)).toHaveLength(1);
  });

  it('a throwing scene adapter is caught, not propagated', async () => {
    const adapters = { ...goodAdapters(), analyzeScene: async () => { throw new Error('AOAI 500'); } };
    await expect(runImageAnalysis(CTX, SAMPLE_IMAGES, adapters)).resolves.toBeDefined();
  });

  it('reg tri-state (F3): a plate the VLM sees but fast-alpr cannot read → visible_unreadable, no VRM', async () => {
    const adapters: ImageAnalysisAdapters = {
      ...goodAdapters(),
      analyzeScene: async (img) => ({
        vehiclePresent: true,
        vehicleDescriptor: 'car',
        registrationVisible: img.evidenceId === 'ev-4',
        visibility: img.evidenceId === 'ev-4' ? 'visible_readable' : 'not_visible',
        plateTextGuess: '',
        personReflection: false,
        backgroundItems: [],
        locationHints: [],
        confidence: 0.6,
      }),
      readPlate: async () => { throw new Error('fast-alpr unreachable'); }, // reader of record fails
    };
    const { drafts, stageOutcomes } = await runImageAnalysis(CTX, SAMPLE_IMAGES, adapters);
    const reg = byType(drafts, T.registration);
    expect(reg).toHaveLength(1);
    const v = reg[0].suggestedValue as { visibility: string; detectedVrm: string | null; visible: boolean };
    expect(v.visibility).toBe('visible_unreadable'); // present-but-unreadable, not absent
    expect(v.detectedVrm).toBeNull();
    expect(v.visible).toBe(false);
    expect(stageOutcomes[T.registration]).toBe('degraded');
  });

  it('address stage degrades to no draft when the location adapter is unavailable (null) or empty ([])', async () => {
    const nullAddr = { ...goodAdapters(), suggestAddress: async () => null };
    const r1 = await runImageAnalysis(CTX, SAMPLE_IMAGES, nullAddr);
    expect(byType(r1.drafts, T.addressSuggestion)).toHaveLength(0);
    expect(r1.stageOutcomes[T.addressSuggestion]).toBe('degraded');

    const emptyAddr = { ...goodAdapters(), suggestAddress: async () => [] };
    const r2 = await runImageAnalysis(CTX, SAMPLE_IMAGES, emptyAddr);
    expect(byType(r2.drafts, T.addressSuggestion)).toHaveLength(0);
    expect(r2.stageOutcomes[T.addressSuggestion]).toBe('empty');
  });

  it('no images → every stage skipped, zero drafts (honest no-op input)', async () => {
    const { drafts, stageOutcomes } = await runImageAnalysis(CTX, [], goodAdapters());
    expect(drafts).toHaveLength(0);
    for (const k of Object.values(T)) expect(stageOutcomes[k]).toBe('skipped');
  });

  it('a detected VRM never claims to be the case identity — it is a suggestion carrying matchesCaseVrm only', async () => {
    // A read that does NOT match the case VRM must still land as a suggestion (never overwrites vrm).
    const adapters = { ...goodAdapters(), readPlate: async (img: ImageInput) =>
      img.evidenceId === 'ev-4' ? { plateText: 'XX99YYY', registrationVisible: true, vrmMatch: null, confidence: 0.9 } : { plateText: '', registrationVisible: false, vrmMatch: null, confidence: null } };
    const { drafts } = await runImageAnalysis(CTX, SAMPLE_IMAGES, adapters);
    const reg = byType(drafts, T.registration)[0].suggestedValue as { detectedVrm: string; matchesCaseVrm: boolean };
    expect(reg.detectedVrm).toBe('XX99YYY');
    expect(reg.matchesCaseVrm).toBe(false); // flagged as NOT the case vehicle — staff decide
  });
});

describe('image-analysis VLM response contracts (schema shape + parse)', () => {
  it('the scene json_schema is strict and requires every observed field', () => {
    const s = buildSceneResponseSchema() as { additionalProperties: boolean; required: string[] };
    expect(s.additionalProperties).toBe(false);
    expect(s.required).toEqual(
      expect.arrayContaining(['vehicle_present', 'registration_visible', 'visibility', 'plate_text', 'background_items', 'location_hints', 'confidence']),
    );
  });

  it('parseSceneResponse maps a well-formed body and clamps confidence; a garbled body → null', () => {
    const ok = parseSceneResponse({
      choices: [{ message: { content: JSON.stringify({
        vehicle_present: true, vehicle_descriptor: 'red van', registration_visible: false,
        visibility: 'not_visible', plate_text: '', person_reflection: false,
        background_items: [{ text: '0800 123', kind: 'phone' }], location_hints: [], confidence: 1.4,
      }) } }],
    });
    expect(ok?.vehiclePresent).toBe(true);
    expect(ok?.confidence).toBe(1); // clamped
    expect(ok?.backgroundItems?.[0]).toEqual({ text: '0800 123', kind: 'phone' });
    expect(parseSceneResponse({ choices: [{ message: { content: 'not json' } }] })).toBeNull();
    expect(parseSceneResponse({ choices: [{ finish_reason: 'content_filter' }] })).toBeNull();
  });

  it('parseSameVehicleResponse maps a body and the same-vehicle schema is strict', () => {
    const sv = parseSameVehicleResponse({
      choices: [{ message: { content: JSON.stringify({ same_vehicle: false, outliers: ['ev-3'], confidence: 0.5, rationale: 'ev-3 is a different colour.' }) } }],
    });
    expect(sv?.sameVehicle).toBe(false);
    expect(sv?.outliers).toEqual(['ev-3']);
    expect((buildSameVehicleResponseSchema() as { additionalProperties: boolean }).additionalProperties).toBe(false);
  });
});

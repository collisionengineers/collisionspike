import { describe, it, expect } from 'vitest';
import {
  adaptLocationAssistResponse,
  buildEvidenceNote,
  buildSuggestLocationRequest,
  candidateToSuggestion,
  friendlyEvidenceKind,
  locationAssistErrors,
  suggestLocations,
  LOCATION_ASSIST_CONTRACT_VERSION,
  type LocationAssistTransport,
  type SuggestLocationResponse,
} from './location-assist-client';

/* The location-assist client is the web app's pure bridge between the
   location service response and the SuggestedAddress domain shape
   the Address tab renders. These tests pin the load-bearing rules:
     - the casing bridge (snake_case request -> camelCase response -> domain),
     - PLAIN-language provenance only (the internal kind enum NEVER leaks),
     - ADR-0013: a candidate is a SUGGESTION — adapting it NEVER confirms/applies it.
   A CANNED response keeps the test offline while exercising the real wire shape. */

const LIVE_SUCCESS: SuggestLocationResponse = {
  candidates: [
    {
      label: 'Smith Recovery, Acton',
      addressLines: ['Smith Recovery', '12 Bollo Lane', 'Acton', '', '', ''],
      postcode: 'W3 8QN',
      confidence: 0.82,
      evidence: [
        { kind: 'photo_sign', detail: "sign reads 'Smith Recovery'", sourcePhotoRef: 'ev-1' },
        { kind: 'near_accident', detail: 'near the accident location' },
      ],
      sourcePhotoRef: 'ev-1',
    },
    {
      label: 'Acton Vehicle Centre',
      addressLines: ['Acton Vehicle Centre', 'Park Road East'],
      postcode: 'W3 7QN',
      confidence: 0.51,
      evidence: [{ kind: 'corpus_match', detail: 'close to a known repairer' }],
    },
  ],
  noConfidentLocation: false,
  issues: [],
  contract_version: LOCATION_ASSIST_CONTRACT_VERSION,
};

const ZERO_CANDIDATES: SuggestLocationResponse = {
  candidates: [],
  noConfidentLocation: true,
  issues: [],
  contract_version: LOCATION_ASSIST_CONTRACT_VERSION,
};

const ERROR_ENVELOPE: SuggestLocationResponse = {
  candidates: [],
  noConfidentLocation: true,
  issues: [
    { field: '(request)', severity: 'error', code: 'photos_unreadable', message: 'No photo could be read.' },
  ],
  contract_version: LOCATION_ASSIST_CONTRACT_VERSION,
};

describe('friendlyEvidenceKind — plain language only (no engineering terms)', () => {
  it('maps photo kinds to "Suggested from the photos"', () => {
    expect(friendlyEvidenceKind('photo_sign')).toBe('Suggested from the photos');
    expect(friendlyEvidenceKind('photo_landmark')).toBe('Suggested from the photos');
    expect(friendlyEvidenceKind('photo_location')).toBe('Suggested from the photos');
  });
  it('maps geocode kinds to plain location phrases', () => {
    expect(friendlyEvidenceKind('near_accident')).toBe('Near the accident location');
    expect(friendlyEvidenceKind('near_claimant')).toBe('Near the claimant address');
    expect(friendlyEvidenceKind('corpus_match')).toBe('Close to a known repairer');
  });
  it('omits an unknown kind rather than leaking a raw code', () => {
    expect(friendlyEvidenceKind('vision_ocr')).toBeUndefined();
    expect(friendlyEvidenceKind(undefined)).toBeUndefined();
  });
  it('never returns a string containing an engineering term', () => {
    const banned = /(gpt|llm|model|api|function|azure|vision|ocr|geocode|adr|m1|m2|m3)/i;
    for (const k of ['photo_sign', 'photo_landmark', 'near_accident', 'near_claimant', 'corpus_match']) {
      const phrase = friendlyEvidenceKind(k);
      expect(phrase).toBeDefined();
      expect(banned.test(phrase!)).toBe(false);
    }
  });
});

describe('buildEvidenceNote', () => {
  it('joins friendly kind + plain detail, de-duplicated', () => {
    const note = buildEvidenceNote([
      { kind: 'photo_sign', detail: "sign reads 'Smith Recovery'" },
      { kind: 'photo_sign', detail: "sign reads 'Smith Recovery'" }, // dup dropped
      { kind: 'near_accident', detail: 'near the accident location' },
    ]);
    expect(note).toBe(
      "Suggested from the photos — sign reads 'Smith Recovery'\nNear the accident location — near the accident location",
    );
  });
  it('is empty for no evidence', () => {
    expect(buildEvidenceNote(undefined)).toBe('');
    expect(buildEvidenceNote([])).toBe('');
  });
});

describe('candidateToSuggestion — candidate -> SuggestedAddress (a suggestion, not a decision)', () => {
  it('maps lines/postcode/confidence/label and stamps source:assist', () => {
    const s = candidateToSuggestion(LIVE_SUCCESS.candidates[0], 0);
    expect(s.lines).toEqual(['Smith Recovery', '12 Bollo Lane', 'Acton']); // blanks trimmed
    expect(s.postcode).toBe('W3 8QN');
    expect(s.confidence).toBe(0.82);
    expect(s.label).toBe('Smith Recovery, Acton');
    expect(s.source).toBe('assist');
    expect(s.confidenceBand).toBe('assist');
    expect(s.sourcePhotoRef).toBe('ev-1');
  });
  it('carries a plain-language evidence note (no raw kinds)', () => {
    const s = candidateToSuggestion(LIVE_SUCCESS.candidates[0], 0);
    expect(s.evidenceNote).toContain('Suggested from the photos');
    expect(s.evidenceNote).not.toMatch(/photo_sign|near_accident/);
  });
  it('uses a SYNTHETIC id (never a real persisted row id) — ADR-0013', () => {
    // The id is index-based: a candidate is never a persisted row.
    expect(candidateToSuggestion(LIVE_SUCCESS.candidates[0], 0).id).toBe('assist-0');
    expect(candidateToSuggestion(LIVE_SUCCESS.candidates[1], 1).id).toBe('assist-1');
  });
});

describe('adaptLocationAssistResponse', () => {
  it('preserves the Function ordering (confidence desc is the Function\'s job)', () => {
    const r = adaptLocationAssistResponse(LIVE_SUCCESS);
    expect(r.suggestions.map((s) => s.label)).toEqual(['Smith Recovery, Acton', 'Acton Vehicle Centre']);
    expect(r.noConfidentLocation).toBe(false);
  });
  it('reports noConfidentLocation for a zero-candidate envelope', () => {
    const r = adaptLocationAssistResponse(ZERO_CANDIDATES);
    expect(r.suggestions).toHaveLength(0);
    expect(r.noConfidentLocation).toBe(true);
  });
  it('keeps noConfidentLocation false whenever candidates exist (mutually consistent)', () => {
    const inconsistent: SuggestLocationResponse = { ...LIVE_SUCCESS, noConfidentLocation: true };
    expect(adaptLocationAssistResponse(inconsistent).noConfidentLocation).toBe(false);
  });
});

describe('locationAssistErrors', () => {
  it('returns error-severity issues only', () => {
    expect(locationAssistErrors(ERROR_ENVELOPE)).toHaveLength(1);
    expect(locationAssistErrors(LIVE_SUCCESS)).toHaveLength(0);
  });
});

describe('buildSuggestLocationRequest — snake_case, from already-loaded data', () => {
  it('maps photos -> photo_refs (snake_case keys) and text -> text_clues', () => {
    const req = buildSuggestLocationRequest({
      caseId: 'case-guid',
      casePo: 'CCPY26050',
      photos: [
        { id: 'ev-1', boxFileId: 'box-1', fileName: 'overview.jpg', imageRole: 'overview' },
        { id: 'ev-2', fileName: 'damage.jpg', imageRole: 'damage_closeup' },
      ],
      accidentCircumstances: 'Collision on the A40 near Acton',
      claimantAddress: '5 Elm Road, London',
    });
    expect(req.case_id).toBe('case-guid');
    expect(req.case_po).toBe('CCPY26050');
    expect(req.photo_refs).toEqual([
      { evidence_id: 'ev-1', box_file_id: 'box-1', filename: 'overview.jpg', image_role: 'overview' },
      { evidence_id: 'ev-2', filename: 'damage.jpg', image_role: 'damage_closeup' },
    ]);
    expect(req.text_clues).toEqual({
      accident_circumstances: 'Collision on the A40 near Acton',
      claimant_address: '5 Elm Road, London',
    });
    expect(req.contract_version).toBe(LOCATION_ASSIST_CONTRACT_VERSION);
  });

  it('tolerates an empty photo set + no text (text-clue-less run is valid)', () => {
    const req = buildSuggestLocationRequest({ caseId: 'c1', photos: [] });
    expect(req.photo_refs).toEqual([]);
    expect(req.text_clues).toBeUndefined();
    expect(req.case_po).toBeUndefined();
  });

  it('omits a blank/whitespace clue', () => {
    const req = buildSuggestLocationRequest({
      caseId: 'c1',
      photos: [],
      accidentCircumstances: '   ',
      claimantAddress: '',
    });
    expect(req.text_clues).toBeUndefined();
  });
});

describe('suggestLocations — public call via an injected transport (no network)', () => {
  it('adapts a response through the injected transport', async () => {
    const transport: LocationAssistTransport = async (req) => {
      expect(req.case_id).toBe('case-guid');
      return LIVE_SUCCESS;
    };
    const r = await suggestLocations(
      buildSuggestLocationRequest({ caseId: 'case-guid', photos: [] }),
      transport,
    );
    expect(r.suggestions).toHaveLength(2);
    expect(r.suggestions[0].source).toBe('assist');
  });

  it('INVARIANT: adapting NEVER confirms/applies — every candidate stays a suggestion', async () => {
    const transport: LocationAssistTransport = async () => LIVE_SUCCESS;
    const r = await suggestLocations(buildSuggestLocationRequest({ caseId: 'c', photos: [] }), transport);
    // No candidate carries any "confirmed"/"applied"/decisionMode marker — the
    // domain SuggestedAddress has no such field, and source is always 'assist'.
    for (const s of r.suggestions) {
      expect(s.source).toBe('assist');
      expect('decisionMode' in s).toBe(false);
      expect('confirmed' in s).toBe(false);
      // The synthetic id proves the candidate is not persisted.
      expect(s.id.startsWith('assist-')).toBe(true);
    }
  });
});

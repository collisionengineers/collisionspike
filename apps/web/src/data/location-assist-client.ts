/* Location-suggestion response adapter and injectable transport. Candidates are
   proposals only: a person must confirm one before it enters the case draft.
   Internal evidence kinds are always translated into handler-facing phrases. */

import type { SuggestedAddress } from '@cs/domain';

/* ============================================================
   1. The wire contract (ce_location_suggest_v1).
   ============================================================ */

/** The pinned contract version stamped on every Function response (success + error). */
export const LOCATION_ASSIST_CONTRACT_VERSION = 'ce_location_suggest_v1';

/** One photo reference supplied with a suggestion request. */
export interface PhotoRef {
  /** Stable evidence identifier. */
  evidence_id: string;
  /** Archive file identifier when available. */
  box_file_id?: string;
  filename?: string;
  /** 'overview' | 'damage_closeup' | other. */
  image_role?: string;
}

/** Free-text geolocation clues drawn from the case (request, snake_case). */
export interface TextClues {
  /** Accident circumstances used for a best-effort place or postcode clue. */
  accident_circumstances?: string;
  /** Claimant address used as a location clue. */
  claimant_address?: string;
}

/** The location-suggest request (snake_case, matching the parser service wire style). */
export interface SuggestLocationRequest {
  /** Case identifier used only for correlation. */
  case_id: string;
  /** UPPERCASE Case/PO (e.g. CCPY26050) — log correlation + Box folder hint only. */
  case_po?: string;
  /** Selected non-excluded image Evidence; may be empty (text-only run). */
  photo_refs: PhotoRef[];
  text_clues?: TextClues;
  /** default 5; the Function clamps to 1..10. */
  max_candidates?: number;
  /** Request the DEEP AI vision-reasoning escalation (TKT-078). Honest no-op unless the
   *  escalation is gated on + configured server-side. */
  deep?: boolean;
  /** echoed; the server pins its own on the response. */
  contract_version?: string;
}

/** Internal provenance kind on a candidate's evidence (NEVER rendered raw). */
export type LocationEvidenceKind =
  | 'photo_sign'
  | 'photo_landmark'
  | 'photo_location'
  | 'near_accident'
  | 'near_claimant'
  | 'corpus_match'
  | string;

/** One provenance item on a candidate (PLAIN business language only in `detail`). */
export interface LocationEvidenceItem {
  kind: LocationEvidenceKind;
  /** Plain-language detail (e.g. "sign reads 'Smith Recovery'", 'near the accident location'). */
  detail: string;
  /** evidence_id of the photo this clue came from, if any. */
  sourcePhotoRef?: string;
}

/** One suggested location candidate (response body, camelCase). */
export interface LocationCandidate {
  /** Short human label (e.g. 'Smith Recovery, Acton'). */
  label: string;
  /** 0..6 address lines (blanks trimmed). */
  addressLines?: string[];
  /** Normalised UK postcode, if Maps returned one. */
  postcode?: string;
  /** 0..1; drives ORDERING only — NEVER auto-select. */
  confidence: number;
  /** Provenance (plain-language detail). */
  evidence?: LocationEvidenceItem[];
  /** Convenience mirror of the top evidence[].sourcePhotoRef. */
  sourcePhotoRef?: string;
}

/** A request/parse issue carried in-band (soft failures), mirrors the parser. */
export interface LocationAssistIssue {
  field: string;
  severity: 'error' | 'warning' | string;
  code: string;
  message: string;
}

/** The full location-suggest response envelope (stable shape; soft failures in-band). */
export interface SuggestLocationResponse {
  /** Candidates ordered by confidence desc (ties: more evidence first). */
  candidates: LocationCandidate[];
  /** true when zero candidates clear the floor (UI shows the muted "no location" line). */
  noConfidentLocation: boolean;
  issues?: LocationAssistIssue[];
  contract_version: string;
}

/** Injectable transport so the unit test maps a canned response without network. */
export type LocationAssistTransport = (
  req: SuggestLocationRequest,
) => Promise<SuggestLocationResponse>;

/* ============================================================
   2. Plain-language provenance mapping (the internal kind enum NEVER leaks).
   ============================================================ */

/** Map an internal evidence kind -> a plain business phrase. Unknown -> undefined
 *  (omit rather than show a raw code). NEVER returns an engineering term. */
export function friendlyEvidenceKind(kind: LocationEvidenceKind | undefined): string | undefined {
  switch (kind) {
    case 'photo_sign':
    case 'photo_landmark':
    case 'photo_location':
      return 'Suggested from the photos';
    case 'ai_reasoning':
      return 'Suggested from a deeper photo analysis';
    case 'near_accident':
      return 'Near the accident location';
    case 'near_claimant':
      return 'Near the claimant address';
    case 'corpus_match':
      return 'Close to a known repairer';
    default:
      return undefined;
  }
}

/**
 * Build the plain-language provenance note shown in the suggestion tooltip from a
 * candidate's evidence. Each item renders as its friendly kind phrase plus the
 * Function-supplied plain `detail` (the Function MUST NOT emit engineering terms).
 * De-duplicated, newline-joined; empty when there is no usable evidence.
 */
export function buildEvidenceNote(evidence: readonly LocationEvidenceItem[] | undefined): string {
  if (!evidence || evidence.length === 0) return '';
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const e of evidence) {
    const phrase = friendlyEvidenceKind(e.kind);
    const detail = (e.detail ?? '').trim();
    const line = [phrase, detail].filter(Boolean).join(' — ');
    if (line && !seen.has(line)) {
      seen.add(line);
      lines.push(line);
    }
  }
  return lines.join('\n');
}

/* ============================================================
   3. Whole-response adapter — candidate -> SuggestedAddress.

   Each candidate becomes a `SuggestedAddress` so it renders through the EXISTING
   `SuggestedLocationRow` (same "Suggested" tint badge, evidence Tooltip, and
   "Use this address" action) identically to a corpus suggestion. `source:'assist'`
   marks the origin so the screen records the right provenance on confirm; it does
   NOT make the row anything other than a suggestion the reviewer must confirm.
   ============================================================ */

/** Map one Function candidate -> the `SuggestedAddress` domain shape. */
export function candidateToSuggestion(
  candidate: LocationCandidate,
  index: number,
): SuggestedAddress {
  const lines = (candidate.addressLines ?? [])
    .map((l) => (l ?? '').trim())
    .filter((l) => l.length > 0);
  const evidenceNote = buildEvidenceNote(candidate.evidence);
  // A short, plain confidence-band label so the tooltip carries an origin line —
  // 'assist' maps to "Suggested from the photos" via friendlyBand in the screen.
  return {
    // The candidate is NOT a persisted row; this synthetic id only keys the React
    // list and de-duplicates picks. It is never persisted automatically.
    id: `assist-${index}`,
    lines,
    postcode: (candidate.postcode ?? '').trim(),
    source: 'assist',
    confidence: candidate.confidence,
    ...(candidate.label ? { label: candidate.label.trim() } : {}),
    ...(evidenceNote ? { evidenceNote } : {}),
    confidenceBand: 'assist',
    ...(candidate.sourcePhotoRef ? { sourcePhotoRef: candidate.sourcePhotoRef } : {}),
  };
}

/** The adapted result the screen consumes. */
export interface LocationAssistResult {
  /** Candidates as `SuggestedAddress` rows, in the Function's returned order
   *  (confidence desc; the Function owns ordering). */
  suggestions: SuggestedAddress[];
  /** true when the Function found no confident location (UI shows the muted line). */
  noConfidentLocation: boolean;
  /** Any error-severity issues to surface (warnings are informational). */
  issues: LocationAssistIssue[];
}

/** Adapt a location-suggest response to the suggestion shapes the Address tab renders. */
export function adaptLocationAssistResponse(
  resp: SuggestLocationResponse,
): LocationAssistResult {
  const candidates = resp.candidates ?? [];
  return {
    suggestions: candidates.map((c, i) => candidateToSuggestion(c, i)),
    // Mutually consistent, enforced HERE defensively: an empty candidate set ALWAYS
    // means "no confident location" (even if a malformed envelope claims otherwise),
    // and a non-empty set never does. The Function already guarantees this — we don't
    // rely on it, so the UI never shows an empty panel with no explanatory line.
    noConfidentLocation: candidates.length === 0,
    issues: resp.issues ?? [],
  };
}

/** Error-severity issues in a response — non-empty means the request failed. */
export function locationAssistErrors(
  resp: SuggestLocationResponse,
): LocationAssistIssue[] {
  return (resp.issues ?? []).filter((i) => i.severity === 'error');
}

/* ============================================================
   4. Request builder — assembled from data already loaded on CaseDetail.

   photo_refs come from the case's non-excluded image Evidence; text_clues from
   the accident-circumstances EVA field + the new claimant-address field. No
   network, no SDK — pure shaping, so it is unit-testable.
   ============================================================ */

/** The already-loaded case inputs the screen passes in (kept SDK/React-free). */
export interface LocationAssistInputs {
  caseId: string;
  casePo?: string;
  /** Non-excluded image Evidence the reviewer is looking at. */
  photos: readonly {
    id: string;
    boxFileId?: string;
    fileName?: string;
    imageRole?: string;
  }[];
  /** Verbatim EVA field 8 free text (accident circumstances). */
  accidentCircumstances?: string;
  /** Verbatim claimant postal address (the new clue field). */
  claimantAddress?: string;
  /** default 5; the Function clamps 1..10. */
  maxCandidates?: number;
  /** request the deeper AI vision-reasoning escalation (TKT-078). */
  deep?: boolean;
}

/** Build a `SuggestLocationRequest` from already-loaded CaseDetail data. */
export function buildSuggestLocationRequest(
  inputs: LocationAssistInputs,
): SuggestLocationRequest {
  const photo_refs: PhotoRef[] = inputs.photos.map((p) => ({
    evidence_id: p.id,
    ...(p.boxFileId ? { box_file_id: p.boxFileId } : {}),
    ...(p.fileName ? { filename: p.fileName } : {}),
    ...(p.imageRole ? { image_role: p.imageRole } : {}),
  }));
  const accident = (inputs.accidentCircumstances ?? '').trim();
  const claimant = (inputs.claimantAddress ?? '').trim();
  const text_clues: TextClues = {
    ...(accident ? { accident_circumstances: accident } : {}),
    ...(claimant ? { claimant_address: claimant } : {}),
  };
  return {
    case_id: inputs.caseId,
    ...(inputs.casePo ? { case_po: inputs.casePo } : {}),
    photo_refs,
    ...(accident || claimant ? { text_clues } : {}),
    ...(inputs.maxCandidates != null ? { max_candidates: inputs.maxCandidates } : {}),
    ...(inputs.deep ? { deep: true } : {}),
    contract_version: LOCATION_ASSIST_CONTRACT_VERSION,
  };
}

/* ============================================================
   5. The public call. The live transport (CSP-safe, via the CE Location Assist
      transport) is injected by the caller; the unit test injects a fake.
   ============================================================ */

/**
 * Request candidate locations and adapt the result. `transport` is REQUIRED: the
 * app passes the authenticated transport; the unit test injects a fake. Throws
 * on transport failure; Function-level errors are carried in the returned `issues`
 * (with `noConfidentLocation: true`). NOTHING here applies a candidate — the
 * reviewer confirms in the UI (ADR-0013).
 */
export async function suggestLocations(
  req: SuggestLocationRequest,
  transport: LocationAssistTransport,
): Promise<LocationAssistResult> {
  const resp = await transport(req);
  return adaptLocationAssistResponse(resp);
}

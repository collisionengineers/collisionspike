/**
 * parser-eva-fields — pure mapping + constraint-guarding for persisting parser-extracted
 * EVA fields onto a case (email-intake fill-if-empty).
 *
 * The orchestration `parse` activity extracts ALL 12 EVA fields from the instruction
 * document, but historically intake forwarded only VRM / case_ref / mileage to the
 * Data API — so a case minted from email showed its registration + Case/PO and nothing
 * else (claimant, dates, vehicle, circumstances all blank). This module selects the
 * parser-OWNED subset of the EVA fields and guards each value against the `case_` EVA
 * column CHECK constraints, so a malformed parser value can never break the intake
 * UPDATE (a bad date / non-Yes/No VAT is silently skipped, not persisted).
 *
 * EXCLUDED on purpose (owned elsewhere — never overwritten from the document here):
 *   - inspection_address — owned by the offline corpus picker (ADR-0013: staff pick/edit;
 *                          there is no runtime address auto-fill).
 *   - mileage / mileage_unit — carried + persisted separately (parserMileage/Unit) with
 *                          their own unit normalization and provenance.
 *
 * `work_provider` is forwarded from the parser when present; when absent/UNKNOWN the Data
 * API may still fill `eva_work_provider` from the matched corpus `display_name` (see
 * applyParserFields in internal.ts).
 *
 * `provenanceField` is the camelCase EVA_FIELD_ORDER key the field_level_provenance table
 * uses for field_name (see migration/assets/schema/070_field_level_provenance.sql).
 */

/** The parser-owned EVA fields forwarded from the orchestration parse activity (value-only). */
export interface ParserEvaFields {
  work_provider?: string;
  vehicle_model?: string;
  claimant_name?: string;
  claimant_telephone?: string;
  claimant_email?: string;
  date_of_loss?: string;
  date_of_instruction?: string;
  accident_circumstances?: string;
  vat_status?: string;
}

/** A constraint-validated, length-capped value ready for a fill-if-empty UPDATE. */
export interface ParserEvaCandidate {
  /** The `case_` table column to fill. */
  column: string;
  /** camelCase field_name for the field_level_provenance row. */
  provenanceField: string;
  /** The validated value (already trimmed, length-capped, constraint-checked). */
  value: string;
}

const DDMMYYYY = /^\d{2}\/\d{2}\/\d{4}$/;

/** Parser sentinel when provider detection did not resolve a name — treat as empty. */
export function isUnknownWorkProviderSentinel(raw: string): boolean {
  return raw.trim().toUpperCase() === 'UNKNOWN';
}

/**
 * EVA contract key → column + provenance field + a normalizer that returns the value to
 * persist or '' to SKIP (failed a column CHECK constraint). Order is the EVA contract order.
 */
const SPEC: Record<
  keyof ParserEvaFields,
  { column: string; provenanceField: string; normalize: (raw: string) => string }
> = {
  work_provider:          { column: 'eva_work_provider',          provenanceField: 'workProvider',          normalize: (v) => (isUnknownWorkProviderSentinel(v) ? '' : v.slice(0, 200)) },
  vehicle_model:          { column: 'eva_vehicle_model',          provenanceField: 'vehicleModel',          normalize: (v) => v.slice(0, 200) },
  claimant_name:          { column: 'eva_claimant_name',          provenanceField: 'claimantName',          normalize: (v) => v.slice(0, 200) },
  claimant_telephone:     { column: 'eva_claimant_telephone',     provenanceField: 'claimantTelephone',     normalize: (v) => v.slice(0, 60) },
  claimant_email:         { column: 'eva_claimant_email',         provenanceField: 'claimantEmail',          normalize: (v) => v.slice(0, 320) },
  // CHECK ck_case_eva_date_of_loss / _instruction: must match DD/MM/YYYY (or empty) — skip junk.
  date_of_loss:           { column: 'eva_date_of_loss',           provenanceField: 'dateOfLoss',             normalize: (v) => (DDMMYYYY.test(v) ? v : '') },
  date_of_instruction:    { column: 'eva_date_of_instruction',    provenanceField: 'dateOfInstruction',      normalize: (v) => (DDMMYYYY.test(v) ? v : '') },
  accident_circumstances: { column: 'eva_accident_circumstances', provenanceField: 'accidentCircumstances', normalize: (v) => v.slice(0, 4000) },
  // CHECK ck_case_eva_vat_status: IN ('', 'Yes', 'No') — the parser normalizes to Yes/No; skip anything else.
  vat_status:             { column: 'eva_vat_status',             provenanceField: 'vatStatus',              normalize: (v) => (v === 'Yes' || v === 'No' ? v : '') },
};

/** EVA contract order for deterministic candidate ordering. */
const PARSER_EVA_FIELD_ORDER: (keyof ParserEvaFields)[] = [
  'work_provider',
  'vehicle_model',
  'claimant_name',
  'claimant_telephone',
  'claimant_email',
  'date_of_loss',
  'date_of_instruction',
  'accident_circumstances',
  'vat_status',
];

/**
 * Corpus `display_name` fallback when the parser did not supply a work-provider name.
 * Pure helper — applyParserFields uses this after parser candidates are applied.
 */
export function corpusWorkProviderCandidate(
  displayName: string | null | undefined,
): ParserEvaCandidate | null {
  const value = (displayName ?? '').trim().slice(0, 200);
  if (!value) return null;
  return { column: 'eva_work_provider', provenanceField: 'workProvider', value };
}

/**
 * Select the parser-owned EVA fields that carry a constraint-valid value, in EVA contract
 * order. Empty / whitespace / constraint-failing values are dropped. The caller applies
 * each only when the case column is still empty (fill-if-empty).
 */
export function selectParserEvaCandidates(
  parserEva: ParserEvaFields | undefined | null,
): ParserEvaCandidate[] {
  if (!parserEva) return [];
  const out: ParserEvaCandidate[] = [];
  for (const key of PARSER_EVA_FIELD_ORDER) {
    const raw = (parserEva[key] ?? '').toString().trim();
    if (!raw) continue;
    const spec = SPEC[key];
    const value = spec.normalize(raw);
    if (!value) continue; // failed a constraint guard (bad date / non-Yes/No VAT) — skip silently
    out.push({ column: spec.column, provenanceField: spec.provenanceField, value });
  }
  return out;
}

/* ============================================================
   Content-string → work_provider_id matching (rules-engine-v2 Phase 3, ADR-0011).

   ADR-0011's second decision: "the work provider is resolved primarily from the document
   content" (the parser's `work_provider` field). Until now that string only ever landed
   in the free-text `eva_work_provider` column (above) — `work_provider_id` (the Case
   identity FK; drives Case/PO minting, dedup scoping, and the provider corpus joins) was
   NEVER written from it. This section maps the string to a real corpus row so
   applyParserFields (internal.ts) can fill `case_.work_provider_id` fill-if-empty.

   VERIFY-FIRST (2026-07-02): the vendored parser was run locally over real instruction
   documents (TKT-051 evidence + adjacent real corpus samples in
   test-cases-and-data/test-cases/, gitignored). Every provider probed (PCH, SBL, QDOS)
   came back with `work_provider.value` as a SHORT code matching its `principal_code`
   verbatim ("PCH", "SBL", "QDOS" — confidence 1.0). The EXISTING parser-eva-fields.test.ts
   fixture ("Knightsbridge Solicitors") shows the same field can also carry a full
   display-name-shaped string for other providers' catalog entries. So the match key below
   is deliberately tolerant of BOTH shapes: it compares against EITHER `principal_code` OR
   `display_name`, case/punctuation-insensitively (a provider is more likely to be written
   "PCH Ltd" or "P.C.H." in free text than a code to collide with an unrelated name).
   ============================================================ */

/** A work_provider row's two content-matchable columns + its id — the minimum
 *  applyParserFields needs to resolve a parser-detected work_provider STRING to a real
 *  `work_provider_id`. */
export interface WorkProviderContentMatchRecord {
  workProviderId: string;
  principalCode: string;
  displayName: string;
}

export type ContentProviderMatchOutcome =
  | { outcome: 'matched'; workProviderId: string }
  | { outcome: 'ambiguous' }
  | { outcome: 'unmatched' };

/**
 * Normalize a provider name/code for CONTENT-STRING matching: trim, uppercase, strip the
 * light punctuation both the parser's catalogue and the corpus are inconsistent about
 * (periods, commas, apostrophes, ampersands), collapse whitespace. Exported so the exact
 * normalization rule is independently testable/documented (not just an internal detail of
 * the matcher below).
 */
export function normalizeProviderMatchKey(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[.,'&]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Map a parser-detected work_provider STRING to a work_provider_id, matching
 * case/punctuation-insensitively against EITHER `principal_code` OR `display_name` (see
 * the VERIFY-FIRST note above for why both). The UNKNOWN sentinel and blank input are
 * 'unmatched' — never guessed. Two DIFFERENT providers normalizing to the SAME key is
 * 'ambiguous' — mirrors `matchProviderByDomain`'s own never-auto-pick-on-collision
 * discipline (packages/domain/src/domain/provider-match.ts): a wrong auto-pick here would
 * mint the wrong Case/PO prefix, which is worse than leaving it for a human.
 */
export function matchWorkProviderByContentString(
  raw: string | undefined | null,
  providers: readonly WorkProviderContentMatchRecord[],
): ContentProviderMatchOutcome {
  const trimmed = (raw ?? '').toString().trim();
  if (!trimmed || isUnknownWorkProviderSentinel(trimmed)) return { outcome: 'unmatched' };
  const key = normalizeProviderMatchKey(trimmed);
  if (!key) return { outcome: 'unmatched' };

  const hits = new Set<string>();
  for (const p of providers) {
    if (
      (p.principalCode && normalizeProviderMatchKey(p.principalCode) === key) ||
      (p.displayName && normalizeProviderMatchKey(p.displayName) === key)
    ) {
      hits.add(p.workProviderId);
    }
  }
  if (hits.size === 1) {
    const [workProviderId] = hits;
    return { outcome: 'matched', workProviderId };
  }
  if (hits.size > 1) return { outcome: 'ambiguous' };
  return { outcome: 'unmatched' };
}

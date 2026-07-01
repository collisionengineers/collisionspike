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

/* ============================================================
   Collision Engineers — Code App: PARSER response adapter + transport contract.

   Adapts the cespike-parser `cedocumentparser_v2.0_eva_json` response into the
   prototype domain shapes the review UI renders:

     - the 12 EVA fields  -> `EvaFields` ({ value, provenance, reviewState }),
       reusing the SAME ProvenanceBadge the live review screen shows;
     - vrm + reference + vin -> identity values outside the EVA field set;
     - issues[]           -> surfaced to the user as request/parse errors.

   PURE OF SDK: this module imports NO '@microsoft/power-apps' — only the response
   mapping + the injectable `ParserTransport` contract, so it stays inside the seam's
   offline boundary and the unit test maps a canned response with zero network. The
   LIVE transport (CSP-safe, via the CE Parser custom connector) lives in
   `parser-connector-transport.ts` and is passed to `parseDocument(req, transport)`.

   The parser response field `source` is a FREE-FORM provenance string
   (`pdf_extraction`, `fallback_*`, `absent`, …) — NOT the prototype
   `ProvenanceSourceType` union. `parserSourceToType` collapses it to the union so
   the badge colour-key is honest (PDF for document extraction, AI for the
   heuristic fallbacks, Manual for absent/unknown).
   ============================================================ */

import { EVA_FIELD_ORDER, type EvaFieldKey } from '@cs/domain';
import type {
  EvaField,
  EvaFields,
  FieldProvenance,
  MileageUnit,
  ProvenanceSourceType,
  ReviewState,
  VatStatus,
} from '@cs/domain';

/* ============================================================
   1. The wire contract (cedocumentparser_v2.0_eva_json).
   ============================================================ */

/** One extracted value as the parser returns it. */
export interface ParserField {
  value: string;
  /** 0..1, or null for deterministic / absent sources. */
  confidence: number | null;
  /** Free-form provenance label (pdf_extraction, fallback_*, absent, …). */
  source: string;
  warnings?: string[];
}

/** snake_case keys the parser emits in `extraction`, matching EVA payload order. */
export type ParserExtractionKey =
  | 'work_provider'
  | 'vehicle_model'
  | 'claimant_name'
  | 'claimant_telephone'
  | 'claimant_email'
  | 'date_of_loss'
  | 'date_of_instruction'
  | 'accident_circumstances'
  | 'inspection_address'
  | 'vat_status'
  | 'mileage'
  | 'mileage_unit';

export interface ParserIssue {
  field: string;
  severity: 'error' | 'warning' | string;
  code: string;
  message: string;
}

/** The full parser response. `extraction` is null when the request failed. */
export interface ParserResponse {
  extraction: Record<ParserExtractionKey, ParserField> | null;
  vrm: ParserField | null;
  reference: ParserField | null;
  /** Envelope-only VIN; never part of the 12 EVA extraction fields. */
  vin: ParserField | null;
  issues: ParserIssue[];
  contract_version: string;
}

export interface ParseRequest {
  /** Base64 of the raw document bytes (no data: prefix). */
  document: string;
  filename: string;
  provider_hint?: string;
}

/** Injectable transport so the unit test maps a canned response without network. */
export type ParserTransport = (req: ParseRequest) => Promise<ParserResponse>;

/* ============================================================
   2. Key <-> key bridge (parser snake_case <-> prototype camelCase).
   ============================================================ */

/** EVA camelCase key -> parser snake_case extraction key (contract order). */
const EVA_KEY_TO_PARSER_KEY: Record<EvaFieldKey, ParserExtractionKey> = {
  workProvider: 'work_provider',
  vehicleModel: 'vehicle_model',
  claimantName: 'claimant_name',
  claimantTelephone: 'claimant_telephone',
  claimantEmail: 'claimant_email',
  dateOfLoss: 'date_of_loss',
  dateOfInstruction: 'date_of_instruction',
  accidentCircumstances: 'accident_circumstances',
  inspectionAddress: 'inspection_address',
  vatStatus: 'vat_status',
  mileage: 'mileage',
  mileageUnit: 'mileage_unit',
};

/* ============================================================
   3. source string -> ProvenanceSourceType (badge colour-key).
   ============================================================ */

/**
 * Collapse the parser's free-form `source` to the prototype provenance union.
 * - explicit document extraction -> 'pdf_extraction' (PDF badge)
 * - email body text             -> 'email_text'     (PDF badge family)
 * - any heuristic `fallback_*`   -> 'ai'             (AI badge — inferred)
 * - 'absent' / unknown           -> 'manual_upload'  (Manual badge — needs entry)
 */
export function parserSourceToType(source: string | null | undefined): ProvenanceSourceType {
  const s = (source ?? '').toLowerCase();
  if (s === 'pdf_extraction' || s === 'document_ai') return 'pdf_extraction';
  if (s === 'email_text') return 'email_text';
  if (s.startsWith('fallback_')) return 'ai';
  if (s === 'ai' || s === 'azure_vision') return 'ai';
  if (s === '' || s === 'absent') return 'manual_upload';
  // Unrecognised but present source label -> treat as a parsed/AI origin.
  return 'ai';
}

/** A short human label for the provenance tooltip's origin line. */
function sourceLabelFor(source: string | null | undefined): string {
  const s = (source ?? '').trim();
  if (!s || s === 'absent') return 'Not found in document';
  if (s === 'pdf_extraction') return 'Parsed from document';
  if (s.startsWith('fallback_')) return `Heuristic: ${s.replace(/^fallback_/, '').replace(/_/g, ' ')}`;
  return s.replace(/_/g, ' ');
}

/**
 * Initial review state for a parsed field:
 *   - empty value           -> needs_review (the user must supply it),
 *   - present (any source)   -> needs_review (parser output is always reviewed by
 *     a human before a Case is created — this is the manual-intake contract).
 * Staff edits in the UI flip the field to `reviewed`.
 */
function initialReviewState(_field: ParserField): ReviewState {
  return 'needs_review';
}

/** Map one parser field -> the prototype `EvaField`. */
export function parserFieldToEvaField(pf: ParserField): EvaField {
  const sourceType = parserSourceToType(pf.source);
  const provenance: FieldProvenance = {
    sourceType,
    sourceLabel: sourceLabelFor(pf.source),
    ...(pf.confidence != null ? { confidence: pf.confidence } : {}),
  };
  // The parser emits "UNKNOWN" as a sentinel for work_provider when unresolved;
  // present it as empty so the required-field validation prompts entry.
  const value = pf.value === 'UNKNOWN' ? '' : pf.value;
  return { value, provenance, reviewState: initialReviewState(pf) };
}

/* ============================================================
   4. Whole-response adapter.
   ============================================================ */

export interface ParsedIntake {
  /** The 12 EVA fields, ready for the review grid + ProvenanceBadge. */
  evaFields: EvaFields;
  /** VRM extracted from the document (Case identity), or ''. */
  vrm: string;
  /** Provider reference / Case-PO extracted (Case identity), or ''. */
  reference: string;
  /** VIN extracted from the document, retained outside the EVA review fields. */
  vin: string;
  /** Per-field confidence/source kept alongside for the intake review badges. */
  vrmField?: ParserField;
  referenceField?: ParserField;
  vinField?: ParserField;
  /** Any parser issues to surface (errors block; warnings inform). */
  issues: ParserIssue[];
}

const EMPTY_FIELD: ParserField = { value: '', confidence: null, source: 'absent' };

/** Adapt a successful parser response to the intake review shapes. */
export function adaptParserResponse(resp: ParserResponse): ParsedIntake {
  const extraction = resp.extraction ?? ({} as Record<ParserExtractionKey, ParserField>);
  const out = {} as Record<EvaFieldKey, EvaField>;
  for (const desc of EVA_FIELD_ORDER) {
    const pf = extraction[EVA_KEY_TO_PARSER_KEY[desc.key]] ?? EMPTY_FIELD;
    out[desc.key] = parserFieldToEvaField(pf);
  }
  // Narrow the two enum-valued fields to satisfy EvaFields' value types.
  const evaFields = out as unknown as EvaFields;
  evaFields.vatStatus = { ...out.vatStatus, value: out.vatStatus.value as VatStatus };
  evaFields.mileageUnit = { ...out.mileageUnit, value: out.mileageUnit.value as MileageUnit };

  return {
    evaFields,
    vrm: resp.vrm?.value ?? '',
    reference: resp.reference?.value ?? '',
    vin: resp.vin?.value ?? '',
    ...(resp.vrm ? { vrmField: resp.vrm } : {}),
    ...(resp.reference ? { referenceField: resp.reference } : {}),
    ...(resp.vin ? { vinField: resp.vin } : {}),
    issues: resp.issues ?? [],
  };
}

/** Errors (severity === 'error') in a response — non-empty means parse failed. */
export function parserErrors(resp: ParserResponse): ParserIssue[] {
  return (resp.issues ?? []).filter((i) => i.severity === 'error');
}

/* ============================================================
   5. The public call. The live transport (CSP-safe, via the CE Parser connector)
      is injected by the caller (ManualIntake, from parser-connector-transport.ts);
      the unit test injects a fake. There is no raw-fetch transport — the deployed
      Code App CSP (`connect-src 'none'`) forbids it.
   ============================================================ */

/**
 * Parse a document and adapt the result. `transport` is REQUIRED: the app passes
 * the connector-backed transport; the unit test injects a fake. Throws on transport
 * failure; parser-level errors are carried in the returned `issues`.
 */
export async function parseDocument(
  req: ParseRequest,
  transport: ParserTransport,
): Promise<ParsedIntake> {
  const resp = await transport(req);
  return adaptParserResponse(resp);
}

/* ============================================================
   6. Browser helper: File -> base64 (no data: prefix).
   ============================================================ */

/** Read a browser File as a base64 string (strips the data: URL prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unexpected FileReader result'));
        return;
      }
      // result is "data:<mime>;base64,<payload>" — keep only the payload.
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

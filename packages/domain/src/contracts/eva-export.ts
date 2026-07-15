/* ============================================================
   Collision Engineers — EVA export contract (CANONICAL serializer).

   Re-implements collisioncc `src/lib/eva-export.ts` for the SETTLED 12-field
   EVA set. This is the one serializer used by every export and submission path,
   so generated JSON stays byte-identical. The Python parser
   Function validates its output against the sibling JSON Schema
   (`contracts/eva-payload.schema.json`). NOTE: that schema is the MEMBERSHIP +
   FORMAT gate (exactly these 12 keys, date/enum/address shapes) — JSON Schema
   `required` is order-insensitive, so it does NOT enforce key order. Order is
   guaranteed by every producer serializing in `EVA_FIELD_ORDER` (this file is
   the order authority; the schema is the membership/format authority).

   The 12 binding fields (order is load-bearing):
     1 work_provider          2 vehicle_model         3 claimant_name
     4 claimant_telephone     5 claimant_email        6 date_of_loss
     7 date_of_instruction    8 accident_circumstances 9 inspection_address
    10 vat_status            11 mileage              12 mileage_unit

   (Engineer allocation is NOT an EVA submission field — it is left blank and
   assigned inside EVA AFTER submission, so it is excluded from this payload.)

   `vrm` and `reference` are CASE-IDENTITY fields, NOT EVA payload fields — they
   live on the Case row for correlation/dedup and are EXCLUDED from the payload.

   PURE + DETERMINISTIC + FRAMEWORK-FREE. JSON.stringify follows insertion order,
   and `buildEvaPayload` inserts in `EVA_FIELD_ORDER` order, so serialization is
   deterministic.
   ============================================================ */

/* ----------  Field identity  ----------
   The prototype keys its EVA field objects by camelCase (`workProvider`, ...);
   the EVA contract serializes snake_case property names (`work_provider`, ...).
   `EVA_FIELD_ORDER` binds the two plus the display label and required flag. */

/** camelCase keys — match the prototype `EvaFields` object keys 1:1. */
export type EvaFieldKey =
  | 'workProvider'
  | 'vehicleModel'
  | 'claimantName'
  | 'claimantTelephone'
  | 'claimantEmail'
  | 'dateOfLoss'
  | 'dateOfInstruction'
  | 'accidentCircumstances'
  | 'inspectionAddress'
  | 'vatStatus'
  | 'mileage'
  | 'mileageUnit';

/** snake_case property names emitted in the EVA payload JSON. */
export type EvaPayloadKey =
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

export interface EvaFieldDescriptor {
  /** camelCase prototype key. */
  key: EvaFieldKey;
  /** snake_case payload property name. */
  payloadKey: EvaPayloadKey;
  /** Display label. */
  label: string;
  /** Whether a non-empty value is required for EVA readiness. */
  required: boolean;
}

/** The 12 binding fields in contract order. */
export const EVA_FIELD_ORDER: readonly EvaFieldDescriptor[] = [
  { key: 'workProvider', payloadKey: 'work_provider', label: 'Work Provider', required: true },
  { key: 'vehicleModel', payloadKey: 'vehicle_model', label: 'Vehicle Model', required: true },
  { key: 'claimantName', payloadKey: 'claimant_name', label: 'Claimant Name', required: true },
  { key: 'claimantTelephone', payloadKey: 'claimant_telephone', label: 'Claimant Telephone', required: false },
  { key: 'claimantEmail', payloadKey: 'claimant_email', label: 'Claimant Email Address', required: false },
  { key: 'dateOfLoss', payloadKey: 'date_of_loss', label: 'Date of Incident', required: true },
  { key: 'dateOfInstruction', payloadKey: 'date_of_instruction', label: 'Date of Instruction', required: true },
  { key: 'accidentCircumstances', payloadKey: 'accident_circumstances', label: 'Accident Circumstances', required: true },
  { key: 'inspectionAddress', payloadKey: 'inspection_address', label: 'Inspection Address', required: true },
  { key: 'vatStatus', payloadKey: 'vat_status', label: 'VAT Status', required: false },
  { key: 'mileage', payloadKey: 'mileage', label: 'Mileage', required: false },
  { key: 'mileageUnit', payloadKey: 'mileage_unit', label: 'Mileage Unit', required: false },
] as const;

/** The ordered list of snake_case payload property names (the schema's key order). */
export const EVA_PAYLOAD_KEYS: readonly EvaPayloadKey[] = EVA_FIELD_ORDER.map(
  (d) => d.payloadKey,
);

/* ----------  Enums  ---------- */
export type VatStatus = '' | 'Yes' | 'No';
export type MileageUnit = '' | 'Miles' | 'Km';

/** The serialized payload: exactly the 12 snake_case keys, each a string. */
export type EvaPayload = Record<EvaPayloadKey, string>;

/* ----------  Build input  ----------
   Structural shape `buildEvaPayload` reads. The prototype `Case` satisfies it:
   each `evaFields[key]` exposes `{ value: string }`. Kept structural so this
   contract imports nothing from `mock/`. vrm/reference are intentionally NOT
   part of this input shape — they never reach the payload. */
export interface EvaFieldValue {
  value: string;
}

export interface EvaPayloadInput {
  evaFields: Record<EvaFieldKey, EvaFieldValue>;
}

/**
 * Build the 12-field EVA payload from a Case-like input, in contract order.
 * Excludes vrm/reference (Case-identity, never payload). Values are emitted
 * verbatim (already-normalized by the parser/staff per the field formats);
 * this serializer does not transform values, it only orders and projects them.
 */
export function buildEvaPayload(input: EvaPayloadInput): EvaPayload {
  // Insert keys in EVA_FIELD_ORDER so JSON.stringify is deterministic.
  const payload = {} as EvaPayload;
  for (const desc of EVA_FIELD_ORDER) {
    payload[desc.payloadKey] = input.evaFields[desc.key]?.value ?? '';
  }
  return payload;
}

/**
 * Deterministically serialize a payload to the JSON string every client emits.
 * Re-projects through `EVA_FIELD_ORDER` so key order is
 * guaranteed regardless of how the caller built the object.
 */
export function serializeEvaPayload(payload: EvaPayload): string {
  const ordered = {} as EvaPayload;
  for (const k of EVA_PAYLOAD_KEYS) {
    ordered[k] = payload[k] ?? '';
  }
  return JSON.stringify(ordered, null, 2);
}

/** Convenience: Case-like input straight to the canonical JSON string. */
export function buildEvaJson(input: EvaPayloadInput): string {
  return serializeEvaPayload(buildEvaPayload(input));
}

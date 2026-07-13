/**
 * Shared EVA field-edit boundary.
 *
 * The assistant proposal schema and the Data API case PATCH must agree on the
 * accepted formats and database-width limits. Keeping the normaliser and constants
 * here prevents a proposal from passing confirmation only to be rejected or silently
 * clipped when the same value reaches the write route.
 */

import type { EvaFieldKey } from './eva-export.js';

/** Exact case_.eva_* column widths. */
export const EVA_EDIT_MAX_LENGTH = {
  workProvider: 200,
  vehicleModel: 200,
  claimantName: 200,
  claimantTelephone: 60,
  claimantEmail: 320,
  dateOfLoss: 10,
  dateOfInstruction: 10,
  accidentCircumstances: 4000,
  inspectionAddress: 2000,
  vatStatus: 3,
  mileage: 20,
  mileageUnit: 6,
} as const satisfies Record<EvaFieldKey, number>;

/** The API intentionally validates shape only; it does not calendar-validate dates. */
export const EVA_EDIT_DATE_RE = /^(?:|\d{2}\/\d{2}\/\d{4})$/;
export const EVA_EDIT_VAT_VALUES = ['', 'Yes', 'No'] as const;
export const EVA_EDIT_MILEAGE_UNITS = ['', 'Miles', 'Km'] as const;

/**
 * One strict boundary for a displayed odometer value written to an EVA field.
 *
 * Values are stored as base-10 digits. Correctly grouped thousands separators
 * are normalised; arbitrary prose or punctuation is never stripped into a value.
 * The 20-character limit is the physical case_.eva_mileage width.  Empty is a
 * valid *optional field* value, but is deliberately not a resolved mileage.
 */
export const EVA_MILEAGE_RE = /^\d{1,20}$/;
const EVA_GROUPED_MILEAGE_RE = /^\d{1,3}(?:,\d{3})+$/;

export function normaliseEvaMileage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  const digits = EVA_MILEAGE_RE.test(trimmed)
    ? trimmed
    : EVA_GROUPED_MILEAGE_RE.test(trimmed)
      ? trimmed.replaceAll(',', '')
      : '';
  return digits && EVA_MILEAGE_RE.test(digits) ? digits : undefined;
}

export function isValidEvaMileage(value: unknown): value is string {
  return normaliseEvaMileage(value) !== undefined;
}

export type EvaEditNormalisation = { value: string } | { error: string };

/** Validate and normalise one case-page EVA edit exactly as the Data API persists it. */
export function normaliseEvaEdit(key: EvaFieldKey, raw: string): EvaEditNormalisation {
  const trimmed = raw.trim();
  if (key === 'dateOfLoss' || key === 'dateOfInstruction') {
    if (!EVA_EDIT_DATE_RE.test(trimmed)) {
      return { error: `${key} must be DD/MM/YYYY or empty` };
    }
    return { value: trimmed };
  }
  if (key === 'vatStatus') {
    if (!(EVA_EDIT_VAT_VALUES as readonly string[]).includes(trimmed)) {
      return { error: "vatStatus must be '', 'Yes' or 'No'" };
    }
    return { value: trimmed };
  }
  if (key === 'mileageUnit') {
    if (!(EVA_EDIT_MILEAGE_UNITS as readonly string[]).includes(trimmed)) {
      return { error: "mileageUnit must be '', 'Miles' or 'Km'" };
    }
    return { value: trimmed };
  }
  if (key === 'mileage') {
    if (!trimmed) return { value: '' };
    const mileage = normaliseEvaMileage(trimmed);
    if (!mileage) {
      return { error: 'mileage must contain digits only' };
    }
    return { value: mileage };
  }
  // Normal staff case-page edits retain the established clip-at-column-width behavior.
  // The assistant schema is stricter and rejects an over-width proposal before confirm.
  return { value: raw.slice(0, EVA_EDIT_MAX_LENGTH[key]) };
}

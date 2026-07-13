/**
 * api/src/lib/provider-intake-validate.ts — pure validator for the provider API submission.
 *
 * Mirrors the case_ / evidence DB CHECK constraints (date format, VAT/mileage enums,
 * exclusion-reason) so a bad submission is rejected with a machine-readable error code
 * (HTTP 400) BEFORE any DB write — never a 500 on a constraint violation. Kept pure
 * (no I/O) so it is unit-testable and the route stays thin.
 *
 * The provider identity + principal code are NOT validated here — they come solely from
 * the authenticated API key (ADR-0020), never from the body.
 */

import type {
  ProviderApiAttachment,
  ProviderApiImage,
  ProviderApiSubmission,
} from '@cs/domain';

/** Machine-readable rejection codes — documented in docs/reference/provider-api-intake-spec.md. */
export type ProviderIntakeErrorCode =
  | 'invalid_body'
  | 'missing_provider_reference'
  | 'missing_vrm'
  | 'missing_claimant_name'
  | 'invalid_date_of_loss'
  | 'invalid_date_of_instruction'
  | 'missing_accident_circumstances'
  | 'invalid_vat_status'
  | 'invalid_mileage_unit'
  | 'invalid_mileage'
  | 'invalid_inspection_address'
  | 'invalid_instructions'
  | 'invalid_images'
  | 'invalid_image_role'
  | 'missing_exclusion_reason'
  | 'empty_submission';

export interface ProviderIntakeValidationError {
  ok: false;
  code: ProviderIntakeErrorCode;
  message: string;
}

/** A single attachment, normalised (trimmed filename, decoded later in the route). */
export interface NormalisedAttachment {
  filename: string;
  contentType: string;
  base64Data: string;
}

export interface NormalisedImage extends NormalisedAttachment {
  imageRole: 'overview' | 'damage_closeup' | 'additional' | 'unknown';
  sequenceIndex: number | null;
  excluded: boolean;
  exclusionReason: string | null;
}

/** The clean, column-width-clipped submission the route persists. */
export interface NormalisedSubmission {
  providerReference: string;
  vrm: string;
  vehicleModel: string;
  claimantName: string;
  claimantTelephone: string;
  claimantEmail: string;
  dateOfLoss: string;
  dateOfInstruction: string;
  accidentCircumstances: string;
  inspectionAddress: string;
  vatStatus: '' | 'Yes' | 'No';
  mileage: string;
  mileageUnit: '' | 'Miles' | 'Km';
  instructions: NormalisedAttachment[];
  images: NormalisedImage[];
}

export interface ProviderIntakeValidationOk {
  ok: true;
  value: NormalisedSubmission;
}

const DMY = /^\d{2}\/\d{2}\/\d{4}$/;
const VAT_VALUES = new Set(['', 'Yes', 'No']);
const MILEAGE_UNITS = new Set(['', 'Miles', 'Km']);
const IMAGE_ROLES = new Set(['overview', 'damage_closeup', 'additional']);

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const err = (code: ProviderIntakeErrorCode, message: string): ProviderIntakeValidationError => ({
  ok: false,
  code,
  message,
});

/** Validate a single attachment's required string fields. Returns null when valid. */
function attachmentInvalid(a: unknown): boolean {
  if (a == null || typeof a !== 'object') return true;
  const o = a as Partial<ProviderApiAttachment>;
  return !str(o.filename).trim() || !str(o.contentType).trim() || !str(o.base64Data).trim();
}

/**
 * Validate + normalise a raw provider submission body.
 * Returns `{ ok: true, value }` or `{ ok: false, code, message }`.
 */
export function validateProviderApiSubmission(
  raw: unknown,
): ProviderIntakeValidationOk | ProviderIntakeValidationError {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return err('invalid_body', 'Request body must be a JSON object.');
  }
  const b = raw as Partial<ProviderApiSubmission>;

  const providerReference = str(b.providerReference).trim();
  if (!providerReference) return err('missing_provider_reference', 'providerReference is required.');

  const vrmRaw = str(b.vrm).trim();
  if (!vrmRaw) return err('missing_vrm', 'vrm is required.');
  const vrm = vrmRaw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  if (!vrm) return err('missing_vrm', 'vrm must contain at least one alphanumeric character.');

  const claimantName = str(b.claimantName).trim().slice(0, 200);
  if (!claimantName) return err('missing_claimant_name', 'claimantName is required.');

  const dateOfLoss = str(b.dateOfLoss).trim();
  if (!DMY.test(dateOfLoss)) return err('invalid_date_of_loss', 'dateOfLoss must be DD/MM/YYYY.');

  const dateOfInstruction = str(b.dateOfInstruction).trim();
  if (!DMY.test(dateOfInstruction)) {
    return err('invalid_date_of_instruction', 'dateOfInstruction must be DD/MM/YYYY.');
  }

  const accidentCircumstances = str(b.accidentCircumstances).trim().slice(0, 4000);
  if (!accidentCircumstances) {
    return err('missing_accident_circumstances', 'accidentCircumstances is required.');
  }

  const vatStatus = str(b.vatStatus).trim();
  if (!VAT_VALUES.has(vatStatus)) {
    return err('invalid_vat_status', "vatStatus must be '', 'Yes' or 'No'.");
  }

  const mileageUnit = str(b.mileageUnit).trim();
  if (!MILEAGE_UNITS.has(mileageUnit)) {
    return err('invalid_mileage_unit', "mileageUnit must be '', 'Miles' or 'Km'.");
  }
  const mileage = str(b.mileage).trim();
  if (mileage && !/^\d+$/.test(mileage)) {
    return err('invalid_mileage', 'mileage must contain digits only.');
  }

  // inspectionAddress: optional; when present must be a string (6-line block or 'Image Based Assessment').
  if (b.inspectionAddress !== undefined && typeof b.inspectionAddress !== 'string') {
    return err('invalid_inspection_address', 'inspectionAddress must be a string when supplied.');
  }
  const inspectionAddress = str(b.inspectionAddress).slice(0, 2000);

  // instructions + images: each must be an array; each element must carry the required file fields.
  if (b.instructions !== undefined && !Array.isArray(b.instructions)) {
    return err('invalid_instructions', 'instructions must be an array.');
  }
  if (b.images !== undefined && !Array.isArray(b.images)) {
    return err('invalid_images', 'images must be an array.');
  }
  const rawInstructions = Array.isArray(b.instructions) ? b.instructions : [];
  const rawImages = Array.isArray(b.images) ? b.images : [];

  if (rawInstructions.length === 0 && rawImages.length === 0) {
    return err('empty_submission', 'At least one instruction document or image is required.');
  }

  const instructions: NormalisedAttachment[] = [];
  for (const a of rawInstructions) {
    if (attachmentInvalid(a)) {
      return err('invalid_instructions', 'Each instruction needs filename, contentType and base64Data.');
    }
    const o = a as ProviderApiAttachment;
    instructions.push({
      filename: o.filename.trim().slice(0, 400),
      contentType: o.contentType.trim().slice(0, 200),
      base64Data: o.base64Data,
    });
  }

  const images: NormalisedImage[] = [];
  for (const a of rawImages) {
    if (attachmentInvalid(a)) {
      return err('invalid_images', 'Each image needs filename, contentType and base64Data.');
    }
    const o = a as ProviderApiImage;
    const roleRaw = str(o.imageRole).trim();
    if (roleRaw && !IMAGE_ROLES.has(roleRaw)) {
      return err('invalid_image_role', "imageRole must be 'overview', 'damage_closeup' or 'additional'.");
    }
    const excluded = o.excluded === true;
    const exclusionReason = str(o.exclusionReason).trim();
    if (excluded && !exclusionReason) {
      return err('missing_exclusion_reason', 'exclusionReason is required when excluded is true.');
    }
    let sequenceIndex: number | null = null;
    if (o.sequenceIndex !== undefined) {
      const n = Number(o.sequenceIndex);
      if (Number.isInteger(n) && n >= 0) sequenceIndex = n;
    }
    images.push({
      filename: o.filename.trim().slice(0, 400),
      contentType: o.contentType.trim().slice(0, 200),
      base64Data: o.base64Data,
      imageRole: (roleRaw || 'unknown') as NormalisedImage['imageRole'],
      sequenceIndex,
      excluded,
      exclusionReason: excluded ? exclusionReason.slice(0, 400) : null,
    });
  }

  return {
    ok: true,
    value: {
      providerReference: providerReference.slice(0, 100),
      vrm,
      vehicleModel: str(b.vehicleModel).trim().slice(0, 200),
      claimantName,
      claimantTelephone: str(b.claimantTelephone).trim().slice(0, 60),
      claimantEmail: str(b.claimantEmail).trim().slice(0, 320),
      dateOfLoss,
      dateOfInstruction,
      accidentCircumstances,
      inspectionAddress,
      vatStatus: vatStatus as '' | 'Yes' | 'No',
      mileage: mileage.slice(0, 20),
      mileageUnit: mileageUnit as '' | 'Miles' | 'Km',
      instructions,
      images,
    },
  };
}

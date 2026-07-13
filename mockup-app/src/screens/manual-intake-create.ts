import {
  isValidEvaMileage,
  type CreateCaseInput,
  type MileageUnit,
} from '@cs/domain';

export type ManualIntakeMode = 'document' | 'manual' | 'images';

export interface ManualIntakeIdentityValues {
  provider: string;
  providerCode: string;
  providerReference: string;
  insuredName: string;
}

type CreateIdentityFields = Pick<
  CreateCaseInput,
  'provider' | 'providerCode' | 'providerReference' | 'insuredName'
>;

/**
 * Identity fields that belong to an instruction-led case. Images-only intake
 * has no provider or policyholder facts yet, so none of those values may leak
 * into its create request if the operator previously used another intake mode.
 */
export function createIdentityFields(
  mode: ManualIntakeMode,
  values: ManualIntakeIdentityValues,
): Partial<CreateIdentityFields> {
  if (mode === 'images') return {};
  return {
    ...(values.provider.trim() ? { provider: values.provider.trim() } : {}),
    ...(values.providerCode.trim() ? { providerCode: values.providerCode.trim() } : {}),
    ...(values.providerReference.trim() ? { providerReference: values.providerReference.trim() } : {}),
    ...(values.insuredName.trim() ? { insuredName: values.insuredName.trim() } : {}),
  };
}

/** Keyboard and visual order for the compact images-only identity group. */
export const IMAGE_ONLY_IDENTITY_ORDER = [
  'claimantName',
  'vrm',
  'make',
  'vehicleModel',
  'mileage',
] as const;

/** Persist the two visible controls in EVA's single vehicle-model field. */
export function manualVehicleModel(make: string, model: string): string {
  const cleanMake = make.trim();
  const cleanModel = model.trim();
  if (!cleanMake) return cleanModel;
  if (!cleanModel) return cleanMake;
  if (cleanModel.toLocaleUpperCase().startsWith(`${cleanMake.toLocaleUpperCase()} `)) {
    return cleanModel;
  }
  return `${cleanMake} ${cleanModel}`;
}

export interface ManualVehicleDraft {
  make: string;
  vehicleModel: string;
  mileage: string;
  mileageUnit: MileageUnit;
}

export interface ManualVehicleLookupDefaults {
  make?: string;
  vehicleModel?: string;
  currentMileage?: number;
  mileageUnit?: MileageUnit;
}

/** Staff-safe copy for a lookup that did not return vehicle details. The
 * canonical estimator carries a detailed diagnostic/evidence reason for audit,
 * but that implementation-facing text must never leak into this form. */
export function manualVehicleLookupMessage(status: string): string {
  switch (status) {
    case 'invalid_registration':
      return 'Check the registration and try again.';
    case 'not_found':
      return 'No vehicle record was found for this registration.';
    case 'configuration_error':
      return 'Vehicle lookup isn\u2019t available. Ask a supervisor to check it.';
    case 'temporarily_unavailable':
      return 'Vehicle details are temporarily unavailable. Try again.';
    default:
      return 'Vehicle details could not be found.';
  }
}

/**
 * Apply lookup values as defaults, never as an overwrite. A valid parsed or
 * staff-entered mileage/model wins. Invalid legacy mileage is unresolved data,
 * so a defensible lookup may replace that value and its paired unit together.
 */
export function mergeManualVehicleLookup(
  current: ManualVehicleDraft,
  lookup: ManualVehicleLookupDefaults,
): ManualVehicleDraft {
  const lookupMake = lookup.make?.trim() ?? '';
  const lookupModel = lookup.vehicleModel?.trim() ?? '';
  const make = current.make.trim() ? current.make : lookupMake || current.make;
  const vehicleModel = current.vehicleModel.trim()
    ? current.vehicleModel
    : lookupModel
      ? manualVehicleModel(make, lookupModel)
      : current.vehicleModel;

  if (isValidEvaMileage(current.mileage)) {
    return { ...current, make, vehicleModel };
  }

  const lookedUpMileage = lookup.currentMileage === undefined
    ? undefined
    : String(lookup.currentMileage);
  if (!lookedUpMileage || !isValidEvaMileage(lookedUpMileage)) {
    return { ...current, make, vehicleModel };
  }

  return {
    make,
    vehicleModel,
    mileage: lookedUpMileage,
    mileageUnit: lookup.mileageUnit === 'Km' ? 'Km' : 'Miles',
  };
}

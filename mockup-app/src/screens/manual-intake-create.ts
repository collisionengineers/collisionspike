import type { CreateCaseInput } from '@cs/domain';

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

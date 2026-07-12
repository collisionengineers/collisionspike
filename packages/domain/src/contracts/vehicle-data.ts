/**
 * Consumer view of the canonical Python vehicle-data.v1 response.
 *
 * The JSON Schema at /contracts/vehicle-data-v1.schema.json is authoritative.
 * This module contains no provider or estimator rules; it prevents the API and
 * orchestration callers from inventing local response shapes.
 */

export const VEHICLE_DATA_CONTRACT_VERSION = 'vehicle-data.v1' as const;
export const VEHICLE_DATA_ALGORITHM_VERSION = 'mot-display-estimator.v2' as const;

export const VEHICLE_LOOKUP_STATUSES = [
  'found',
  'not_found',
  'invalid_registration',
  'temporarily_unavailable',
  'configuration_error',
] as const;

export const MILEAGE_OUTCOME_STATUSES = [
  'observed',
  'estimated',
  'range_only',
  'insufficient',
] as const;

export type VehicleLookupStatus = (typeof VEHICLE_LOOKUP_STATUSES)[number];
export type MileageOutcomeStatus = (typeof MILEAGE_OUTCOME_STATUSES)[number];

export interface VehicleDataWarning {
  code: string;
  severity: 'warning' | 'blocking';
  message: string;
}

export interface VehicleDataContract {
  contract_version: typeof VEHICLE_DATA_CONTRACT_VERSION;
  algorithm_version: typeof VEHICLE_DATA_ALGORITHM_VERSION;
  lookup: {
    run_id: string;
    status: VehicleLookupStatus;
    requested_registration: string;
    canonical_registration: string;
    target_date: string;
    retrieved_at: string;
    provider_statuses: Record<string, VehicleLookupStatus>;
  };
  vehicle: Record<string, unknown>;
  provider_snapshots: Array<Record<string, unknown>>;
  mileage: {
    status: MileageOutcomeStatus;
    method: string;
    odometer_meaning: 'displayed_odometer';
    target_date: string;
    algorithm_version: typeof VEHICLE_DATA_ALGORITHM_VERSION;
    estimated_mileage?: number | null;
    observed_mileage?: number | null;
    annual_rate_miles?: number | null;
    prediction_interval?: Record<string, unknown> | null;
    range?: Record<string, unknown> | null;
    warnings: VehicleDataWarning[];
    evidence: {
      observations: Array<Record<string, unknown>>;
      intervals: Array<Record<string, unknown>>;
      anomaly_class: string;
    };
  };
}

/** Temporary bridge fields consumed until TKT-151 persists the nested contract. */
export interface VehicleDataEnrichmentResponse extends VehicleDataContract {
  vehicle_model?: string;
  make?: string;
  current_mileage?: number;
  mileage_unit?: 'Miles';
  mileage_method?: string;
  mileage_warnings?: VehicleDataWarning[];
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isWarning(value: unknown): value is VehicleDataWarning {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    (value.severity === 'warning' || value.severity === 'blocking') &&
    typeof value.message === 'string'
  );
}

/** Runtime boundary guard for the Python Function's canonical response. */
export function isVehicleDataEnrichmentResponse(
  value: unknown,
): value is VehicleDataEnrichmentResponse {
  if (!isRecord(value)) return false;
  if (value.contract_version !== VEHICLE_DATA_CONTRACT_VERSION) return false;
  if (value.algorithm_version !== VEHICLE_DATA_ALGORITHM_VERSION) return false;
  if (!isRecord(value.lookup) || !isRecord(value.mileage)) return false;
  if (!isRecord(value.vehicle) || !Array.isArray(value.provider_snapshots)) return false;
  if (!Array.isArray(value.warnings) || !value.warnings.every((item) => typeof item === 'string')) {
    return false;
  }
  if (
    typeof value.lookup.run_id !== 'string' ||
    !VEHICLE_LOOKUP_STATUSES.includes(value.lookup.status as VehicleLookupStatus) ||
    typeof value.lookup.requested_registration !== 'string' ||
    typeof value.lookup.canonical_registration !== 'string' ||
    typeof value.lookup.target_date !== 'string' ||
    typeof value.lookup.retrieved_at !== 'string' ||
    !isRecord(value.lookup.provider_statuses)
  ) {
    return false;
  }
  if (
    !MILEAGE_OUTCOME_STATUSES.includes(value.mileage.status as MileageOutcomeStatus) ||
    value.mileage.odometer_meaning !== 'displayed_odometer' ||
    value.mileage.algorithm_version !== VEHICLE_DATA_ALGORITHM_VERSION ||
    typeof value.mileage.method !== 'string' ||
    typeof value.mileage.target_date !== 'string' ||
    !Array.isArray(value.mileage.warnings) ||
    !value.mileage.warnings.every(isWarning) ||
    !isRecord(value.mileage.evidence) ||
    !Array.isArray(value.mileage.evidence.observations) ||
    !Array.isArray(value.mileage.evidence.intervals) ||
    typeof value.mileage.evidence.anomaly_class !== 'string'
  ) {
    return false;
  }
  return true;
}

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

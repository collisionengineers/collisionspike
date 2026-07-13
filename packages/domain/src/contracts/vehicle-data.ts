/**
 * Runtime consumer schema for the canonical Python vehicle-data.v1 response.
 *
 * `/contracts/vehicle-data-v1.schema.json` is authoritative. This Zod mirror
 * validates every property constrained by that schema before orchestration or
 * the API may persist the envelope. Objects remain passthrough only where the
 * authoritative JSON Schema permits additional properties.
 */
import { z } from 'zod';

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

export const MILEAGE_METHODS = [
  'observed_mot',
  'bounded_interpolation',
  'recent_rate_forecast',
  'cohort_assisted_forecast',
  'cohort_assisted_backcast',
  'displayed_segment_only',
  'none',
] as const;

export type VehicleLookupStatus = (typeof VEHICLE_LOOKUP_STATUSES)[number];
export type MileageOutcomeStatus = (typeof MILEAGE_OUTCOME_STATUSES)[number];

const lookupStatusSchema = z.enum(VEHICLE_LOOKUP_STATUSES);
const nonNegativeInteger = z.number().int().nonnegative();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dateTimeSchema = z.string().datetime({ offset: true });
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

export const vehicleDataWarningSchema = z
  .object({
    code: z.string(),
    severity: z.enum(['warning', 'blocking']),
    message: z.string(),
  })
  .passthrough();

export type VehicleDataWarning = z.infer<typeof vehicleDataWarningSchema>;

const observationSchema = z
  .object({
    observation_id: z.string(),
    raw_index: nonNegativeInteger,
    source: z.string(),
    mot_test_number: z.string().nullable(),
    test_date: dateSchema.nullable(),
    test_result: z.string().nullable(),
    odometer_value_raw: z.string().nullable(),
    odometer_unit_raw: z.string().nullable(),
    odometer_result_type_raw: z.string().nullable(),
    registration_at_test: z.string().nullable(),
    stable_vehicle_identity: z.string().nullable(),
    normalized_miles: z.number().nonnegative().nullable(),
    decisions: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .passthrough();

const predictionIntervalSchema = z
  .object({
    coverage: z.number().gt(0).lt(1),
    lower_mileage: nonNegativeInteger,
    upper_mileage: nonNegativeInteger,
    calibration_version: z.string().min(1),
    dataset_digest: sha256Schema,
    sample_size: z.number().int().min(30),
  })
  .strict()
  .refine((value) => value.lower_mileage <= value.upper_mileage, {
    message: 'prediction interval lower bound exceeds upper bound',
  });

const mileageRangeSchema = z
  .object({
    lower_mileage: nonNegativeInteger,
    upper_mileage: nonNegativeInteger,
    basis: z.enum([
      'observed_mot',
      'logical_bounds',
      'rate_dispersion_not_calibrated',
    ]),
  })
  .strict()
  .refine((value) => value.lower_mileage <= value.upper_mileage, {
    message: 'mileage range lower bound exceeds upper bound',
  });

const cohortPriorSchema = z
  .object({
    version: z.string().min(1),
    dataset_digest: sha256Schema,
    annual_rate_miles: z.number().int().min(0).max(100_000),
    annual_sigma_miles: z.number().int().positive(),
    sample_size: z.number().int().min(200),
    cohort: z.record(z.string(), z.unknown()),
  })
  .strict();

const mileageSchema = z
  .object({
    status: z.enum(MILEAGE_OUTCOME_STATUSES),
    method: z.enum(MILEAGE_METHODS),
    odometer_meaning: z.literal('displayed_odometer'),
    target_date: dateSchema,
    algorithm_version: z.literal(VEHICLE_DATA_ALGORITHM_VERSION),
    observed_mileage: nonNegativeInteger.nullable().optional(),
    estimated_mileage: nonNegativeInteger.nullable().optional(),
    annual_rate_miles: nonNegativeInteger.nullable().optional(),
    reason: z.string().nullable().optional(),
    prediction_interval: predictionIntervalSchema.nullable().optional(),
    range: mileageRangeSchema.nullable().optional(),
    prior: cohortPriorSchema.nullable().optional(),
    warnings: z.array(vehicleDataWarningSchema),
    evidence: z
      .object({
        observations: z.array(observationSchema),
        intervals: z.array(z.record(z.string(), z.unknown())),
        anomaly_class: z.string(),
      })
      .passthrough(),
  })
  .passthrough();

const providerSnapshotSchema = z
  .object({
    provider: z.enum(['dvsa_mot_history_v1', 'dvla_vehicle_enquiry_v1']),
    retrieved_at: dateTimeSchema,
    status: lookupStatusSchema,
    payload_sha256: sha256Schema.nullable(),
    raw_payload: z.record(z.string(), z.unknown()).nullable(),
    error_class: z.string().nullable(),
    error_code: z.string().nullable(),
  })
  .passthrough();

export const vehicleDataEnrichmentResponseSchema = z
  .object({
    contract_version: z.literal(VEHICLE_DATA_CONTRACT_VERSION),
    algorithm_version: z.literal(VEHICLE_DATA_ALGORITHM_VERSION),
    lookup: z
      .object({
        run_id: z.string().uuid(),
        status: lookupStatusSchema,
        requested_registration: z.string(),
        canonical_registration: z.string().regex(/^[A-Z0-9]{0,16}$/),
        target_date: dateSchema,
        retrieved_at: dateTimeSchema,
        provider_statuses: z.record(z.string(), lookupStatusSchema),
      })
      .strict(),
    vehicle: z.record(z.string(), z.unknown()),
    provider_snapshots: z.array(providerSnapshotSchema),
    mileage: mileageSchema,
    // Mechanical bridge fields emitted by legacy_enrichment_adapter.
    vehicle_model: z.string().optional(),
    make: z.string().optional(),
    current_mileage: nonNegativeInteger.optional(),
    mileage_unit: z.literal('Miles').optional(),
    mileage_method: z.enum(MILEAGE_METHODS).optional(),
    mileage_warnings: z.array(vehicleDataWarningSchema).optional(),
    warnings: z.array(z.string()),
  })
  .passthrough();

export type VehicleDataEnrichmentResponse = z.infer<
  typeof vehicleDataEnrichmentResponseSchema
>;
export type VehicleDataContract = Omit<
  VehicleDataEnrichmentResponse,
  | 'vehicle_model'
  | 'make'
  | 'current_mileage'
  | 'mileage_unit'
  | 'mileage_method'
  | 'mileage_warnings'
  | 'warnings'
>;

export function parseVehicleDataEnrichmentResponse(
  value: unknown,
): VehicleDataEnrichmentResponse | undefined {
  const parsed = vehicleDataEnrichmentResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function isVehicleDataEnrichmentResponse(
  value: unknown,
): value is VehicleDataEnrichmentResponse {
  return vehicleDataEnrichmentResponseSchema.safeParse(value).success;
}

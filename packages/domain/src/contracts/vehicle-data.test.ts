import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MILEAGE_OUTCOME_STATUSES,
  VEHICLE_DATA_ALGORITHM_VERSION,
  VEHICLE_DATA_CONTRACT_VERSION,
  VEHICLE_LOOKUP_STATUSES,
  isVehicleDataEnrichmentResponse,
} from './vehicle-data.js';

describe('vehicle-data consumer contract parity', () => {
  const schema = JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL('../../../../contracts/vehicle-data-v1.schema.json', import.meta.url),
      ),
      'utf8',
    ),
  );

  it('keeps versions and status unions aligned with the authoritative JSON Schema', () => {
    expect(schema.properties.contract_version.const).toBe(VEHICLE_DATA_CONTRACT_VERSION);
    expect(schema.properties.algorithm_version.const).toBe(VEHICLE_DATA_ALGORITHM_VERSION);
    expect(schema.$defs.lookupStatus.enum).toEqual([...VEHICLE_LOOKUP_STATUSES]);
    expect(schema.properties.mileage.properties.status.enum).toEqual([
      ...MILEAGE_OUTCOME_STATUSES,
    ]);
  });

  it('rejects non-canonical fail-soft payloads at runtime', () => {
    expect(isVehicleDataEnrichmentResponse({ warnings: ['failed'] })).toBe(false);
    expect(
      isVehicleDataEnrichmentResponse({
        contract_version: VEHICLE_DATA_CONTRACT_VERSION,
        algorithm_version: VEHICLE_DATA_ALGORITHM_VERSION,
        lookup: {
          run_id: '00000000-0000-0000-0000-000000000152',
          status: 'temporarily_unavailable',
          requested_registration: 'TE57VRM',
          canonical_registration: 'TE57VRM',
          target_date: '2026-07-12',
          retrieved_at: '2026-07-12T00:00:00+00:00',
          provider_statuses: {},
        },
        vehicle: {},
        provider_snapshots: [],
        mileage: {
          status: 'insufficient',
          method: 'none',
          odometer_meaning: 'displayed_odometer',
          target_date: '2026-07-12',
          algorithm_version: VEHICLE_DATA_ALGORITHM_VERSION,
          warnings: [
            { code: 'enrichment_failed', severity: 'blocking', message: 'Unavailable.' },
          ],
          evidence: { observations: [], intervals: [], anomaly_class: 'not_evaluated' },
        },
        warnings: ['Unavailable.'],
      }),
    ).toBe(true);
  });

  it('validates every constrained nested field and never coerces mileage text', () => {
    const valid = {
      contract_version: VEHICLE_DATA_CONTRACT_VERSION,
      algorithm_version: VEHICLE_DATA_ALGORITHM_VERSION,
      lookup: {
        run_id: '00000000-0000-4000-8000-000000000152',
        status: 'found',
        requested_registration: 'TE57VRM',
        canonical_registration: 'TE57VRM',
        target_date: '2026-07-13',
        retrieved_at: '2026-07-13T00:00:00+00:00',
        provider_statuses: { dvsa: 'found' },
      },
      vehicle: {},
      provider_snapshots: [
        {
          provider: 'dvsa_mot_history_v1',
          retrieved_at: '2026-07-13T00:00:00+00:00',
          status: 'found',
          payload_sha256: 'a'.repeat(64),
          raw_payload: {},
          error_class: null,
          error_code: null,
        },
      ],
      mileage: {
        status: 'estimated',
        method: 'recent_rate_forecast',
        odometer_meaning: 'displayed_odometer',
        target_date: '2026-07-13',
        algorithm_version: VEHICLE_DATA_ALGORITHM_VERSION,
        estimated_mileage: 50_000,
        prediction_interval: null,
        range: {
          lower_mileage: 46_000,
          upper_mileage: 54_000,
          basis: 'rate_dispersion_not_calibrated',
        },
        warnings: [],
        evidence: {
          observations: [
            {
              observation_id: 'obs-1',
              raw_index: 0,
              source: 'DVSA',
              mot_test_number: '123',
              test_date: '2025-01-01',
              test_result: 'PASSED',
              odometer_value_raw: '42000',
              odometer_unit_raw: 'MI',
              odometer_result_type_raw: 'READ',
              registration_at_test: 'TE57VRM',
              stable_vehicle_identity: null,
              normalized_miles: 42_000,
              decisions: [],
              warnings: [],
            },
          ],
          intervals: [],
          anomaly_class: 'clean',
        },
      },
      current_mileage: 50_000,
      mileage_unit: 'Miles',
      mileage_method: 'recent_rate_forecast',
      warnings: [],
    };
    expect(isVehicleDataEnrichmentResponse(valid)).toBe(true);
    expect(
      isVehicleDataEnrichmentResponse({ ...valid, current_mileage: '50,000 miles' }),
    ).toBe(false);
    expect(
      isVehicleDataEnrichmentResponse({
        ...valid,
        provider_snapshots: [{ ...valid.provider_snapshots[0], payload_sha256: 'bad' }],
      }),
    ).toBe(false);
    expect(
      isVehicleDataEnrichmentResponse({
        ...valid,
        mileage: {
          ...valid.mileage,
          range: { ...valid.mileage.range, lower_mileage: 60_000 },
        },
      }),
    ).toBe(false);
    expect(
      isVehicleDataEnrichmentResponse({
        ...valid,
        mileage: {
          ...valid.mileage,
          evidence: {
            ...valid.mileage.evidence,
            observations: [
              { ...valid.mileage.evidence.observations[0], raw_index: -1 },
            ],
          },
        },
      }),
    ).toBe(false);
  });
});

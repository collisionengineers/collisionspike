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
});

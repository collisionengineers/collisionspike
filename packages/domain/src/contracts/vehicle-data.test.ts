import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MILEAGE_OUTCOME_STATUSES,
  VEHICLE_DATA_ALGORITHM_VERSION,
  VEHICLE_DATA_CONTRACT_VERSION,
  VEHICLE_LOOKUP_STATUSES,
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
});

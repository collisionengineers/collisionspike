import { describe, expect, it } from 'vitest';
import { ConflictError, DataApiHttpError } from './data-api.js';
import {
  isRetryableVehicleLookupFailure,
  vehicleDataIntakeIdempotencyKey,
} from './vehicle-data-intake.js';

describe('vehicle-data intake replay identity', () => {
  it('bounds arbitrarily long Graph-backed instance ids while remaining deterministic', () => {
    const longInstance = `intake-${'A'.repeat(2_000)}`;
    const first = vehicleDataIntakeIdempotencyKey(longInstance, '00000000-0000-4000-8000-000000000152');
    const again = vehicleDataIntakeIdempotencyKey(longInstance, '00000000-0000-4000-8000-000000000152');
    const different = vehicleDataIntakeIdempotencyKey(`${longInstance}B`, '00000000-0000-4000-8000-000000000152');

    expect(first).toBe(again);
    expect(first).not.toBe(different);
    expect(first.length).toBeLessThanOrEqual(200);
    expect(first).toMatch(/^intake:[0-9a-f]{64}:vehicle-data:/);
  });
});

describe('vehicle-data advisory failure policy', () => {
  it('skips permanent 4xx/conflict responses and retries transient transport failures', () => {
    expect(isRetryableVehicleLookupFailure(new DataApiHttpError('forbidden', 403, 'forbidden'))).toBe(false);
    expect(isRetryableVehicleLookupFailure(new ConflictError('replay conflict'))).toBe(false);
    expect(isRetryableVehicleLookupFailure(new DataApiHttpError('unavailable', 503, 'unavailable'))).toBe(true);
    expect(isRetryableVehicleLookupFailure(new TypeError('network failed'))).toBe(true);
  });
});

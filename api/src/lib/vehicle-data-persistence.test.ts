import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseVehicleDataEnrichmentResponse } from '@cs/domain';

const harness = vi.hoisted(() => ({
  caseRow: { id: 'case-1', eva_vehicle_model: '', eva_mileage: '', eva_mileage_unit: '' },
  calls: [] as Array<{ sql: string; params: unknown[] }>,
}));

vi.mock('./db.js', () => ({
  tx: async (fn: (q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
    fn(async (sql: string, params: unknown[] = []) => {
      harness.calls.push({ sql, params });
      if (sql.includes('FROM case_ WHERE id = $1 FOR UPDATE')) return [harness.caseRow];
      if (sql.startsWith('SELECT case_id FROM vehicle_lookup_run')) return [{ case_id: 'case-1' }];
      if (sql.includes('INSERT INTO vehicle_provider_snapshot')) return [{ id: `snapshot-${String(params[1])}` }];
      if (sql.includes('SELECT id, provider_status, payload_sha256 FROM vehicle_provider_snapshot')) {
        return [{ id: `snapshot-${String(params[1])}`, provider_status: 'found', payload_sha256: 'a'.repeat(64) }];
      }
      return [];
    }),
}));

import { persistVehicleData } from './vehicle-data-persistence.js';

function result() {
  return parseVehicleDataEnrichmentResponse({
    contract_version: 'vehicle-data.v1',
    algorithm_version: 'mot-display-estimator.v2',
    lookup: {
      run_id: '00000000-0000-4000-8000-000000000152',
      status: 'found',
      requested_registration: 'AB12CDE',
      canonical_registration: 'AB12CDE',
      target_date: '2026-07-13',
      retrieved_at: '2026-07-13T00:00:00+00:00',
      provider_statuses: { dvsa: 'found' },
    },
    vehicle: {},
    provider_snapshots: [{
      provider: 'dvsa_mot_history_v1',
      retrieved_at: '2026-07-13T00:00:00+00:00',
      status: 'found',
      payload_sha256: 'a'.repeat(64),
      raw_payload: {},
      error_class: null,
      error_code: null,
    }],
    mileage: {
      status: 'estimated',
      method: 'recent_rate_forecast',
      odometer_meaning: 'displayed_odometer',
      target_date: '2026-07-13',
      algorithm_version: 'mot-display-estimator.v2',
      estimated_mileage: 50_000,
      range: { lower_mileage: 46_000, upper_mileage: 54_000, basis: 'rate_dispersion_not_calibrated' },
      warnings: [],
      evidence: { observations: [], intervals: [], anomaly_class: 'clean' },
    },
    make: 'FORD',
    vehicle_model: 'FOCUS',
    current_mileage: 50_000,
    mileage_unit: 'Miles',
    mileage_method: 'recent_rate_forecast',
    warnings: [],
  })!;
}

beforeEach(() => {
  harness.caseRow = { id: 'case-1', eva_vehicle_model: '', eva_mileage: '', eva_mileage_unit: '' };
  harness.calls.length = 0;
});

describe('persistVehicleData', () => {
  it('stores the immutable envelope and fills exact numeric mileage without text coercion', async () => {
    await expect(persistVehicleData('case-1', result())).resolves.toMatchObject({
      applied: ['vehicleModel', 'mileage', 'mileageUnit'],
      retryable: false,
    });
    const mileageUpdate = harness.calls.find((call) => call.sql.includes("eva_mileage = $2"));
    expect(mileageUpdate?.params).toEqual(['case-1', '50000']);
    expect(harness.calls.some((call) => call.sql.includes('INSERT INTO mileage_estimate_result'))).toBe(true);
    expect(harness.calls.some((call) => call.sql.includes('INSERT INTO vehicle_lookup_run'))).toBe(true);
  });

  it('does not replace parser or staff-confirmed vehicle fields', async () => {
    harness.caseRow = {
      id: 'case-1',
      eva_vehicle_model: 'Confirmed model',
      eva_mileage: '61000',
      eva_mileage_unit: 'Miles',
    };
    const persisted = await persistVehicleData('case-1', result());
    expect(persisted.applied).toEqual([]);
    expect(harness.calls.some((call) => call.sql.includes("SET eva_mileage = $2"))).toBe(false);
    expect(harness.calls.some((call) => call.sql.includes('SET eva_vehicle_model = $2'))).toBe(false);
  });
});

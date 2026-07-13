import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseVehicleDataEnrichmentResponse } from '@cs/domain';

const harness = vi.hoisted(() => ({
  caseRow: { id: 'case-1', eva_vehicle_model: '', eva_mileage: '', eva_mileage_unit: '' },
  calls: [] as Array<{ sql: string; params: unknown[] }>,
  runRow: undefined as Record<string, unknown> | undefined,
  snapshotRows: new Map<string, Record<string, unknown>>(),
  profileRows: new Map<string, Record<string, unknown>>(),
}));

vi.mock('./db.js', () => ({
  query: async (sql: string, params: unknown[] = []) => dbQuery(sql, params),
  tx: async (fn: (q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
    fn(dbQuery),
}));

async function dbQuery(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
      harness.calls.push({ sql, params });
      if (sql.includes('FROM case_ WHERE id = $1 FOR UPDATE')) return [harness.caseRow];
      if (sql.includes('INSERT INTO mileage_model_profile')) {
        const key = `${String(params[0])}:${String(params[1])}`;
        if (!harness.profileRows.has(key)) {
          harness.profileRows.set(key, {
            profile_kind: params[0],
            dataset_digest: params[2],
            profile: JSON.parse(String(params[3])),
          });
        }
        return [];
      }
      if (sql.includes('SELECT profile_kind, dataset_digest, profile FROM mileage_model_profile')) {
        const row = harness.profileRows.get(`${String(params[0])}:${String(params[1])}`);
        return row ? [row] : [];
      }
      if (sql.includes('INSERT INTO vehicle_lookup_run')) {
        const existed = harness.runRow !== undefined;
        if (!existed) {
          harness.runRow = {
            case_id: params[1],
            idempotency_key: params[9],
            request_sha256: params[10],
            response_sha256: params[11],
            response_envelope: JSON.parse(String(params[12])),
          };
        }
        return existed ? [] : [{ id: params[0] }];
      }
      if (sql.includes('FROM vehicle_lookup_run')) return harness.runRow ? [harness.runRow] : [];
      if (sql.includes('INSERT INTO vehicle_provider_snapshot')) {
        const id = `snapshot-${String(params[1])}`;
        harness.snapshotRows.set(String(params[1]), {
          id,
          provider_status: params[2],
          payload_sha256: params[4],
        });
        return [{ id }];
      }
      if (sql.includes('SELECT id, provider_status, payload_sha256 FROM vehicle_provider_snapshot')) {
        const row = harness.snapshotRows.get(String(params[1]));
        return row ? [row] : [];
      }
      return [];
}

import {
  loadVehicleDataReplay,
  persistVehicleData,
  vehicleDataDigest,
} from './vehicle-data-persistence.js';

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
      auto_fill_eligible: true,
      estimated_mileage: 50_000,
      prediction_interval: {
        coverage: 0.9,
        lower_mileage: 47_000,
        upper_mileage: 53_000,
        calibration_version: 'calibration-v1',
        dataset_digest: 'b'.repeat(64),
        sample_size: 1000,
      },
      calibration_profile: {
        version: 'calibration-v1',
        dataset_digest: 'b'.repeat(64),
        target_coverage: 0.9,
        useful_tolerance_miles: 2500,
        validated_horizon_days: 730,
        minimum_bucket_size: 30,
        holdout_sample_size: 1000,
        observed_coverage: 0.9,
        buckets: [{
          method: 'recent_rate_forecast',
          max_horizon_days: 730,
          min_clean_intervals: 1,
          anomaly_class: 'clean',
          error_q_low: -3000,
          error_q_high: 3000,
          sample_size: 1000,
        }],
      },
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
  harness.runRow = undefined;
  harness.snapshotRows.clear();
  harness.profileRows.clear();
});

describe('persistVehicleData', () => {
  it('stores the immutable envelope and fills exact numeric mileage without text coercion', async () => {
    await expect(persistVehicleData('case-1', result(), {
      source: 'case_lookup',
      document_has_mileage: false,
      request_sha256: 'b'.repeat(64),
    })).resolves.toMatchObject({
      applied: ['vehicleModel', 'mileage', 'mileageUnit'],
      retryable: false,
      replayed: false,
    });
    const mileageUpdate = harness.calls.find((call) => call.sql.includes("eva_mileage = $2"));
    expect(mileageUpdate?.params).toEqual(['case-1', '50000']);
    expect(harness.calls.some((call) => call.sql.includes('INSERT INTO mileage_estimate_result'))).toBe(true);
    expect(harness.calls.some((call) => call.sql.includes('INSERT INTO vehicle_lookup_run'))).toBe(true);
    const calibrationInsert = harness.calls.find(
      (call) =>
        call.sql.includes('INSERT INTO mileage_model_profile') &&
        call.params[0] === 'calibration',
    );
    expect(JSON.parse(String(calibrationInsert?.params[3]))).toEqual(
      result().mileage.calibration_profile,
    );
    expect(JSON.parse(String(calibrationInsert?.params[3]))).not.toEqual(
      result().mileage.prediction_interval,
    );
  });

  it('does not replace parser or staff-confirmed vehicle fields', async () => {
    harness.caseRow = {
      id: 'case-1',
      eva_vehicle_model: 'Confirmed model',
      eva_mileage: '61000',
      eva_mileage_unit: 'Miles',
    };
    const persisted = await persistVehicleData('case-1', result(), {
      source: 'case_lookup',
      document_has_mileage: false,
      request_sha256: 'b'.repeat(64),
    });
    expect(persisted.applied).toEqual([]);
    expect(harness.calls.some((call) => call.sql.includes("SET eva_mileage = $2"))).toBe(false);
    expect(harness.calls.some((call) => call.sql.includes('SET eva_vehicle_model = $2'))).toBe(false);
  });

  it('never auto-fills an uncalibrated estimate even when its point is visible', async () => {
    const uncalibrated = result();
    uncalibrated.mileage.auto_fill_eligible = false;
    delete uncalibrated.current_mileage;
    const persisted = await persistVehicleData('case-1', uncalibrated, {
      source: 'case_lookup',
      document_has_mileage: false,
      request_sha256: 'c'.repeat(64),
    });
    expect(persisted.applied).toEqual(['vehicleModel']);
    expect(harness.calls.some((call) => call.sql.includes('SET eva_mileage = $2'))).toBe(false);
  });

  it('fills a non-numeric legacy mileage through the shared strict boundary', async () => {
    harness.caseRow = {
      id: 'case-1',
      eva_vehicle_model: '',
      eva_mileage: '50,000 miles',
      eva_mileage_unit: '',
    };
    const persisted = await persistVehicleData('case-1', result(), {
      source: 'case_lookup',
      document_has_mileage: false,
      request_sha256: 'd'.repeat(64),
    });
    expect(persisted.applied).toContain('mileage');
  });

  it('persists the raw completion timestamp, episode, segment and actual booleans', async () => {
    const withObservation = result();
    withObservation.mileage.evidence.observations = [{
      observation_id: 'obs-1',
      raw_index: 0,
      source: 'dvsa',
      mot_test_number: '123',
      test_date: '2025-01-02',
      completed_date_raw: '2025-01-02T11:22:33Z',
      test_result: 'PASSED',
      odometer_value_raw: '45000',
      odometer_unit_raw: 'MI',
      odometer_result_type_raw: 'READ',
      registration_at_test: 'AB12CDE',
      stable_vehicle_identity: null,
      normalized_miles: 45_000,
      episode: 3,
      segment: 2,
      selected_for_event: true,
      included_for_rate: false,
      decisions: ['episode_selected'],
      warnings: [],
    }];
    await persistVehicleData('case-1', withObservation, {
      source: 'case_lookup',
      document_has_mileage: false,
      request_sha256: 'e'.repeat(64),
    });
    const insert = harness.calls.find((call) => call.sql.includes('INSERT INTO mot_odometer_observation'));
    expect(insert?.params.slice(6)).toEqual([
      '2025-01-02T11:22:33Z', '2025-01-02', 'PASSED', '45000', 'MI', 'READ',
      'AB12CDE', null, 45_000, 3, 2, true, false, ['episode_selected'], [],
    ]);
  });

  it('replays one caller key without another immutable row or provenance write', async () => {
    const response = result();
    const requestSha256 = 'f'.repeat(64);
    await persistVehicleData('case-1', response, {
      source: 'orchestration',
      document_has_mileage: false,
      idempotency_key: 'intake:run-1:case-1',
      request_sha256: requestSha256,
    });
    const sideEffectsBeforeReplay = harness.calls.filter((call) => /INSERT INTO (field_level_provenance|audit_event)/.test(call.sql)).length;
    const persistedReplay = await persistVehicleData('case-1', response, {
      source: 'orchestration',
      document_has_mileage: false,
      idempotency_key: 'intake:run-1:case-1',
      request_sha256: requestSha256,
    });
    expect(persistedReplay).toMatchObject({ replayed: true, applied: [] });
    expect(harness.calls.filter((call) => /INSERT INTO (field_level_provenance|audit_event)/.test(call.sql)))
      .toHaveLength(sideEffectsBeforeReplay);
    const changedResponse = structuredClone(response);
    changedResponse.mileage.estimated_mileage = 50_100;
    changedResponse.current_mileage = 50_100;
    await expect(persistVehicleData('case-1', changedResponse, {
      source: 'orchestration',
      document_has_mileage: false,
      idempotency_key: 'intake:run-1:case-1',
      request_sha256: requestSha256,
    })).resolves.toMatchObject({ replayed: true, applied: [] });
    const replay = await loadVehicleDataReplay('case-1', 'intake:run-1:case-1', requestSha256);
    expect(replay?.result.lookup.run_id).toBe(response.lookup.run_id);
    expect(replay?.persisted).toMatchObject({ replayed: true, applied: [] });
    expect(harness.calls.filter((call) => /INSERT INTO (field_level_provenance|audit_event)/.test(call.sql)))
      .toHaveLength(sideEffectsBeforeReplay);
    expect(harness.runRow?.response_sha256).toBe(vehicleDataDigest(response));
    await expect(loadVehicleDataReplay('case-1', 'intake:run-1:case-1', '0'.repeat(64)))
      .rejects.toThrow('conflicts with another request');
  });

  it('preserves a partial provider outage as a durable retryable warning', async () => {
    const partial = result();
    partial.lookup.provider_statuses.dvsa = 'temporarily_unavailable';
    partial.lookup.provider_statuses.dvla = 'configuration_error';
    partial.provider_snapshots[0] = {
      ...partial.provider_snapshots[0],
      status: 'temporarily_unavailable',
      payload_sha256: null,
      raw_payload: null,
      error_class: 'ProviderTemporaryError',
      error_code: 'timeout',
    };
    partial.provider_snapshots.push({
      provider: 'dvla_vehicle_enquiry_v1',
      retrieved_at: '2026-07-13T00:00:00+00:00',
      status: 'configuration_error',
      payload_sha256: null,
      raw_payload: null,
      error_class: 'ProviderConfigurationError',
      error_code: 'not_configured',
    });
    const persisted = await persistVehicleData('case-1', partial, {
      source: 'case_lookup',
      document_has_mileage: false,
      request_sha256: '1'.repeat(64),
    });
    expect(persisted.retryable).toBe(true);
    expect(persisted.warning).toContain('MOT history is temporarily unavailable');
    expect(persisted.warning).toContain('Vehicle make and model are unavailable');
  });

  it('namespaces equal model versions by profile kind', async () => {
    const sameVersion = result();
    sameVersion.mileage.prior = {
      version: 'calibration-v1',
      dataset_digest: 'c'.repeat(64),
      annual_rate_miles: 8000,
      annual_sigma_miles: 2500,
      sample_size: 1000,
      cohort: { vehicle_type: 'all' },
    };
    await persistVehicleData('case-1', sameVersion, {
      source: 'case_lookup',
      document_has_mileage: false,
      request_sha256: '2'.repeat(64),
    });
    expect([...harness.profileRows.keys()].sort()).toEqual([
      'calibration:calibration-v1',
      'cohort_prior:calibration-v1',
    ]);
  });

  it('rejects reused model versions whose immutable profile content changed', async () => {
    const first = result();
    await persistVehicleData('case-1', first, {
      source: 'case_lookup',
      document_has_mileage: false,
      request_sha256: '5'.repeat(64),
    });

    harness.runRow = undefined;
    const changed = result();
    changed.lookup.run_id = '00000000-0000-4000-8000-000000000153';
    changed.mileage.calibration_profile!.useful_tolerance_miles = 3000;
    await expect(persistVehicleData('case-1', changed, {
      source: 'case_lookup',
      document_has_mileage: false,
      request_sha256: '6'.repeat(64),
    })).rejects.toThrow('profile version conflicts');
  });

  it('translates estimator diagnostics into handler guidance and suppresses document-mileage skips', async () => {
    const diagnostic = result();
    diagnostic.mileage.status = 'insufficient';
    diagnostic.mileage.auto_fill_eligible = false;
    delete diagnostic.current_mileage;
    diagnostic.mileage.reason = 'internal_estimator_branch_x';
    diagnostic.mileage.warnings = [{
      code: 'unknown_odometer_unit',
      severity: 'blocking',
      message: 'internal diagnostic should never render',
    }];
    const persisted = await persistVehicleData('case-1', diagnostic, {
      source: 'case_lookup',
      document_has_mileage: false,
      request_sha256: '3'.repeat(64),
    });
    expect(persisted.warning).toContain('One MOT reading has no clear mileage unit');
    expect(persisted.warning).not.toContain('internal');

    harness.runRow = undefined;
    const authoritative = result();
    authoritative.mileage.status = 'insufficient';
    authoritative.mileage.method = 'none';
    authoritative.mileage.auto_fill_eligible = false;
    authoritative.mileage.prediction_interval = null;
    authoritative.mileage.calibration_profile = null;
    delete authoritative.current_mileage;
    authoritative.mileage.warnings = [{
      code: 'document_mileage_authoritative',
      severity: 'warning',
      message: 'Mileage from the instruction is authoritative; the MOT estimate was skipped.',
    }];
    const skipped = await persistVehicleData('case-1', authoritative, {
      source: 'case_lookup',
      document_has_mileage: true,
      request_sha256: '4'.repeat(64),
    });
    expect(skipped.warning).toBeUndefined();
  });
});

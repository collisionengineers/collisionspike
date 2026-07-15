import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function schema(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../migration/assets/schema/${relative}`, import.meta.url)),
    'utf8',
  );
}

describe('TKT-152 vehicle-data schema parity', () => {
  const canonical = schema('200_vehicle_data.sql');
  const delta = schema('deltas/2026-07-12-tkt152-vehicle-data.sql');

  it('carries every immutable run/snapshot/observation/result/profile table in both paths', () => {
    for (const table of [
      'mileage_model_profile',
      'vehicle_lookup_run',
      'vehicle_provider_snapshot',
      'mot_odometer_observation',
      'mileage_estimate_result',
    ]) {
      expect(canonical).toContain(`CREATE TABLE ${table}`);
      expect(delta).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    for (const field of [
      'case_id',
      'mot_test_number',
      'completed_date_raw',
      'odometer_value_raw',
      'odometer_unit_raw',
      'odometer_result_type_raw',
      'registration_at_test',
      'stable_vehicle_identity',
      'episode_number',
      'segment_number',
      'decision_codes',
      'warning_codes',
    ]) {
      expect(canonical).toContain(field);
      expect(delta).toContain(field);
    }
  });

  it('is append-only for the application login and forced behind RLS', () => {
    const policies = schema('900_constraints.sql');
    for (const table of [
      'mileage_model_profile',
      'vehicle_lookup_run',
      'vehicle_provider_snapshot',
      'mot_odometer_observation',
      'mileage_estimate_result',
    ]) {
      expect(canonical).toContain(`GRANT SELECT, INSERT ON ${table} TO cespk_app`);
      expect(delta).toContain(`GRANT SELECT, INSERT ON ${table} TO cespk_app`);
      expect(canonical).not.toContain(`GRANT UPDATE ON ${table}`);
      expect(delta).not.toContain(`GRANT UPDATE ON ${table}`);
      expect(canonical).not.toContain(`GRANT DELETE ON ${table}`);
      expect(delta).not.toContain(`GRANT DELETE ON ${table}`);
      expect(policies).toContain(`'${table}'`);
    }
    expect(delta).toContain('ENABLE ROW LEVEL SECURITY');
    expect(delta).toContain('FORCE ROW LEVEL SECURITY');
    expect(delta).toContain("FOR SELECT");
    expect(delta).toContain("FOR INSERT");
    expect(delta).not.toContain("FOR UPDATE");
    expect(delta).not.toContain("FOR DELETE");
  });

  it('binds every raw MOT observation to a snapshot from the same lookup run', () => {
    for (const sql of [canonical, delta]) {
      expect(sql).toContain('uq_vehicle_provider_snapshot_id_run');
      expect(sql).toContain('UNIQUE (id, lookup_run_id)');
      expect(sql).toContain('fk_mot_observation_snapshot_run');
      expect(sql).toContain('FOREIGN KEY (provider_snapshot_id, lookup_run_id)');
      expect(sql).toContain(
        'REFERENCES vehicle_provider_snapshot(id, lookup_run_id) ON DELETE RESTRICT',
      );
    }
  });

  it('binds caller retries to an exact persisted request and response envelope', () => {
    for (const sql of [canonical, delta]) {
      expect(sql).toContain('idempotency_key');
      expect(sql).toContain('request_sha256');
      expect(sql).toContain('response_sha256');
      expect(sql).toContain('response_envelope');
      expect(sql).toContain('ux_vehicle_lookup_run_idempotency');
    }
  });

  it('adds the typed current lookup projection to cases in fresh and delta paths', () => {
    for (const sql of [canonical, delta]) {
      for (const column of [
        'last_vehicle_lookup_run_id',
        'vehicle_lookup_status',
        'vehicle_lookup_warning',
        'vehicle_lookup_retryable',
        'vehicle_lookup_attempted_at',
        'vehicle_mileage_status',
        'vehicle_mileage_method',
      ]) expect(sql).toContain(column);
      expect(sql).toContain('fk_case_last_vehicle_lookup');
      expect(sql).toContain('REFERENCES vehicle_lookup_run(id) ON DELETE SET NULL');
    }
  });
});

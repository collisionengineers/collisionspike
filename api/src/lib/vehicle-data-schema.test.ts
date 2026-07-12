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
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function schema(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../migration/assets/schema/${relative}`, import.meta.url)),
    'utf8',
  );
}

describe('staff evidence upload schema', () => {
  it('binds a retry key to one case/actor/source/manifest in canonical and live delta DDL', () => {
    for (const sql of [
      schema('195_staff_evidence_upload.sql'),
      schema('deltas/2026-07-12-tkt165-staff-evidence-upload.sql'),
    ]) {
      expect(sql).toContain('CREATE TABLE');
      expect(sql).toContain('staff_evidence_upload');
      expect(sql).toContain('idempotency_key');
      expect(sql).toContain('manifest_hash');
      expect(sql).toContain('staff_evidence_upload_item');
      expect(sql).toContain('blob_path');
      expect(sql).toContain("'cleanup_pending'");
      expect(sql).toContain('ix_staff_evidence_upload_item_cleanup');
      expect(sql).toContain('uq_evidence_staff_upload_item');
      expect(sql).toContain("'staff_add_evidence'");
      expect(sql).toContain("'staff_legacy_upload'");
    }
  });

  it('persists one resumable manual case operation and gates incomplete source batches', () => {
    for (const sql of [
      schema('196_manual_intake_case_create.sql'),
      schema('deltas/2026-07-12-tkt166-manual-intake-case-create.sql'),
    ]) {
      expect(sql).toContain('manual_intake_case_create_operation');
      expect(sql).toContain('request_hash');
      expect(sql).toContain('upload_idempotency_key');
      expect(sql).toContain('expected_file_count');
      expect(sql).toContain('evidence_completed_at');
      expect(sql).toContain('ix_manual_intake_case_create_pending');
    }
    expect(schema('000_enums_lookups.sql')).toContain('evidence_upload_result');
    expect(schema('deltas/2026-07-12-tkt166-manual-intake-case-create.sql'))
      .toContain('evidence_upload_result');
    const canonicalPolicies = schema('900_constraints.sql');
    const delta = schema('deltas/2026-07-12-tkt166-manual-intake-case-create.sql');
    expect(canonicalPolicies).toContain("'manual_intake_case_create_operation'");
    expect(delta).toContain(
      'ALTER TABLE manual_intake_case_create_operation FORCE ROW LEVEL SECURITY',
    );
    expect(delta).toContain(
      'GRANT SELECT, INSERT, UPDATE ON manual_intake_case_create_operation TO cespk_app',
    );
    expect(delta).not.toContain(
      'GRANT DELETE ON manual_intake_case_create_operation TO cespk_app',
    );
  });

  it('forces RLS and grants only non-delete app operations', () => {
    const canonicalPolicies = schema('900_constraints.sql');
    const delta = schema('deltas/2026-07-12-tkt165-staff-evidence-upload.sql');
    expect(canonicalPolicies).toContain("'staff_evidence_upload'");
    expect(canonicalPolicies).toContain("'staff_evidence_upload_item'");
    expect(delta).toContain('ALTER TABLE staff_evidence_upload FORCE ROW LEVEL SECURITY');
    expect(delta).toContain('DROP CONSTRAINT IF EXISTS staff_evidence_upload_source_check');
    expect(delta).toContain('ALTER TABLE staff_evidence_upload_item FORCE ROW LEVEL SECURITY');
    expect(delta).toContain('GRANT SELECT, INSERT, UPDATE ON staff_evidence_upload TO cespk_app');
    expect(delta).toContain('GRANT SELECT, INSERT, UPDATE ON staff_evidence_upload_item TO cespk_app');
    expect(delta).not.toContain('GRANT DELETE ON staff_evidence_upload TO cespk_app');
    expect(delta).not.toContain('GRANT DELETE ON staff_evidence_upload_item TO cespk_app');
  });
});

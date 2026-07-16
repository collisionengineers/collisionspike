import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function schema(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../../../database/${relative}`, import.meta.url)),
    'utf8',
  );
}

describe('guided capture schema', () => {
  it('keeps canonical and live-delta session, shot and asset contracts aligned', () => {
    for (const sql of [
      schema('baseline/196_capture_session.sql'),
      schema('migrations/2026-07-13-guided-capture.sql'),
    ]) {
      expect(sql).toContain('capture_session');
      expect(sql).toContain('bootstrap_token_hash');
      expect(sql).toContain('token_generation');
      expect(sql).toContain('submit_idempotency_key');
      expect(sql).toContain("'expired'");
      expect(sql).toContain('expired_at');
      expect(sql).toContain('capture_session_resume_token');
      expect(sql).toContain('token_hash');
      expect(sql).toContain('last_used_at');
      expect(sql).toContain('ix_capture_resume_session');
      expect(sql).toContain('ix_capture_resume_expiry');
      expect(sql).toMatch(/token_hash\s+char\(64\)\s+PRIMARY KEY/u);
      expect(sql).not.toMatch(/\bresume_secret\b/u);
      expect(sql).toContain('capture_session_shot');
      expect(sql).toContain('guidance_profile');
      expect(sql).toContain('capture_asset');
      expect(sql).toContain('declared_sha256');
      expect(sql).toContain('server_sha256');
      expect(sql).toContain('validation_attempt');
      expect(sql).toContain('validation_lease_expires_at');
      expect(sql).toContain('staging_deleted_at');
      expect(sql).toContain('blob_deleted_at');
      expect(sql).toContain('cleanup_code');
      expect(sql).toContain('cleanup_attempt_count');
      expect(sql).toContain('cleanup_next_attempt_at');
      expect(sql).toContain('cleanup_last_error_category');
      expect(sql).toContain('capture_asset_cleanup_attempt_count_check');
      expect(sql).toContain('evidence_id');
      expect(sql).toContain('uq_evidence_capture_asset');
      expect(sql).not.toMatch(/\brepeatable\s+boolean\b/u);
    }
  });

  it('adds replay-safe expiry, validation lease and cleanup indexes to the live delta', () => {
    const delta = schema('migrations/2026-07-13-guided-capture.sql');
    expect(delta).toContain('DROP CONSTRAINT IF EXISTS capture_session_status_check');
    expect(delta).toContain('ADD CONSTRAINT capture_session_status_check');
    expect(delta).toContain('ix_capture_asset_validation_lease');
    expect(delta).toContain('ix_capture_asset_cleanup');
    expect(delta).toContain('ON capture_asset (cleanup_next_attempt_at, updated_at)');
    expect(delta).toContain('DROP CONSTRAINT IF EXISTS capture_asset_cleanup_attempt_count_check');
    expect(delta).toContain('ADD CONSTRAINT capture_asset_cleanup_attempt_count_check');
  });

  it('enables forced RLS and grants delete only for bounded resume-token invalidation', () => {
    const canonical = schema('baseline/900_constraints.sql');
    const delta = schema('migrations/2026-07-13-guided-capture.sql');
    for (const table of [
      'capture_session',
      'capture_session_shot',
      'capture_asset',
    ]) {
      expect(canonical).toContain(`'${table}'`);
      expect(delta).toContain(`ALTER TABLE %I FORCE ROW LEVEL SECURITY`);
    }
    for (const sql of [canonical, delta]) {
      expect(sql).toContain('ALTER TABLE capture_session_resume_token ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('ALTER TABLE capture_session_resume_token FORCE ROW LEVEL SECURITY');
      expect(sql).toContain('p_capture_session_resume_token_rw');
    }
    expect(delta).toContain('GRANT SELECT, INSERT, UPDATE ON capture_session, capture_session_resume_token,');
    expect(delta).toContain('capture_session_shot, capture_asset TO cespk_app');
    expect(delta).toContain('GRANT DELETE ON capture_session_resume_token TO cespk_app');
    expect(delta).not.toMatch(/GRANT DELETE ON (capture_session|capture_session_shot|capture_asset) TO cespk_app/u);
    expect(delta).toContain('DROP POLICY IF EXISTS p_capture_session_resume_token_no_delete');
  });

  it('adds capture as an explicit evidence decision owner in fresh and rolling schemas', () => {
    const evidence = schema('baseline/060_evidence.sql');
    const delta = schema('migrations/2026-07-13-guided-capture.sql');
    for (const sql of [evidence, delta]) {
      expect(sql).toContain("'classifier','staff','provider','capture','cleanup','legacy'");
    }
    for (const constraint of [
      'ck_evidence_image_role_source',
      'ck_evidence_registration_visible_source',
      'ck_evidence_accepted_for_eva_source',
      'ck_evidence_exclusion_decision_source',
    ]) {
      expect(evidence).toContain(`CONSTRAINT ${constraint}`);
      expect(delta).toContain(`DROP CONSTRAINT IF EXISTS ${constraint}`);
      expect(delta).toContain(`ADD CONSTRAINT ${constraint}`);
    }
  });

  it('allows duplicate capture attempts to link to one canonical Evidence row', () => {
    const canonical = schema('baseline/196_capture_session.sql');
    const delta = schema('migrations/2026-07-13-guided-capture.sql');
    expect(canonical).toMatch(/evidence_id\s+uuid\s+REFERENCES evidence\(id\)/u);
    expect(canonical).not.toMatch(/evidence_id\s+uuid\s+UNIQUE/u);
    expect(delta).toMatch(/evidence_id\s+uuid\s+REFERENCES evidence\(id\)/u);
    expect(delta).not.toMatch(/evidence_id\s+uuid\s+UNIQUE/u);
    expect(delta).toContain(
      'ALTER TABLE capture_asset DROP CONSTRAINT IF EXISTS capture_asset_evidence_id_key',
    );
  });

  it('keeps retarget and lock audit actions finite in fresh and rolling choices', () => {
    const choices = schema('baseline/000_enums_lookups.sql');
    const delta = schema('migrations/2026-07-13-guided-capture.sql');
    for (const sql of [choices, delta]) {
      expect(sql).toContain("100000061, 'capture_session_retargeted'");
      expect(sql).toContain("100000062, 'capture_session_locked'");
    }
  });
});

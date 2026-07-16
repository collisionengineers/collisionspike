import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function schema(relative: string): string {
  const location = relative.startsWith('deltas/')
    ? `migrations/${relative.slice('deltas/'.length)}`
    : `baseline/${relative}`;
  return readFileSync(
    fileURLToPath(new URL(`../../../../../database/${location}`, import.meta.url)),
    'utf8',
  );
}

describe('TKT-089 rolling schema and archive-outbox parity', () => {
  it('allows old orchestration clients to write excluded=true without a source', () => {
    const canonical = schema('060_evidence.sql');
    const delta = schema('deltas/2026-07-11-tkt089-evidence-decision-sources.sql');

    expect(canonical).toContain("exclusion_decision_source IN ('classifier','staff','provider','capture','cleanup','legacy')");
    expect(canonical).not.toContain('ck_evidence_exclusion_source');
    expect(delta).toContain('DROP CONSTRAINT IF EXISTS ck_evidence_exclusion_source');
    expect(delta).not.toMatch(/ADD CONSTRAINT ck_evidence_exclusion_source\b/);
  });

  it('recovers historic staff evidence ownership from safely parsed audits before inference', () => {
    const delta = schema('deltas/2026-07-11-tkt089-evidence-decision-sources.sql');
    const auditRecovery = delta.indexOf('WITH parsed_staff_audit AS');
    const classifierInference = delta.indexOf('Existing orchestration/Box rows with classification stamps');

    expect(delta).toContain('pg_temp.try_parse_jsonb');
    expect(delta).toContain('EXCEPTION WHEN others THEN');
    expect(delta).toContain('ae.action_code = 100000002');
    expect(delta).toContain("after_json->>'evidenceId'");
    expect(delta).toContain("before_json->'registrationVisible' IS DISTINCT FROM after_json->'registrationVisible'");
    expect(delta).toContain("before_json->'reflectionDismissed' IS NOT DISTINCT FROM after_json->'reflectionDismissed'");
    expect(delta).toContain('changed_exclusion OR changed_exclusion_reason_only');
    expect(delta).toContain("THEN 'staff' ELSE e.image_role_source");
    expect(delta).toContain("THEN 'staff' ELSE e.exclusion_decision_source");
    expect(auditRecovery).toBeGreaterThan(-1);
    expect(classifierInference).toBeGreaterThan(auditRecovery);
  });

  it('keeps the canonical and live-delta outbox contracts aligned', () => {
    const canonical = schema('190_archive_mirror_outbox.sql');
    const delta = schema('deltas/2026-07-11-tkt089-archive-mirror-outbox.sql');
    const constraints = schema('900_constraints.sql');
    const terminal = schema('deltas/2026-07-12-tkt166-manual-intake-case-create.sql');

    for (const contract of [canonical, delta]) {
      expect(contract).toContain('CREATE TABLE');
      expect(contract).toContain('archive_mirror_outbox');
      expect(contract).toContain('requested_generation');
      expect(contract).toContain('completed_generation');
      expect(contract).toContain('attempt_count');
      expect(contract).toContain('next_attempt_at');
      expect(contract).toContain('ix_archive_mirror_outbox_pending');
      expect(contract).toContain('GRANT SELECT, INSERT, UPDATE ON archive_mirror_outbox TO cespk_app');
    }
    expect(delta).toContain('ALTER TABLE archive_mirror_outbox ENABLE ROW LEVEL SECURITY');
    expect(delta).toContain('ALTER TABLE archive_mirror_outbox FORCE ROW LEVEL SECURITY');
    expect(delta).toContain('p_archive_mirror_outbox_rw');
    expect(delta).toContain('p_archive_mirror_outbox_no_delete');
    expect(constraints).toContain("'archive_mirror_outbox'");
    for (const contract of [canonical, terminal]) {
      expect(contract).toContain('dead_lettered_at');
      expect(contract).toContain('dead_letter_reason');
      expect(contract).toContain('dead_lettered_at IS NULL');
    }
  });

  it('ships archive claims and durable case-link backfill generations in canonical and live schemas', () => {
    const evidence = schema('060_evidence.sql');
    const claims = schema('deltas/2026-07-11-tkt089-archive-mirror-claims.sql');
    const inbound = schema('120_inbound_email.sql');
    const backfillReport = schema('deltas/2026-07-11-tkt145-backfill-report-idempotency.sql');
    const backfillProgress = schema('deltas/2026-07-11-tkt145-backfill-generations.sql');

    for (const contract of [evidence, claims]) {
      expect(contract).toContain('archive_mirror_claim_token');
      expect(contract).toContain('archive_mirror_decision_generation');
    }
    for (const contract of [inbound, backfillReport]) {
      expect(contract).toContain('evidence_backfill_requested_generation');
      expect(contract).toContain('evidence_backfill_enqueued_generation');
      expect(contract).toContain('evidence_backfill_report_outcome');
    }
    for (const contract of [inbound, backfillProgress]) {
      expect(contract).toContain('evidence_backfill_completed_generation');
      expect(contract).toContain('evidence_backfill_completed_result');
      expect(contract).toContain('evidence_backfill_reported_generation');
      expect(contract).toContain("'completed','partial'");
    }
  });
});

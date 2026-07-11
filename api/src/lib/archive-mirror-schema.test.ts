import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function schema(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../migration/assets/schema/${relative}`, import.meta.url)),
    'utf8',
  );
}

describe('TKT-089 rolling schema and archive-outbox parity', () => {
  it('allows old orchestration clients to write excluded=true without a source', () => {
    const canonical = schema('060_evidence.sql');
    const delta = schema('deltas/2026-07-11-tkt089-evidence-decision-sources.sql');

    expect(canonical).toContain("exclusion_decision_source IN ('classifier','staff','provider','cleanup','legacy')");
    expect(canonical).not.toContain('ck_evidence_exclusion_source');
    expect(delta).toContain('DROP CONSTRAINT IF EXISTS ck_evidence_exclusion_source');
    expect(delta).not.toMatch(/ADD CONSTRAINT ck_evidence_exclusion_source\b/);
  });

  it('keeps the canonical and live-delta outbox contracts aligned', () => {
    const canonical = schema('190_archive_mirror_outbox.sql');
    const delta = schema('deltas/2026-07-11-tkt089-archive-mirror-outbox.sql');
    const constraints = schema('900_constraints.sql');

    for (const contract of [canonical, delta]) {
      expect(contract).toContain('CREATE TABLE');
      expect(contract).toContain('archive_mirror_outbox');
      expect(contract).toContain('requested_generation');
      expect(contract).toContain('completed_generation');
      expect(contract).toContain('ix_archive_mirror_outbox_pending');
      expect(contract).toContain('GRANT SELECT, INSERT, UPDATE ON archive_mirror_outbox TO cespk_app');
    }
    expect(delta).toContain('ALTER TABLE archive_mirror_outbox ENABLE ROW LEVEL SECURITY');
    expect(delta).toContain('ALTER TABLE archive_mirror_outbox FORCE ROW LEVEL SECURITY');
    expect(delta).toContain('p_archive_mirror_outbox_rw');
    expect(delta).toContain('p_archive_mirror_outbox_no_delete');
    expect(constraints).toContain("'archive_mirror_outbox'");
  });
});

import { describe, expect, it, vi } from 'vitest';
import { writeEvidenceBackfillNote } from './backfill-note.js';

describe('writeEvidenceBackfillNote outcome reconciliation', () => {
  it('upserts failed/partial wording and updates an existing source-keyed note only when content changed', async () => {
    const q = vi.fn().mockResolvedValue([]);
    await writeEvidenceBackfillNote({
      caseId: 'case-1',
      inboundEmailId: 'ie-1',
      kind: 'failed',
    }, q);

    const [sql, params] = q.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO note/i);
    expect(sql).toMatch(/ON CONFLICT \(case_id, source_key\)[\s\S]*DO UPDATE/i);
    expect(sql).toMatch(/IS DISTINCT FROM \(EXCLUDED\.name, EXCLUDED\.author, EXCLUDED\.text\)/i);
    expect(params).toContain('evidence-backfill:ie-1');
    expect(params).toContain('Attachments to add');
  });

  it('completion converts an existing actionable note without creating a normal-path success note', async () => {
    const q = vi.fn().mockResolvedValue([]);
    await writeEvidenceBackfillNote({
      caseId: 'case-1',
      inboundEmailId: 'ie-1',
      kind: 'completed',
    }, q);

    const [sql, params] = q.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/^UPDATE note/i);
    expect(sql).not.toMatch(/INSERT INTO note/i);
    expect(sql).toMatch(/IS DISTINCT FROM \(\$3, \$4, \$5\)/i);
    expect(params).toEqual([
      'case-1',
      'evidence-backfill:ie-1',
      'Attachments added',
      'System',
      'The attachments from the linked email have now been added. No manual action is needed.',
    ]);
  });
});

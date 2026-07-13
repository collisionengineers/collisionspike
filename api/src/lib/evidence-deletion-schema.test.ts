import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const schemaRoot = fileURLToPath(new URL('../../../migration/assets/schema/', import.meta.url));

function sqlFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sqlFiles(path) : entry.name.endsWith('.sql') ? [path] : [];
  });
}

function schema(relative: string): string {
  return readFileSync(`${schemaRoot}/${relative}`, 'utf8');
}

describe('single-image deletion schema safety', () => {
  it('gives every child FK to evidence a safe delete action', () => {
    const references: Array<{ file: string; clause: string }> = [];
    for (const file of sqlFiles(schemaRoot)) {
      const sql = readFileSync(file, 'utf8');
      for (const match of sql.matchAll(
        /REFERENCES\s+(?:public\.)?evidence\s*\(\s*id\s*\)([^;]*);/giu,
      )) {
        references.push({ file, clause: match[0] });
      }
    }

    expect(references.length).toBeGreaterThan(0);
    expect(references.filter(({ clause }) => (
      !/ON\s+DELETE\s+(?:CASCADE|SET\s+NULL)/iu.test(clause)
    ))).toEqual([]);
    expect(schema('195_staff_evidence_upload.sql')).toMatch(
      /evidence_id\s+uuid\s+REFERENCES\s+evidence\(id\)\s+ON\s+DELETE\s+SET\s+NULL/iu,
    );
  });

  it('keeps owner-bypass protection and the scoped delete policy in fresh and delta DDL', () => {
    for (const sql of [
      schema('900_constraints.sql'),
      schema('deltas/2026-07-13-tkt160-evidence-deletion.sql'),
    ]) {
      expect(sql).toContain('ALTER TABLE evidence FORCE ROW LEVEL SECURITY');
      expect(sql).toContain('CREATE POLICY p_evidence_scoped_delete ON evidence');
      expect(sql).toContain("d.state = 'ready_to_finalize'");
    }
    for (const sql of [
      schema('205_evidence_deletion.sql'),
      schema('deltas/2026-07-13-tkt160-evidence-deletion.sql'),
    ]) {
      expect(sql).toContain("'cancelled'");
      expect(sql).not.toContain('c.box_folder_id IS NOT DISTINCT FROM d.box_folder_id');
    }
  });
});

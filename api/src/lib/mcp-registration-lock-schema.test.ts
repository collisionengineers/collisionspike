import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const base = readFileSync(`${root}migration/assets/schema/900_constraints.sql`, 'utf8');
const delta = readFileSync(
  `${root}migration/assets/schema/deltas/2026-07-12-tkt154-mcp-image-ingestion.sql`,
  'utf8',
);

describe('MCP registration eligibility serialization schema', () => {
  it.each([['canonical schema', base], ['live delta', delta]])(
    '%s takes the same registration lock for every eligibility-changing mutation',
    (_label, sql) => {
      expect(sql).toContain('lock_case_registration_eligibility');
      expect(sql).toContain("'mcp-image-registration:' || registration_key");
      expect(sql).toContain('BEFORE INSERT OR DELETE ON case_');
      expect(sql).toContain('BEFORE UPDATE OF vrm, status_code, duplicate_keys ON case_');
      expect(sql).toContain('ORDER BY candidate');
    },
  );
});

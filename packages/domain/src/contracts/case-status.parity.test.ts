import { describe, it, expect } from 'vitest';
import { CASE_STATUSES, type CaseStatus } from './case-status';
// Import the canonical code-table artifact from src/data/code-tables, not a copy.
// resolveJsonModule is on.
import caseStatusCodeTable from '../data/code-tables/case-status.json';

/* ============================================================
   Schema parity — the `case_status` code table MUST
   reconcile 1:1 against the canonical `CaseStatus` union. This is the gate that
   keeps the deployed status state machine and the app/contract in lockstep:
   if anyone adds/removes/renames a status on either side, this test fails.
   ============================================================ */

interface CodeTableOption {
  value: number;
  name: string;
  label: string;
}
const options = caseStatusCodeTable.options as CodeTableOption[];
const DISPLAY_LABEL_WORD_ALIASES: Partial<Record<CaseStatus, string[]>> = {
  box_synced: ['archive', 'synced'],
};

describe('case-status code table <-> CaseStatus union parity', () => {
  it('targets the canonical case_status code table', () => {
    expect(caseStatusCodeTable.codeTableId).toBe('case_status');
  });

  it('has exactly one option per CaseStatus value (same count)', () => {
    expect(options).toHaveLength(CASE_STATUSES.length);
    expect(options).toHaveLength(13);
  });

  it('option `name`s equal the CaseStatus union as a set (1:1, no extras/omissions)', () => {
    const optionNames = options.map((o) => o.name).sort();
    const unionNames = [...CASE_STATUSES].sort();
    expect(optionNames).toEqual(unionNames);
  });

  it('every CaseStatus value has a matching code-table option', () => {
    const optionNameSet = new Set(options.map((o) => o.name));
    for (const status of CASE_STATUSES) {
      expect(optionNameSet.has(status)).toBe(true);
    }
  });

  it('every code-table option name is a valid CaseStatus (no orphan options)', () => {
    const unionSet = new Set<string>(CASE_STATUSES);
    for (const opt of options) {
      expect(unionSet.has(opt.name)).toBe(true);
    }
  });

  it('every option carries a non-empty human label and a stable integer value', () => {
    for (const opt of options) {
      expect(typeof opt.label).toBe('string');
      expect(opt.label.length).toBeGreaterThan(0);
      expect(Number.isInteger(opt.value)).toBe(true);
    }
  });

  it('option labels are the Title-Case rendering of each status name', () => {
    // label === name.split('_').map(capitalize).join(' '), with small-word casing
    // tolerated (e.g. "Linked to Instruction", "Ready for EVA"). We assert the
    // label is derivable from the name to catch typos/desync, normalising spaces.
    const byName = new Map(options.map((o) => [o.name as CaseStatus, o.label]));
    const fromName = (n: string) =>
      n
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
        .toLowerCase()
        .replace(/\s+/g, ' ');
    for (const status of CASE_STATUSES) {
      const label = byName.get(status);
      expect(label, `missing label for ${status}`).toBeDefined();
      // Compare on a normalised, case-insensitive, word-set basis so brand/small
      // words ("for", "to", "EVA") don't cause false negatives.
      const labelWords = label!.toLowerCase().replace(/\s+/g, ' ').split(' ').sort();
      const nameWords = (DISPLAY_LABEL_WORD_ALIASES[status] ?? fromName(status).split(' ')).sort();
      expect(labelWords).toEqual(nameWords);
    }
  });
});

import { describe, it, expect } from 'vitest';
import type { ActionReason, AgingRow, Case } from '../data';
import {
  ageSeverity,
  dueText,
  duePillText,
  groupAgingRows,
  groupVerb,
} from './dashboard-needs-action';

/* ============================================================
   dashboard-needs-action — the grouping/ordering/suppression rules
   behind the dashboard hero (reforge M-C, spec IA §1).
   ============================================================ */

/** Minimal AgingRow fixture — only the fields the pure layer reads. */
function row(opts: {
  id: string;
  reason?: ActionReason;
  daysToDue: number;
  pastDue?: boolean;
  dateDue?: string;
}): AgingRow {
  return {
    case: { id: opts.id, dateDue: opts.dateDue } as unknown as Case,
    daysToDue: opts.daysToDue,
    pastDue: opts.pastDue ?? opts.daysToDue < 0,
    reason: opts.reason,
  };
}

const NO_DUE = Number.POSITIVE_INFINITY;

describe('ageSeverity', () => {
  it('ramps grey → amber (≤2d) → red (past due)', () => {
    expect(ageSeverity(row({ id: 'a', daysToDue: 10 }))).toBe('info');
    expect(ageSeverity(row({ id: 'b', daysToDue: 2 }))).toBe('attention');
    expect(ageSeverity(row({ id: 'c', daysToDue: 0 }))).toBe('attention');
    expect(ageSeverity(row({ id: 'd', daysToDue: -3 }))).toBe('blocker');
  });

  it('treats a missing due date as info (never amber)', () => {
    expect(ageSeverity(row({ id: 'a', daysToDue: NO_DUE }))).toBe('info');
    expect(ageSeverity(row({ id: 'b', daysToDue: Number.NaN, pastDue: false }))).toBe('info');
  });
});

describe('dueText / duePillText', () => {
  it('formats past-due, today and future with the due-date tail', () => {
    expect(dueText(row({ id: 'a', daysToDue: -3, dateDue: '12/06/2026' }))).toBe(
      '3d past due · 12/06',
    );
    expect(dueText(row({ id: 'b', daysToDue: 0, dateDue: '17/06/2026' }))).toBe(
      'Due today · 17/06',
    );
    expect(dueText(row({ id: 'c', daysToDue: 4, dateDue: '21/06/2026' }))).toBe(
      'Due in 4d · 21/06',
    );
  });

  it('keeps the full "No due date" wording for aria/tooltips', () => {
    expect(dueText(row({ id: 'a', daysToDue: NO_DUE }))).toBe('No due date');
  });

  it('suppresses the pill (null) when there is no due date — absence is the signal', () => {
    expect(duePillText(row({ id: 'a', daysToDue: NO_DUE }))).toBeNull();
    expect(duePillText(row({ id: 'b', daysToDue: Number.NaN, pastDue: false }))).toBeNull();
  });

  it('returns the pill text whenever a due date exists', () => {
    expect(duePillText(row({ id: 'a', daysToDue: -1, dateDue: '16/06/2026' }))).toBe(
      '1d past due · 16/06',
    );
    expect(duePillText(row({ id: 'b', daysToDue: 9 }))).toBe('Due in 9d');
  });
});

describe('groupVerb', () => {
  it('maps each reason to its action verb and null to "Review case"', () => {
    expect(groupVerb('missing_images')).toBe('Chase garage for images');
    expect(groupVerb(null)).toBe('Review case');
  });
});

describe('groupAgingRows', () => {
  it('groups by reason and never drops a row', () => {
    const rows = [
      row({ id: 'a', reason: 'missing_images', daysToDue: 3 }),
      row({ id: 'b', reason: 'duplicate', daysToDue: 5 }),
      row({ id: 'c', reason: 'missing_images', daysToDue: 1 }),
      row({ id: 'd', daysToDue: 8 }), // no reason
      row({ id: 'e', daysToDue: NO_DUE }), // no reason, no due date
    ];
    const groups = groupAgingRows(rows);
    const total = groups.reduce((n, g) => n + g.rows.length, 0);
    expect(total).toBe(rows.length);
    const ids = groups.flatMap((g) => g.rows.map((r) => r.case.id)).sort();
    expect(ids).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('puts no-reason rows in a trailing "Review case" group, even when they are the worst', () => {
    const rows = [
      row({ id: 'past-due-no-reason', daysToDue: -9 }), // blocker but reasonless
      row({ id: 'ample-images', reason: 'missing_images', daysToDue: 10 }), // info
    ];
    const groups = groupAgingRows(rows);
    expect(groups.map((g) => g.reason)).toEqual(['missing_images', null]);
    expect(groups[1].verb).toBe('Review case');
    expect(groups[1].rows[0].case.id).toBe('past-due-no-reason');
  });

  it('orders groups worst-severity-first (blocker › attention › info)', () => {
    const rows = [
      row({ id: 'info', reason: 'needs_review', daysToDue: 10 }),
      row({ id: 'attention', reason: 'duplicate', daysToDue: 1 }),
      row({ id: 'blocker', reason: 'missing_images', daysToDue: -2 }),
    ];
    const groups = groupAgingRows(rows);
    expect(groups.map((g) => g.reason)).toEqual(['missing_images', 'duplicate', 'needs_review']);
  });

  it('tiebreaks equal severity by oldest due date', () => {
    const rows = [
      row({ id: 'later', reason: 'duplicate', daysToDue: -1 }),
      row({ id: 'older', reason: 'missing_instructions', daysToDue: -6 }),
    ];
    const groups = groupAgingRows(rows);
    expect(groups.map((g) => g.reason)).toEqual(['missing_instructions', 'duplicate']);
  });

  it('a group is ranked by its WORST row, not its first', () => {
    const rows = [
      row({ id: 'calm-1', reason: 'needs_review', daysToDue: 9 }),
      row({ id: 'calm-2', reason: 'needs_review', daysToDue: -4 }), // blocker hiding in the group
      row({ id: 'amber', reason: 'duplicate', daysToDue: 1 }),
    ];
    const groups = groupAgingRows(rows);
    expect(groups[0].reason).toBe('needs_review');
  });

  it('sorts within a group oldest-due-first with no-due rows last', () => {
    const rows = [
      row({ id: 'no-due', reason: 'missing_images', daysToDue: NO_DUE }),
      row({ id: 'future', reason: 'missing_images', daysToDue: 4 }),
      row({ id: 'past', reason: 'missing_images', daysToDue: -2 }),
    ];
    const [group] = groupAgingRows(rows);
    expect(group.rows.map((r) => r.case.id)).toEqual(['past', 'future', 'no-due']);
  });

  it('returns a single group (with its header verb) when only one reason exists', () => {
    const groups = groupAgingRows([row({ id: 'a', reason: 'conflict', daysToDue: 2 })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].verb).toBe('Resolve claimant-name conflict before submit');
  });

  it('returns no groups for no rows', () => {
    expect(groupAgingRows([])).toEqual([]);
  });

  it('two all-no-due groups tying on severity stay in first-appearance order (no NaN)', () => {
    const rows = [
      row({ id: 'b1', reason: 'missing_instructions', daysToDue: NO_DUE }),
      row({ id: 'a1', reason: 'missing_images', daysToDue: NO_DUE }),
      row({ id: 'b2', reason: 'missing_instructions', daysToDue: NO_DUE }),
    ];
    const groups = groupAgingRows(rows);
    expect(groups.map((g) => g.reason)).toEqual(['missing_instructions', 'missing_images']);
  });
});

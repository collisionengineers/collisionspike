import type { ActionReason, AgingRow } from '../data';

/* ============================================================
   dashboard-needs-action — the PURE grouping/ordering/formatting layer
   under the dashboard's needs-action hero (reforge M-C, spec IA §1).

   No React, no I/O — everything here is deterministic over AgingRow[]
   so the grouping rules are unit-testable:

     - Group by ActionReason; rows with NO reason form a trailing
       "Progress the case" group — never dropped.
     - Group order: worst row severity first (blocker › attention › info
       via ageSeverity), tiebreak oldest due. The no-reason group always
       trails regardless of severity.
     - Within a group: oldest-due-first; rows without a due date last.
     - duePillText() returns null when there is no due date — the pill is
       suppressed (absence is the signal); dueText() keeps the full
       "No due date" wording for aria-labels and tooltips.
   ============================================================ */

export type AgeSeverity = 'info' | 'attention' | 'blocker';

/** Severity for an aging row: greys (future/ample) → amber (≤2d) → red (past-due). */
export function ageSeverity(row: AgingRow): AgeSeverity {
  if (row.pastDue) return 'blocker';
  if (Number.isFinite(row.daysToDue) && row.daysToDue <= 2) return 'attention';
  return 'info';
}

/** The action verb per reason — the group-header wording (never engineering terms).
 *  Each verb leads with a DISTINCT word and names its own condition — no two groups may
 *  read alike ("Review the details" vs "Review case" was the reported confusion). */
export const REASON_VERB: Record<ActionReason, string> = {
  missing_images: 'Chase garage for images',
  missing_instructions: 'Chase provider for instructions',
  duplicate: 'Resolve duplicate',
  conflict: 'Resolve claimant-name conflict before submit',
  needs_review: 'Check the flagged details',
};

/** Group verb — `null` is the trailing no-reason group (cases with no specific blocker,
 *  just needing to be worked forward). "Progress the case" reads distinctly from every
 *  REASON_VERB above. */
export function groupVerb(reason: ActionReason | null): string {
  return reason ? REASON_VERB[reason] : 'Progress the case';
}

/** "3d past due · 12/06" / "Due today · 17/06" / "Due in 4d · 21/06" / "No due date". */
export function dueText(row: AgingRow): string {
  const due = row.case.dateDue;
  const tail = due ? ` · ${due.slice(0, 5)}` : '';
  if (!Number.isFinite(row.daysToDue)) return 'No due date';
  const n = row.daysToDue;
  if (n < 0) return `${Math.abs(n)}d past due${tail}`;
  if (n === 0) return `Due today${tail}`;
  return `Due in ${n}d${tail}`;
}

/**
 * The due PILL text — null when the row has no due date, so the row renders
 * no pill at all (a grey "No due date" chip is noise; absence is the signal).
 * Full wording for aria/tooltips comes from dueText().
 */
export function duePillText(row: AgingRow): string | null {
  return Number.isFinite(row.daysToDue) ? dueText(row) : null;
}

export interface NeedsActionGroup {
  /** null = the trailing "Progress the case" group (rows with no reason). */
  reason: ActionReason | null;
  /** Header verb ("<verb> — <count>"). */
  verb: string;
  /** Group rows, oldest-due-first (no-due rows last). */
  rows: AgingRow[];
}

const SEVERITY_RANK: Record<AgeSeverity, number> = { blocker: 0, attention: 1, info: 2 };

/** Sort key: days-to-due ascending; rows without a due date sink to the end.
    MAX_SAFE_INTEGER (not Infinity) so two all-no-due groups tying on severity
    subtract to 0 in the comparator, never Infinity − Infinity = NaN. */
function dueRank(row: AgingRow): number {
  return Number.isFinite(row.daysToDue) ? row.daysToDue : Number.MAX_SAFE_INTEGER;
}

/**
 * Group the needs-action rows by reason. Every input row lands in exactly one
 * group (no silent drops); see the module header for the ordering rules.
 */
export function groupAgingRows(rows: AgingRow[]): NeedsActionGroup[] {
  const buckets = new Map<ActionReason | null, AgingRow[]>();
  for (const row of rows) {
    const key = row.reason ?? null;
    const list = buckets.get(key);
    if (list) {
      list.push(row);
    } else {
      buckets.set(key, [row]);
    }
  }

  const groups = [...buckets.entries()].map(([reason, groupRows]) => {
    const sorted = [...groupRows].sort((a, b) => dueRank(a) - dueRank(b));
    return {
      group: { reason, verb: groupVerb(reason), rows: sorted } satisfies NeedsActionGroup,
      worstSeverity: Math.min(...sorted.map((r) => SEVERITY_RANK[ageSeverity(r)])),
      oldestDue: dueRank(sorted[0]),
    };
  });

  // Worst severity first, tiebreak oldest due; sort() is stable, so remaining
  // ties keep first-appearance order. The no-reason group ALWAYS trails.
  groups.sort((a, b) => {
    const aTrailing = a.group.reason === null;
    const bTrailing = b.group.reason === null;
    if (aTrailing !== bTrailing) return aTrailing ? 1 : -1;
    if (a.worstSeverity !== b.worstSeverity) return a.worstSeverity - b.worstSeverity;
    return a.oldestDue - b.oldestDue;
  });

  return groups.map((g) => g.group);
}

import type { ActionReason, Case } from './types';

/* ============================================================
   Intake copy + parsing helpers (shared across the screens).

   - reasonVerb / outstandingText: verb-LED, active-voice copy for the
     needs-action reason (NO "Add …" prepend).
   - dueInfo: the ONE shared DD/MM/YYYY due/aging parser (screens used to
     each re-parse dateDue).
   - suggestCasePo: compose the Case/PO = principalCode + 2-digit year +
     suggested 3-digit sequence, with the EVA (lowercase) / Box (UPPER) forms.

   Dates are DD/MM/YYYY strings. `now` defaults to new Date() but callers can
   pass one for determinism.
   ============================================================ */

/* ----------  Needs-action copy  ---------- */

/** Short verb-led label for a reason (chips / compact rows). */
export function reasonVerb(reason: ActionReason): string {
  switch (reason) {
    case 'missing_images':
      return 'Chase for images';
    case 'missing_instructions':
      return 'Chase for instructions';
    case 'duplicate':
      return 'Resolve duplicate';
    case 'conflict':
      return 'Resolve conflict';
    case 'needs_review':
      return 'Review & confirm';
    default:
      return 'Review';
  }
}

/**
 * Full active-voice outstanding-work sentence for a case, led by a verb.
 * Replaces the awkward "Add no eva images yet" pattern. Falls back to a
 * generic review prompt when there is no explicit actionReason.
 *
 * Pure over the case (no data-source read). The exact open-VRM-twin count for
 * the `duplicate` line is fetched live via `data.openVrmTwins(vrm)` at the
 * screen; pass it as `openTwinCount` to enrich the copy, else a generic
 * "open case(s) for this VRM" phrasing is used.
 */
export function outstandingText(c: Case, openTwinCount?: number): string {
  switch (c.actionReason) {
    case 'missing_images':
      return 'Chase for images — need ≥2 (overview + closeup)';
    case 'missing_instructions':
      return 'Chase provider for instructions';
    case 'duplicate':
      return typeof openTwinCount === 'number'
        ? `Resolve duplicate — ${openTwinCount} open case${openTwinCount === 1 ? '' : 's'} for this VRM`
        : 'Resolve duplicate — open case(s) for this VRM';
    case 'conflict':
      return 'Resolve claimant-name conflict before submit';
    case 'needs_review':
      return 'Review parsed fields & confirm';
    default:
      return 'Review case & confirm readiness';
  }
}

/* ----------  Shared due / aging parser  ---------- */

export type DueTone = 'normal' | 'soon' | 'pastdue';

export interface DueInfo {
  /** Whole days until due (today − dueDate). Negative = past due. */
  days: number;
  pastDue: boolean;
  /** "Past due 3d · 12/06" / "Due today · 17/06" / "Due in 4d · 21/06" / "No due date". */
  dueText: string;
  tone: DueTone;
}

function parseDmy(s?: string): Date | undefined {
  if (!s) return undefined;
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * The single shared due/aging parser for a case's dateDue.
 * When there is no parseable dateDue, returns days=Infinity, tone='normal',
 * dueText='No due date'. `tone` is 'pastdue' when overdue, 'soon' when due
 * within 2 days, else 'normal'.
 */
export function dueInfo(c: Case, now: Date = new Date()): DueInfo {
  const due = parseDmy(c.dateDue);
  if (!due) {
    return { days: Number.POSITIVE_INFINITY, pastDue: false, dueText: 'No due date', tone: 'normal' };
  }
  const today = startOfDay(now);
  const days = Math.round((startOfDay(due).getTime() - today.getTime()) / 86_400_000);
  const tail = ` · ${c.dateDue}`;
  if (days < 0) {
    return { days, pastDue: true, dueText: `Past due ${Math.abs(days)}d${tail}`, tone: 'pastdue' };
  }
  if (days === 0) {
    return { days, pastDue: false, dueText: `Due today${tail}`, tone: 'soon' };
  }
  return {
    days,
    pastDue: false,
    dueText: `Due in ${days}d${tail}`,
    tone: days <= 2 ? 'soon' : 'normal',
  };
}

/* ----------  Case/PO suggestion  ---------- */

export interface CasePoSuggestion {
  /** UPPERCASE 4-char principal code. */
  principal: string;
  /** 2-digit year, e.g. "26". */
  yy: string;
  /** 3-digit provider sequence, e.g. "051". */
  seq: string;
  /** EVA form (lowercase), e.g. "ccpy26051". */
  evaLower: string;
  /** Box folder form (UPPERCASE), e.g. "CCPY26051". */
  boxUpper: string;
}

/**
 * Compose a suggested Case/PO for a case:
 *   principalCode + 2-digit year + suggested 3-digit sequence.
 * The year is taken from the case's createdAt (DD/MM/YYYY) when parseable,
 * else the current year. Returns both the EVA (lowercase) and Box (UPPER) forms.
 *
 * Pure over the case (no data-source read). The next provider sequence comes
 * from the database in the live service; pass `nextSeq` to seed it, else it defaults
 * to 1 (the first case for that principal/year).
 */
export function suggestCasePo(
  c: Case,
  now: Date = new Date(),
  nextSeq = 1,
): CasePoSuggestion {
  const principal = (c.providerCode || '').toUpperCase();
  const created = parseDmy(c.createdAt);
  const fullYear = created ? created.getFullYear() : now.getFullYear();
  const yy = String(fullYear % 100).padStart(2, '0');
  const seq = String(nextSeq).padStart(3, '0');
  const core = `${principal}${yy}${seq}`;
  return {
    principal,
    yy,
    seq,
    evaLower: core.toLowerCase(),
    boxUpper: core.toUpperCase(),
  };
}

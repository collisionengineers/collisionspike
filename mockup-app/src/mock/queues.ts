import type { ActionReason, Case, CaseStatus } from './types';
import { cases } from './cases';

/* ============================================================
   Queue IA + dashboard helpers (M1 chase-cockpit redesign).

   Three kinds of number, NEVER conflated:
     - LIVE DEPTH (always-now): drainable backlogs (needsAction, ready) via
       liveCounts() — go down as cleared.
     - WINDOWED THROUGHPUT (today / this week): throughput() — terminal states
       appear ONLY here, never as lifetime totals.
     - AGING / EXCEPTIONS: agingExceptions() — oldest-due-first needs-action rows.

   Dates are DD/MM/YYYY strings. "Today" is anchored to new Date() so app code
   can render a live "Updated HH:MM" affordance; helpers accept an optional
   `now` for determinism in callers/tests.
   ============================================================ */

/* ----------  The four user-facing queues  ---------- */
export type QueueName = 'needs-action' | 'in-progress' | 'ready' | 'done';

export interface QueueDef {
  name: QueueName;
  /** Route segment used by /queue/:name (identical to name). */
  routeSegment: QueueName;
  label: string;
  /** Short label for tight chrome (rail / tabs). */
  shortLabel: string;
  /** Statuses that fall into this queue. */
  statuses: CaseStatus[];
  /** Severity for the rail badge: only needs-action is the red pill. */
  tone: 'blocker' | 'muted';
}

export const QUEUES: readonly QueueDef[] = [
  {
    name: 'needs-action',
    routeSegment: 'needs-action',
    label: 'Needs action',
    shortLabel: 'Needs action',
    // A PERSON must act.
    statuses: [
      'needs_review',
      'missing_required_fields',
      'missing_images',
      'duplicate_risk',
      'error',
    ],
    tone: 'blocker',
  },
  {
    name: 'in-progress',
    routeSegment: 'in-progress',
    label: 'In progress',
    shortLabel: 'In progress',
    // SYSTEM owns it (awaiting parse / link).
    statuses: ['new_email', 'ingested', 'linked_to_instruction'],
    tone: 'muted',
  },
  {
    name: 'ready',
    routeSegment: 'ready',
    label: 'Ready for EVA',
    shortLabel: 'Ready for EVA',
    statuses: ['ready_for_eva'],
    tone: 'muted',
  },
  {
    name: 'done',
    routeSegment: 'done',
    label: 'Done (today)',
    shortLabel: 'Done today',
    // Windowed: only those submitted TODAY (see casesForQueue).
    statuses: ['eva_submitted', 'box_synced'],
    tone: 'muted',
  },
];

/** Map a raw status to its owning queue name. */
export function statusToQueue(status: CaseStatus): QueueName {
  const q = QUEUES.find((qq) => qq.statuses.includes(status));
  return q?.name ?? 'in-progress';
}

export function queueByName(name: string): QueueDef | undefined {
  return QUEUES.find((q) => q.name === name);
}

/* ----------  Date helpers (DD/MM/YYYY)  ---------- */
function parseDmy(s?: string): Date | undefined {
  if (!s) return undefined;
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function isSameDay(a?: Date, b?: Date): boolean {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
/** Whole days from `from` to `to` (to - from); negative = past. */
function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}
/** Monday-anchored start of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  const dow = (s.getDay() + 6) % 7; // 0 = Monday
  s.setDate(s.getDate() - dow);
  return s;
}

/* ----------  Cases for a queue  ---------- */
/**
 * Cases belonging to a queue. The `done` queue is WINDOWED: only cases whose
 * submittedAt is today. All others are live-depth (status only).
 */
export function casesForQueue(name: QueueName, now: Date = new Date()): Case[] {
  const q = queueByName(name);
  if (!q) return [];
  const today = startOfDay(now);
  return cases.filter((c) => {
    if (!q.statuses.includes(c.status)) return false;
    if (name === 'done') return isSameDay(parseDmy(c.submittedAt), today);
    return true;
  });
}

/* ----------  LIVE DEPTH (always-now backlogs)  ---------- */
export interface LiveCounts {
  needsAction: number;
  inProgress: number;
  ready: number;
}
export function liveCounts(now: Date = new Date()): LiveCounts {
  return {
    needsAction: casesForQueue('needs-action', now).length,
    inProgress: casesForQueue('in-progress', now).length,
    ready: casesForQueue('ready', now).length,
  };
}

/** Per-queue counts for the rail badges. `done` is the windowed (today) count. */
export function queueCounts(now: Date = new Date()): Record<QueueName, number> {
  return {
    'needs-action': casesForQueue('needs-action', now).length,
    'in-progress': casesForQueue('in-progress', now).length,
    ready: casesForQueue('ready', now).length,
    done: casesForQueue('done', now).length,
  };
}

/* ----------  WINDOWED THROUGHPUT (today / this week)  ---------- */
export interface Throughput {
  /** Cases that entered the pipeline today (createdAt === today). */
  inToday: number;
  /** Cases submitted to EVA today (submittedAt === today). */
  submittedToday: number;
  /** Cases submitted to EVA so far this week (Mon-anchored). */
  clearedThisWeek: number;
}
export function throughput(now: Date = new Date()): Throughput {
  const today = startOfDay(now);
  const weekStart = startOfWeek(now);
  let inToday = 0;
  let submittedToday = 0;
  let clearedThisWeek = 0;
  for (const c of cases) {
    if (isSameDay(parseDmy(c.createdAt), today)) inToday += 1;
    const sub = parseDmy(c.submittedAt);
    if (sub) {
      if (isSameDay(sub, today)) submittedToday += 1;
      if (startOfDay(sub).getTime() >= weekStart.getTime()) clearedThisWeek += 1;
    }
  }
  return { inToday, submittedToday, clearedThisWeek };
}

/* ----------  AGING / EXCEPTIONS (the hero)  ---------- */
export interface AgingRow {
  case: Case;
  /** Days until due — negative means past due. */
  daysToDue: number;
  pastDue: boolean;
  reason?: ActionReason;
}
export interface AgingExceptions {
  rows: AgingRow[]; // oldest-due-first
  pastDueCount: number;
  duplicateCount: number;
  conflictCount: number;
}
/** Oldest-due-first needs-action rows + exception tallies. */
export function agingExceptions(now: Date = new Date()): AgingExceptions {
  const today = startOfDay(now);
  const rows: AgingRow[] = casesForQueue('needs-action', now)
    .map((c) => {
      const due = parseDmy(c.dateDue);
      const daysToDue = due ? daysBetween(today, due) : Number.POSITIVE_INFINITY;
      return { case: c, daysToDue, pastDue: due ? daysToDue < 0 : false, reason: c.actionReason };
    })
    .sort((a, b) => a.daysToDue - b.daysToDue);

  return {
    rows,
    pastDueCount: rows.filter((r) => r.pastDue).length,
    duplicateCount: rows.filter((r) => r.reason === 'duplicate').length,
    conflictCount: rows.filter((r) => r.reason === 'conflict').length,
  };
}

/* ----------  PIPELINE STAGES (the signature strip)  ---------- */
export type PipelineStageKey =
  | 'new'
  | 'parsing'
  | 'review'
  | 'chasing'
  | 'ready'
  | 'submitted'
  | 'box';

export interface PipelineStage {
  key: PipelineStageKey;
  label: string;
  count: number;
  /** 'stuck' lights CE red (the chasing stage); 'normal' otherwise. */
  tone: 'normal' | 'stuck';
}

/** Map a status onto a pipeline stage. */
function statusToStage(status: CaseStatus, reason?: ActionReason): PipelineStageKey {
  switch (status) {
    case 'new_email':
      return 'new';
    case 'ingested':
    case 'linked_to_instruction':
      return 'parsing';
    case 'needs_review':
      return reason === 'conflict' || reason === 'needs_review' ? 'review' : 'chasing';
    case 'missing_images':
    case 'missing_required_fields':
    case 'duplicate_risk':
    case 'error':
      return 'chasing';
    case 'ready_for_eva':
      return 'ready';
    case 'eva_submitted':
      return 'submitted';
    case 'box_synced':
      return 'box';
    default:
      return 'parsing';
  }
}

/** Count per real pipeline stage. The chasing stage is the lit (stuck) one. */
export function pipelineStages(): PipelineStage[] {
  const defs: { key: PipelineStageKey; label: string }[] = [
    { key: 'new', label: 'New' },
    { key: 'parsing', label: 'Parsing' },
    { key: 'review', label: 'Review' },
    { key: 'chasing', label: 'Chasing' },
    { key: 'ready', label: 'Ready' },
    { key: 'submitted', label: 'Submitted' },
    { key: 'box', label: 'Box' },
  ];
  const counts = new Map<PipelineStageKey, number>(defs.map((d) => [d.key, 0]));
  for (const c of cases) {
    const k = statusToStage(c.status, c.actionReason);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return defs.map((d) => ({
    key: d.key,
    label: d.label,
    count: counts.get(d.key) ?? 0,
    tone: d.key === 'chasing' ? 'stuck' : 'normal',
  }));
}

/* ----------  NEEDS-ACTION FACET CHIPS  ---------- */
export interface ReasonFacet {
  reason: ActionReason;
  label: string;
  count: number;
}
const REASON_LABELS: Record<ActionReason, string> = {
  missing_images: 'Missing images',
  missing_instructions: 'Missing instructions',
  duplicate: 'Duplicate',
  conflict: 'Conflict',
  needs_review: 'Needs review',
};
/** Facet counts for the Needs-action reason chips (zero-count facets dropped). */
export function reasonCounts(now: Date = new Date()): ReasonFacet[] {
  const tally = new Map<ActionReason, number>();
  for (const c of casesForQueue('needs-action', now)) {
    if (!c.actionReason) continue;
    tally.set(c.actionReason, (tally.get(c.actionReason) ?? 0) + 1);
  }
  return (Object.keys(REASON_LABELS) as ActionReason[])
    .map((reason) => ({ reason, label: REASON_LABELS[reason], count: tally.get(reason) ?? 0 }))
    .filter((f) => f.count > 0);
}

export { REASON_LABELS };

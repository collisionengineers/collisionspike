import type { ActionReason, Case, CaseStatus } from './types';

/* ============================================================
   Queue IA + dashboard TYPES + pure helpers (M1 chase-cockpit redesign).

   PURE LAYER ONLY. This module defines the queue information architecture
   (QUEUES, statusToQueue, queueByName), the dashboard aggregate result types
   (LiveCounts / Throughput / AgingRow / AgingExceptions / PipelineStage /
   ReasonFacet), and REASON_LABELS. The aggregate COMPUTATION lives in each data
   source: the live Dataverse source (src/data/dataverse-source.ts) windows over
   the fetched case set, and the empty default source returns zeroes. There is no
   fabricated case array here — the app renders only real Dataverse rows.

   Three kinds of number, NEVER conflated (computed by the sources):
     - LIVE DEPTH (always-now): drainable backlogs (needsAction, ready).
     - WINDOWED THROUGHPUT (today / this week): terminal states appear ONLY here.
     - AGING / EXCEPTIONS: oldest-due-first needs-action rows.

   Dates are DD/MM/YYYY strings; the sources accept an optional `now`.
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

/* ----------  Dashboard aggregate RESULT TYPES  ----------
   The shapes the DataAccess fetchers return. Computation lives in the sources
   (dataverse-source windows over the fetched cases; the empty source returns
   zeroes), so no fabricated case array is read here. */

/* ----------  LIVE DEPTH (always-now backlogs)  ---------- */
export interface LiveCounts {
  needsAction: number;
  inProgress: number;
  ready: number;
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

export { REASON_LABELS };

import type { ActionReason, Case, CaseStatus } from './types';

/* ============================================================
   Queue IA + dashboard TYPES + pure helpers.

   The queue information architecture is the case's NATURAL state, surfaced as
   the sub-options under the first-class "Queues" nav button and as the tabs on
   the merged queue page. THREE queues (revised 2026-06-20; needs_review moved
   into Review 2026-07-08, TKT-130 operator direction):

     1. not-ready  — "Not ready": arrived and progressing but not complete —
                     instructions without images, images without instructions, a
                     just-arrived case, or a merged case still missing a detail
                     (e.g. the inspection address).
     2. review     — "Review": the human-in-the-loop queue — a case flagged for a
                     person to look at (needs_review) or complete and awaiting the
                     final check before EVA submit (ready_for_eva). (TKT-130:
                     needs_review cases belong HERE, not in Not ready.)
     3. held       — "Held": cannot pass through automatically (missing the basics
                     — VRM / claimant — or errored), a possible duplicate awaiting
                     a decision, or put on hold by a person.

   "Done (today)" is not a queue PAGE: terminal cases appear in the dashboard
   throughput strip + Action Logs, never as a backlog.

   PURE LAYER ONLY. This module defines the IA (QUEUES, statusToQueue,
   queueByName, caseTypeOf), the dashboard aggregate result types
   (LiveCounts / Throughput / AgingRow / AgingExceptions / PipelineStage /
   ReasonFacet) and REASON_LABELS. The aggregate COMPUTATION lives in each data
   source (dataverse-source windows over the fetched rows; the empty default
   source returns zeroes). No fabricated case array lives here — the app renders
   only real Dataverse rows.

   Dates are DD/MM/YYYY strings; the sources accept an optional `now`.
   ============================================================ */

/* ----------  The four user-facing queues (sub-options under "Queues")  ---------- */
export type QueueName =
  | 'not-ready'
  | 'review'
  | 'held';

export interface QueueDef {
  name: QueueName;
  /** Route segment used by /queue/:name (identical to name). */
  routeSegment: QueueName;
  label: string;
  /** Short label for tight chrome (rail / tabs). */
  shortLabel: string;
  /** Statuses that fall into this queue. */
  statuses: CaseStatus[];
  /** Severity for the rail badge: the human-action queues carry the red pill. */
  tone: 'blocker' | 'muted';
}

export const QUEUES: readonly QueueDef[] = [
  {
    name: 'not-ready',
    routeSegment: 'not-ready',
    label: 'Not ready',
    shortLabel: 'Not ready',
    // Arrived and progressing, but not yet complete: waiting on images, waiting
    // on instructions/fields, just-arrived/settling, or a merged case still
    // missing a required detail (e.g. the inspection address).
    statuses: [
      'new_email',
      'ingested',
      'missing_images',
      'missing_required_fields',
      'linked_to_instruction',
    ],
    tone: 'muted',
  },
  {
    name: 'review',
    routeSegment: 'review',
    label: 'Review',
    shortLabel: 'Review',
    // The human-in-the-loop queue: a case flagged for a person (needs_review) or
    // complete and awaiting the final check before EVA submit (ready_for_eva).
    // needs_review moved here from Not ready 2026-07-08 (TKT-130 operator
    // direction: "Needs Review cases belong in the Review queue").
    statuses: ['needs_review', 'ready_for_eva'],
    tone: 'blocker',
  },
  {
    name: 'held',
    routeSegment: 'held',
    label: 'Held',
    shortLabel: 'Held',
    // Parked: cannot pass through automatically (errored, or missing the basics a
    // case needs at all — VRM / claimant), a possible duplicate awaiting a
    // decision, or put on hold by a person (the `onHold` flag, routed in the
    // data source). See the case-status tree + dedup (ADR-0010).
    statuses: ['error', 'duplicate_risk'],
    tone: 'blocker',
  },
];

/** Map a raw status to its owning queue name (terminal states own no queue). */
export function statusToQueue(status: CaseStatus): QueueName | undefined {
  return QUEUES.find((qq) => qq.statuses.includes(status))?.name;
}

export function queueByName(name: string): QueueDef | undefined {
  return QUEUES.find((q) => q.name === name);
}

/* ----------  Funnel-stage mapping (CANONICAL, shared)  ----------
   The single source for "which of the 4 funnel stages does this status sit in".
   Consumed by the Dataverse source (dashboard strip counts) AND the CaseDetail
   spine ("you are here"), so the funnel, the spine and the queues agree.

   The funnel is the FLOW New → Not ready → Review → Submitted; it deliberately
   has NO held stage. `error` and `duplicate_risk` are Held — surfaced via the
   Held queue + the dashboard held bar + the aging hero — never a funnel count —
   so they map to `undefined` here (callers exclude them from the strip).
   Buckets align with the QUEUES taxonomy (needs_review sits in Review since
   2026-07-08 — TKT-130 — so the funnel and the queues stay in lockstep):
     - new        ← new_email, ingested            (intake/settling)
     - not_ready  ← missing_images, missing_required_fields,
                    linked_to_instruction
     - review     ← needs_review, ready_for_eva
     - submitted  ← eva_submitted, box_synced
     - (none)     ← error, duplicate_risk          (Held only) */
export function statusToStage(status: CaseStatus): PipelineStageKey | undefined {
  switch (status) {
    case 'new_email':
    case 'ingested':
      return 'new';
    case 'missing_images':
    case 'missing_required_fields':
    case 'linked_to_instruction':
      return 'not_ready';
    case 'needs_review':
    case 'ready_for_eva':
      return 'review';
    case 'eva_submitted':
    case 'box_synced':
      return 'submitted';
    case 'error':
    case 'duplicate_risk':
      return undefined; // Held — never inflates a funnel stage.
  }
}

/* ----------  Case type (review new-case #5) — a NATURAL identifier  ----------
   Not configurable: it is derived from what the case currently holds. Used for
   the case-type badge and to explain which queue a case sits in.
     - instructions_only — instructions present, no images yet
     - images_only       — images present, no instructions yet
     - both              — instructions + images arrived together
     - merged            — an image case and an instructions case were linked
                           (auto or by staff; `linked_to_instruction`)
     - pending           — neither resolved yet (just arrived / exception) */
export type CaseType =
  | 'instructions_only'
  | 'images_only'
  | 'both'
  | 'merged'
  | 'pending';

export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  instructions_only: 'Instructions only',
  images_only: 'Images only',
  both: 'Instructions + images',
  merged: 'Merged',
  pending: 'Pending',
};

/**
 * Derive the case type from its current state. `hasImages` / `hasInstructions`
 * are passed in because the queue/dashboard aggregates do not load evidence; the
 * case-detail / intake screens compute them from the evidence set. When the
 * caller cannot resolve evidence, the status alone gives a best-effort answer.
 */
export function caseTypeOf(
  c: Pick<Case, 'status'>,
  flags?: { hasImages?: boolean; hasInstructions?: boolean },
): CaseType {
  if (c.status === 'linked_to_instruction') return 'merged';
  const hasImages = flags?.hasImages;
  const hasInstructions = flags?.hasInstructions;
  // Only decide from evidence when BOTH flags are known. If either is undefined
  // we cannot tell "absent" from "unloaded", so fall through to the status-only
  // heuristic rather than mislabel a half-known case (queues #5, #10).
  if (hasImages !== undefined && hasInstructions !== undefined) {
    if (hasImages && hasInstructions) return 'both';
    if (hasInstructions) return 'instructions_only';
    if (hasImages) return 'images_only';
    return 'pending';
  }
  // Status-only fallback (aggregate context, no evidence loaded).
  switch (c.status) {
    case 'missing_images':
      return 'instructions_only';
    case 'missing_required_fields':
      return 'images_only';
    case 'needs_review':
    case 'ready_for_eva':
    case 'eva_submitted':
    case 'box_synced':
      return 'both';
    case 'duplicate_risk':
      // A possible-twin case held by dedup: its composition isn't knowable from
      // status alone (it may be instructions-, images-, or both-bearing), so it
      // is 'pending' — but enumerated explicitly so this is a deliberate call,
      // not the catch-all swallowing it (queues #5, #10).
      return 'pending';
    case 'new_email':
    case 'ingested':
    case 'error':
    case 'removed': // soft-removed: composition is irrelevant; never a live work item.
      return 'pending';
  }
}

/* ----------  Dashboard aggregate RESULT TYPES  ----------
   The shapes the DataAccess fetchers return. Computation lives in the sources
   (dataverse-source windows over the fetched cases; the empty source returns
   zeroes), so no fabricated case array is read here. */

/* ----------  LIVE DEPTH (always-now backlogs)  ----------
   Re-cut for the review's dashboard taxonomy: "Not ready" merges the two
   awaiting queues (review dashboard Area 1a); "Review" is the human-review depth
   (review dashboard Area 1b — a "ready" case still counts as review). */
export interface LiveCounts {
  /** Not ready — arrived but not complete (awaiting images / instructions / details). */
  notReady: number;
  /** Review — everything present; the human-in-the-loop check before EVA. */
  review: number;
  /** Held — can't pass through automatically, a possible duplicate, or on hold. */
  held: number;
}

/* ----------  WINDOWED THROUGHPUT (today / this week)  ---------- */
export interface Throughput {
  /** Cases that entered the pipeline today (createdAt === today). */
  inToday: number;
  /** Cases submitted to EVA today (submittedAt === today). */
  submittedToday: number;
  /** Cases submitted to EVA so far this week (Mon-anchored). */
  clearedThisWeek: number;
  /**
   * LIFETIME cumulative count of cases that reached the submitted stage
   * (eva_submitted / box_synced). Distinct from the windowed metrics above so the UI
   * can label a "Sent to EVA (total)" tile honestly instead of mislabelling a
   * lifetime count as windowed (work-todo-spike: amalgamated-dashboard / dashboard-logic).
   * Optional + additive so existing constructors (e.g. the SPA mock source) still compile.
   */
  submittedTotal?: number;
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

/* ----------  PIPELINE STAGES (the signature strip)  ----------
   Re-cut for the review's dashboard (Area 1): "Parsing" (instant-ish) and "Box"
   (same as submitted) are dropped; "Chasing" folds into "Not ready"; "Ready"
   folds into "Review". The strip is now New → Not ready → Review → Submitted. */
export type PipelineStageKey = 'new' | 'not_ready' | 'review' | 'submitted';

export interface PipelineStage {
  key: PipelineStageKey;
  label: string;
  count: number;
  /** 'stuck' lights CE red (the not-ready depth); 'normal' otherwise. */
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

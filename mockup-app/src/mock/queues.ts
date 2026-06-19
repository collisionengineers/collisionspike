import type { ActionReason, Case, CaseStatus } from './types';

/* ============================================================
   Queue IA + dashboard TYPES + pure helpers.

   REVIEW 190626 (nav-bar + dashboard + queues) reshaped the queue
   information architecture. The old four queues (needs-action / in-progress /
   ready / done) are replaced by the case's NATURAL state, surfaced as the four
   sub-options under the first-class "Queues" nav button and as the tabs on the
   merged queue page:

     1. awaiting-images  — "Instructions (awaiting images)": we hold the
                            instructions, we are waiting on the vehicle photos.
     2. images-only      — "Images only": photos arrived without instructions.
     3. ready-review     — "Ready for review": enough is present; a HUMAN must
                            review before EVA submit (a full-auto provider would
                            have been auto-submitted and never land here).
     4. exceptions       — items that cannot pass through automatically (missing
                            the basics — VRM / claimant — or errored).

   "Done (today)" is no longer a queue PAGE (review nav-bar #3): terminal cases
   appear in the dashboard throughput strip + Action Logs, never as a backlog.

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
  | 'awaiting-images'
  | 'images-only'
  | 'ready-review'
  | 'exceptions';

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
    name: 'awaiting-images',
    routeSegment: 'awaiting-images',
    label: 'Instructions (awaiting images)',
    shortLabel: 'Awaiting images',
    // Instructions are in; we are chasing the vehicle photos.
    statuses: ['missing_images'],
    tone: 'muted',
  },
  {
    name: 'images-only',
    routeSegment: 'images-only',
    label: 'Images only',
    shortLabel: 'Images only',
    // Photos are in; we are waiting on / parsing the instruction fields.
    statuses: ['missing_required_fields'],
    tone: 'muted',
  },
  {
    name: 'ready-review',
    routeSegment: 'ready-review',
    label: 'Ready for review',
    shortLabel: 'Ready for review',
    // A PERSON must review before submit. `ready_for_eva` lives here too: a
    // "ready" case still wants human sign-off unless its provider is full-auto
    // (those auto-submit and never appear). Transient intake/link states surface
    // here so nothing is invisible while it settles.
    statuses: [
      'new_email',
      'ingested',
      'linked_to_instruction',
      'needs_review',
      'duplicate_risk',
      'ready_for_eva',
    ],
    tone: 'blocker',
  },
  {
    name: 'exceptions',
    routeSegment: 'exceptions',
    label: 'Exceptions',
    shortLabel: 'Exceptions',
    // Cannot pass through automatically — errored, or missing the basics a case
    // needs to exist at all (VRM / claimant). See queues review #3.
    statuses: ['error'],
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
  if (hasImages !== undefined || hasInstructions !== undefined) {
    if (hasImages && hasInstructions) return 'both';
    if (hasInstructions && !hasImages) return 'instructions_only';
    if (hasImages && !hasInstructions) return 'images_only';
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
    default:
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
  /** Awaiting images + images-only — not yet reviewable ("Not ready"). */
  notReady: number;
  /** Ready for review (human sign-off pending, incl. ready-for-EVA). */
  review: number;
  /** Cannot pass through automatically. */
  exceptions: number;
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

import type { Case, QueueName } from '../data';

/* ============================================================
   case-list-columns — the PURE per-queue column model for the case grid
   (reforge M-D, spec IA §2). No React — the screen maps these ids onto
   its TableColumnDefinition renderers.

   | Queue     | Columns                                                  |
   |-----------|----------------------------------------------------------|
   | not-ready | VRM · Case/PO · Provider · Status · Outstanding · Ch. · Aging/Due |
   | review    | VRM · Case/PO · Provider · Claimant · Vehicle · Aging/Due |
   |           | (Outstanding + Status uniform there → drop; Channel drops — in detail) |
   | held      | VRM · Provider · Why held · Ch. · Age                    |
   |           | (Case/PO drops unconditionally — mostly pre-mint; Status  |
   |           |  COLUMN drops, the Status FILTER stays. "Age" = case age.)|
   ============================================================ */

export type CaseColumnId =
  | 'vrm'
  | 'casePo'
  | 'provider'
  | 'status'
  | 'outstanding'
  | 'channel'
  | 'due'
  | 'claimant'
  | 'vehicle'
  | 'whyHeld'
  | 'age';

/** Ordered column ids for a queue (spec IA §2). */
export function columnsForQueue(name: QueueName): CaseColumnId[] {
  switch (name) {
    case 'review':
      return ['vrm', 'casePo', 'provider', 'claimant', 'vehicle', 'due'];
    case 'held':
      return ['vrm', 'provider', 'whyHeld', 'channel', 'age'];
    default:
      return ['vrm', 'casePo', 'provider', 'status', 'outstanding', 'channel', 'due'];
  }
}

/* ----------  Held classification (ONE classifier — wording + bulk
   eligibility both derive from it, so they can never drift)  ---------- */

export type HeldReason =
  | 'duplicate'
  | 'provider_not_recognised'
  | 'missing_basics'
  | 'failed_processing'
  | 'on_hold';

/**
 * FACT-driven held classification (M-D review rework: on the live Azure path
 * nothing sets duplicate_risk and error never fires at intake, so each branch
 * keys off what is actually true of the row, not a status enum).
 *
 * `openTwinCount` = OTHER open cases sharing this VRM — not on the row;
 * fetched live via data.openVrmTwins() (the enrichment seam outstandingText
 * documents).
 *
 * Branch precedence (specific before generic):
 *   duplicate › provider-not-recognised › missing basics › failed processing › on hold
 */
export function heldReason(c: Case, openTwinCount?: number): HeldReason {
  // Duplicate FACT (live twins for this VRM, any status) or the status flag.
  if (
    (typeof openTwinCount === 'number' && openTwinCount > 0) ||
    c.status === 'duplicate_risk'
  ) {
    return 'duplicate';
  }
  // New-client park: person-parked for review with no recognised provider
  // (the live api's intake hold).
  if (c.onHold && c.actionReason === 'needs_review' && !c.providerCode) {
    return 'provider_not_recognised';
  }
  // Basics FACT (un-gated from status): the case identity fields are absent.
  if (!c.vrm?.trim() || !c.evaFields.claimantName.value?.trim()) {
    return 'missing_basics';
  }
  if (c.status === 'error') return 'failed_processing';
  // Person-parked (or a future held reason): honest, person-facing wording.
  return 'on_hold';
}

/** The person-facing decision verb per held reason (atlas wording 2026-07-01
    — "not recognised", never "new", so it can't nudge duplicate-provider
    creation). The duplicate verb is enriched with the live count below. */
const HELD_VERB: Record<HeldReason, string> = {
  duplicate: 'Possible duplicate',
  provider_not_recognised: 'Provider not recognised — needs set-up',
  missing_basics: 'Missing the basics (claimant / VRM)',
  failed_processing: 'Failed processing',
  on_hold: 'On hold',
};

/**
 * The held queue's "Why held" decision verb (spec IA §2 ruling). A positive
 * live twin count names the number; without one the duplicate wording stays
 * generic rather than inventing a number.
 */
export function whyHeldText(c: Case, openTwinCount?: number): string {
  const reason = heldReason(c, openTwinCount);
  if (reason === 'duplicate' && typeof openTwinCount === 'number' && openTwinCount > 0) {
    return `Possible duplicate — ${openTwinCount} open for this VRM`;
  }
  return HELD_VERB[reason];
}

/**
 * Rows a BULK Release may act on (spec IA §4 + atlas ruling): everything
 * EXCEPT the per-case-decision classifications — duplicate and failed
 * processing. Provider-not-recognised and missing-basics rows STAY eligible
 * (release-after-set-up is the intended flow). Derived from the SAME
 * heldReason classifier as the column wording.
 */
export function heldReleaseEligible(c: Case, openTwinCount?: number): boolean {
  const reason = heldReason(c, openTwinCount);
  return reason !== 'duplicate' && reason !== 'failed_processing';
}

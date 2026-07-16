/**
 * services/data-api/src/features/cases/overview-chase.ts — targeted overview-photo chase suggestion (TKT-148).
 *
 * Post-classification, a case can hold a healthy photo set that GENUINELY lacks a
 * vehicle overview (e.g. A.QDOS26029: every accepted photo is a damage close-up) —
 * honestly stuck at missing_images, and the fix is a real photo from the customer,
 * not reclassification. This detector runs inside BOTH status-recompute seams
 * (cases.ts recomputeStatus — staff edits/merges; internal.ts recomputeStatus — the
 * orchestration status-evaluate route the classify sweep re-invokes per stamped
 * case), so a case is re-examined exactly when its photo set or fields change.
 *
 * PREDICATE (all three, over the case's image-kind evidence):
 *   - accepted photos >= OVERVIEW_CHASE_MIN_ACCEPTED_IMAGES (accepted_for_eva AND
 *     NOT excluded — the image-rules "accepted" definition);
 *   - ZERO overview-role candidates among the accepted photos (role = overview,
 *     regardless of registration_visible: a photo classified overview is a
 *     candidate for the role even before OCR confirms the plate — chasing then
 *     would be premature);
 *   - ZERO still-unclassified photos (role unknown AND registration_visible IS
 *     NULL, not excluded — the TKT-131 predicate). This guard prevents false
 *     chases while the TKT-146 classify sweep is still draining a case's backlog:
 *     an unclassified photo MIGHT be the overview.
 *
 * MINT SEMANTICS (idempotent, deliberately conservative):
 *   - at most ONE system suggestion per case, EVER — a partial UNIQUE index over
 *     `suggested` overview requests is the concurrency backstop; the guarded INSERT's
 *     NOT-EXISTS also blocks when any chaser row with this template already exists
 *     (any status) OR any OPEN chaser (drafted/sent/overdue) of any template
 *     exists (staff are already chasing; don't pile on).
 *   - NO automatic re-mint after a responded/satisfied chase: an email attach
 *     marks ALL outstanding chasers responded (markOutstandingChasersResponded),
 *     so predicate-true + auto-re-mint would mint a new row on every unrelated
 *     attach. Repeat chases are a human call via the existing chaser panel.
 *   - DRAFT-ONLY (ADR-0003): status_code keeps the DB default 'drafted'; the
 *     suggestion is copy staff send by hand — nothing here sends anything.
 *
 * Advisory by design: every failure path returns false and never throws, so a
 * suggestion hiccup can never sink the status recompute that hosts it.
 */

import { isTerminalStatus, type CaseStatus } from '@cs/domain';
import { caseStatusCodec, evidenceKindCodec, imageRoleCodec } from '@cs/domain/codecs';
import { query, tx, type TxQuery } from '../../platform/db/client.js';
import { AUDIT_ACTION, writeAudit } from '../../shared/audit.js';
import { mergedIntoFrom } from '../../shared/mapping/index.js';

/** N — minimum accepted photos before an overview-less set is worth a chase (TKT-148). */
export const OVERVIEW_CHASE_MIN_ACCEPTED_IMAGES = 5;

/** The system template label — ALSO the once-per-case idempotency key (template_used). */
export const OVERVIEW_CHASE_TEMPLATE_LABEL = 'Overview photo request';

/** chaser.name — the staff-visible summary; handler-plain, marks it system-suggested. */
export const OVERVIEW_CHASE_SUMMARY =
  'Suggested chase — ask for a photo of the whole vehicle showing the registration plate clearly.';

const IMAGE_KIND_CODE = evidenceKindCodec.toInt('image') ?? 100000000;
const OVERVIEW_ROLE_CODE = imageRoleCodec.toInt('overview') ?? 100000000;
const UNKNOWN_ROLE_CODE = imageRoleCodec.toInt('unknown') ?? 100000003;

/** choice_chaser_target_type work_provider / choice_chaser_channel email — the same
 *  frozen codes the staff logChase write uses (cases.ts). */
const TARGET_TYPE_WORK_PROVIDER = 100000002;
const CHANNEL_EMAIL = 100000000;

/** Open chaser statuses (drafted, sent, overdue) — mirrors internal.ts
 *  CHASER_OUTSTANDING_CODES; 'responded' (100000002) is deliberately NOT open. */
const OPEN_CHASER_STATUS_CODES = '100000000, 100000001, 100000003';

export interface OverviewChaseCounts {
  /** Accepted photos: image kind, accepted_for_eva, NOT excluded. */
  acceptedCount: number;
  /** Accepted photos already classified overview (any registration_visible). */
  overviewCount: number;
  /** Still-unclassified photos: role unknown AND registration_visible IS NULL, not excluded. */
  unclassifiedCount: number;
}

interface OverviewChaseAggregate extends Record<string, unknown> {
  provider_display: string | null;
  accepted_count: number | string;
  overview_count: number | string;
  unclassified_count: number | string;
}

async function loadOverviewChaseAggregate(
  q: TxQuery,
  caseId: string,
): Promise<OverviewChaseAggregate | undefined> {
  const rows = await q<OverviewChaseAggregate>(
    `SELECT COALESCE(wp.display_name, '') AS provider_display,
            COUNT(e.id) FILTER (WHERE e.accepted_for_eva AND NOT e.excluded)::int AS accepted_count,
            COUNT(e.id) FILTER (WHERE e.accepted_for_eva AND NOT e.excluded AND e.image_role_code = $3)::int AS overview_count,
            COUNT(e.id) FILTER (WHERE NOT e.excluded AND e.image_role_code = $4 AND e.registration_visible IS NULL)::int AS unclassified_count
       FROM case_ c
       LEFT JOIN work_provider wp ON wp.id = c.work_provider_id
       LEFT JOIN evidence e ON e.case_id = c.id AND e.kind_code = $2
      WHERE c.id = $1
      GROUP BY wp.display_name`,
    [caseId, IMAGE_KIND_CODE, OVERVIEW_ROLE_CODE, UNKNOWN_ROLE_CODE],
  );
  return rows[0];
}

function countsFrom(row: OverviewChaseAggregate): OverviewChaseCounts {
  return {
    acceptedCount: Number(row.accepted_count ?? 0),
    overviewCount: Number(row.overview_count ?? 0),
    unclassifiedCount: Number(row.unclassified_count ?? 0),
  };
}

/**
 * PURE eligibility check — exported for unit tests and so the one-shot SQL-parity
 * pass and both recompute seams share ONE definition of "genuinely lacks an
 * overview": an active (non-terminal, non-retired) case whose classified photo set
 * is big enough to chase over, has no overview candidate, and has nothing left in
 * the classify queue that might still turn out to be one.
 */
export function isOverviewChaseEligible(status: CaseStatus, counts: OverviewChaseCounts): boolean {
  return (
    !isTerminalStatus(status) &&
    status !== 'linked_to_instruction' &&
    counts.acceptedCount >= OVERVIEW_CHASE_MIN_ACCEPTED_IMAGES &&
    counts.overviewCount === 0 &&
    counts.unclassifiedCount === 0
  );
}

/**
 * Evaluate the predicate for one case and mint the suggested chase when it holds.
 * Returns true only when THIS call minted the row. The NOT-EXISTS policy avoids
 * unnecessary writes; ON CONFLICT + the partial unique index make concurrent
 * evaluators safe: exactly one wins and the rest no-op.
 * Never throws — advisory, best-effort (the audit write is itself never-throws).
 */
export async function maybeSuggestOverviewChase(
  caseId: string,
  status: CaseStatus,
  actor?: string,
): Promise<boolean> {
  try {
    // Terminal / retired-merged cases are never chased — skip before any DB work.
    if (isTerminalStatus(status) || status === 'linked_to_instruction') return false;

    const row = await loadOverviewChaseAggregate(query, caseId);
    if (!row) return false; // unknown case
    const counts = countsFrom(row);
    if (!isOverviewChaseEligible(status, counts)) return false;

    const minted = await tx(async (q) => {
      // The aggregate above is advisory, but the case lifecycle is not: lock and
      // re-read the current persisted status + merge marker immediately before the
      // INSERT. A finalize/close/merge that won the row first therefore suppresses
      // the chase; one that arrives later waits until this decision commits.
      const current = await q<{ status_code: number; duplicate_keys: unknown }>(
        `SELECT status_code, duplicate_keys
           FROM case_
          WHERE id = $1
          FOR UPDATE`,
        [caseId],
      );
      const currentStatus = caseStatusCodec.toName(current[0]?.status_code) as CaseStatus | undefined;
      if (
        !currentStatus ||
        mergedIntoFrom(current[0]?.duplicate_keys) ||
        isTerminalStatus(currentStatus) ||
        currentStatus === 'linked_to_instruction'
      ) {
        return null;
      }

      // Evidence and provider details may have changed while this call waited for
      // the case lock. Re-run the aggregate now and use only this fresh snapshot for
      // the eligibility decision, INSERT target, and audit facts.
      const freshRow = await loadOverviewChaseAggregate(q, caseId);
      if (!freshRow) return null;
      const freshCounts = countsFrom(freshRow);
      if (!isOverviewChaseEligible(currentStatus, freshCounts)) return null;
      const targetName = String(freshRow.provider_display ?? '').slice(0, 200);

      // Guard + mint in ONE statement (concurrent recomputes can't double-mint):
      // blocked when the system suggestion already exists (any status — once per
      // case, ever) OR any open chase exists (staff are already chasing).
      const rows = await q<{ id: string }>(
        `INSERT INTO chaser
           (name, case_id, target_type_code, target_name, channel_code, template_used, drafted_at, suggested)
         SELECT $1, $2, $3, $4, $5, $6, now(), true
          WHERE NOT EXISTS (
            SELECT 1 FROM chaser ch
             WHERE ch.case_id = $2
                AND (ch.template_used = $6 OR ch.status_code IN (${OPEN_CHASER_STATUS_CODES})))
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          OVERVIEW_CHASE_SUMMARY,
          caseId,
          TARGET_TYPE_WORK_PROVIDER,
          targetName,
          CHANNEL_EMAIL,
          OVERVIEW_CHASE_TEMPLATE_LABEL,
        ],
      );
      return rows[0] ? { inserted: rows[0], counts: freshCounts } : null;
    });
    if (!minted) return false; // terminal/merged/ineligible/already suggested/staff already chasing

    // A suggestion is not a sent/logged chase. The distinct controlled action keeps
    // the activity feed honest while staff decide whether to use the draft.
    await writeAudit({
      action: AUDIT_ACTION.chaser_suggested,
      caseId,
      summary: `Chase suggested (${OVERVIEW_CHASE_TEMPLATE_LABEL}) — drafted for staff to send`,
      after: {
        chaserId: minted.inserted.id,
        templateLabel: OVERVIEW_CHASE_TEMPLATE_LABEL,
        suggested: true,
        acceptedImages: minted.counts.acceptedCount,
      },
      ...(actor ? { actor } : {}),
    });
    return true;
  } catch {
    return false; // advisory — a suggestion failure must never sink the recompute
  }
}

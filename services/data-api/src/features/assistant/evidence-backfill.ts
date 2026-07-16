/** evidence-backfill — cohesive Data API module. */

import { query } from '../../platform/db/client.js';
import { enqueueEvidenceBackfill } from '../evidence/backfill-queue.js';
import { verifiedMergeLineage } from '../evidence/backfill-target.js';

export const IMAGE_KIND = 100000000;

interface PendingEvidenceBackfillRequest extends Record<string, unknown> {
  id: string;
  case_id: string;
  source_mailbox: string;
  source_message_id: string;
  subject: string | null;
  evidence_backfill_requested_generation: string | number;
  evidence_backfill_enqueued_generation: string | number;
}

interface UnrequestedEvidenceBackfillCandidate extends PendingEvidenceBackfillRequest {
  scan_updated_at: string | Date;
}

async function acceptedEvidenceBackfillTarget(
  inboundEmailId: string,
  currentOwner: string,
): Promise<string | undefined> {
  const accepted = await query<{ target_case_id: string }>(
    `SELECT NULLIF(btrim(s.suggested_value ->> 'targetCaseId'), '') AS target_case_id
       FROM ai_suggestion s
      WHERE s.inbound_email_id = $1
        AND s.suggestion_type = 'case_link'
        AND s.review_state = 'accepted'
        AND NULLIF(btrim(s.suggested_value ->> 'targetCaseId'), '') IS NOT NULL
      ORDER BY s.reviewed_at DESC NULLS LAST, s.created_at DESC, s.id DESC`,
    [inboundEmailId],
  );
  const canonicalOwner = currentOwner.trim().toLowerCase();
  for (const candidate of accepted) {
    const target = candidate.target_case_id?.trim();
    if (!target) continue;
    if (target.toLowerCase() === canonicalOwner) return target;
    if (await verifiedMergeLineage(query, target, currentOwner)) return target;
  }
  return undefined;
}

export async function drainEvidenceBackfillRequests(
  inboundEmailId?: string,
  limit = 50,
): Promise<{ published: number; failed: number }> {
  const effectiveLimit = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 250) : 50;
  // Reconcile accepts written by the pre-outbox implementation. This is a one-time,
  // idempotent promotion from generation 0 and makes an old accepted/link state
  // recoverable without guessing whether its attachments were already copied (the
  // consumer's byte-hash dedup makes the conservative retry safe). Keyset pagination
  // is deliberate: lineage-ineligible rows are left untouched, so a LIMIT-only
  // oldest-first page would otherwise starve every valid recovery behind them forever.
  const scanPageSize = inboundEmailId ? 1 : Math.max(50, effectiveLimit);
  let cursorUpdatedAt: string | Date | null = null;
  let cursorId: string | null = null;
  let promotedUnrequested = 0;
  while (promotedUnrequested < effectiveLimit) {
    const unrequested: UnrequestedEvidenceBackfillCandidate[] = await query<UnrequestedEvidenceBackfillCandidate>(
      `SELECT ie.id, ie.case_id, ie.source_mailbox, ie.source_message_id, ie.subject,
              ie.evidence_backfill_requested_generation,
              ie.evidence_backfill_enqueued_generation,
              ie.updated_at AS scan_updated_at
         FROM inbound_email ie
        WHERE ie.evidence_backfill_requested_generation = 0
          AND ie.case_id IS NOT NULL
          AND ie.has_attachments = true
          AND NULLIF(btrim(ie.source_mailbox), '') IS NOT NULL
          AND NULLIF(btrim(ie.source_message_id), '') IS NOT NULL
          ${inboundEmailId
            ? 'AND ie.id = $1'
            : 'AND ($1::timestamptz IS NULL OR (ie.updated_at, ie.id) > ($1::timestamptz, $2::uuid))'}
          AND EXISTS (
            SELECT 1
              FROM ai_suggestion s
             WHERE s.inbound_email_id = ie.id
               AND s.suggestion_type = 'case_link'
               AND s.review_state = 'accepted'
               AND NULLIF(btrim(s.suggested_value ->> 'targetCaseId'), '') IS NOT NULL
          )
        ORDER BY ie.updated_at, ie.id
        LIMIT $${inboundEmailId ? 2 : 3}`,
      inboundEmailId
        ? [inboundEmailId, scanPageSize]
        : [cursorUpdatedAt, cursorId, scanPageSize],
    );
    if (unrequested.length === 0) break;
    for (const candidate of unrequested) {
      if (promotedUnrequested >= effectiveLimit) break;
      const acceptedTarget = await acceptedEvidenceBackfillTarget(candidate.id, candidate.case_id);
      if (!acceptedTarget) continue;
      const promoted = await query<{ id: string }>(
        `UPDATE inbound_email
            SET evidence_backfill_requested_generation = 1,
                evidence_backfill_requested_at = now(),
                updated_at = now()
          WHERE id = $1
            AND case_id = $2
            AND evidence_backfill_requested_generation = 0
        RETURNING id`,
        [candidate.id, candidate.case_id],
      );
      if (promoted[0]) promotedUnrequested++;
    }
    if (inboundEmailId || unrequested.length < scanPageSize) break;
    const last: UnrequestedEvidenceBackfillCandidate = unrequested[unrequested.length - 1]!;
    cursorUpdatedAt = last.scan_updated_at;
    cursorId = last.id;
  }
  const rows = await query<PendingEvidenceBackfillRequest>(
    `SELECT ie.id, ie.case_id, ie.source_mailbox, ie.source_message_id, ie.subject,
            ie.evidence_backfill_requested_generation,
            ie.evidence_backfill_enqueued_generation
       FROM inbound_email ie
      WHERE ie.evidence_backfill_requested_generation > ie.evidence_backfill_enqueued_generation
        AND ie.case_id IS NOT NULL
        AND NULLIF(btrim(ie.source_mailbox), '') IS NOT NULL
        AND NULLIF(btrim(ie.source_message_id), '') IS NOT NULL
        ${inboundEmailId ? 'AND ie.id = $1' : ''}
      ORDER BY ie.evidence_backfill_requested_at, ie.id
      LIMIT $${inboundEmailId ? 2 : 1}`,
    inboundEmailId ? [inboundEmailId, effectiveLimit] : [effectiveLimit],
  );
  let published = 0;
  let failed = 0;
  for (const row of rows) {
    const generation = Number(row.evidence_backfill_requested_generation);
    // Every generation is bound back to a staff-accepted target. A failed gen-2
    // publish followed by a manual relink must not let the next drain reinterpret the
    // current owner as the accepted target. A real merge still verifies and redirects.
    const targetCaseId = await acceptedEvidenceBackfillTarget(row.id, row.case_id);
    // Keep the durable generation pending when none of the accepted targets owns
    // this row. A later unrelated manual relink must not be acknowledged as queued.
    if (!targetCaseId) continue;
    try {
      await enqueueEvidenceBackfill({
        inboundEmailId: row.id,
        generation,
        sourceMailbox: row.source_mailbox.trim(),
        sourceMessageId: row.source_message_id.trim(),
        // For the first durable generation, preserve the case that staff actually
        // accepted. The consumer validates/follows its mergedInto lineage to the
        // row's current owner; a manual unrelated relink therefore settles stale
        // instead of copying attachments onto the wrong case.
        targetCaseId,
        subject: row.subject ?? '',
      });
      await query(
        `UPDATE inbound_email
            SET evidence_backfill_enqueued_generation = GREATEST(
                  evidence_backfill_enqueued_generation,
                  $2
                ),
                evidence_backfill_enqueued_at = now(),
                updated_at = now()
          WHERE id = $1
            AND case_id = $3
            AND evidence_backfill_requested_generation >= $2`,
        [row.id, generation, row.case_id],
      );
      published++;
    } catch (error) {
      failed++;
      console.error(
        `[ai-suggestions] evidence-backfill publish failed for inbound ${row.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return { published, failed };
}

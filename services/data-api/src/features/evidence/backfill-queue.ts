/**
 * services/data-api/src/features/evidence/backfill-queue.ts — enqueue evidence-backfill jobs onto the
 * orchestration app's `evidence-backfill` storage queue (TKT-145).
 *
 * Fired by the case_link ACCEPT seam (ai-suggestions.ts promoteAcceptedSuggestion) when a
 * previously-UNCASED, attachment-bearing inbound email is attached to a case: the
 * suggest-first lanes (e.g. TKT-102's Tractable PDF-VRM rung) never ran
 * classifyPersist/extractImages, so the landed attachments were never persisted as
 * evidence. The orchestration consumer
 * (services/orchestration/src/workflows/evidence/evidence-backfill.ts)
 * re-fetches the message from Graph and drives the EXISTING persist chain onto the target
 * case, then re-evaluates status.
 *
 * Transport: the SAME managed-identity Queue REST mechanics as the `outlook-move` queue
 * (lib/outlook-queue.ts's shared enqueueQueueMessage) — both queues live on the
 * orchestration storage account (cespkorchstdev01; account-scoped Storage Queue Data
 * Message Sender already covers this queue, verified 2026-07-10). The service URL rides
 * OUTLOOK_MOVE_QUEUE_SERVICE_URL via gates.evidenceBackfillQueueServiceUrl()'s fallback.
 *
 * THROWS on any failure — the caller then writes the durable "attach by hand" case note
 * (the TKT-145 inversion of the always-note interim mitigation).
 */

import { gates } from '../settings/gates.js';
import { enqueueQueueMessage } from '../inbound/outlook-queue.js';

export const EVIDENCE_BACKFILL_QUEUE_NAME = 'evidence-backfill';

/** The job the orchestration backfill consumer consumes — keep in sync with
 *  services/orchestration/src/workflows/evidence/evidence-backfill.ts. */
export interface EvidenceBackfillJob {
  inboundEmailId: string;
  /** Durable request generation this queue delivery is allowed to complete/report. */
  generation: number;
  /** Which shared inbox the email arrived on (inbound_email.source_mailbox). */
  sourceMailbox: string;
  /** RFC Internet-Message-Id (inbound_email.source_message_id) — the consumer resolves
   *  the CURRENT Graph message id from it ($filter), falling back to a whole-mailbox
   *  $search corroborated on this exact id. */
  sourceMessageId: string;
  /** The case the accept attached the email to — evidence lands here. */
  targetCaseId: string;
  /** inbound_email.subject — the $search fallback key (Graph $search cannot filter on
   *  internetMessageId; candidates are corroborated on sourceMessageId). '' when unknown. */
  subject?: string;
}

/** Enqueue one backfill job. THROWS on any failure (caller degrades to the manual note). */
export async function enqueueEvidenceBackfill(job: EvidenceBackfillJob): Promise<void> {
  const serviceUrl = gates.evidenceBackfillQueueServiceUrl();
  if (!serviceUrl) throw new Error('evidence-backfill queue service URL not configured');
  await enqueueQueueMessage(serviceUrl, EVIDENCE_BACKFILL_QUEUE_NAME, job);
}

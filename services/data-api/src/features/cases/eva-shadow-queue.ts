/**
 * services/data-api/src/features/cases/eva-shadow-queue.ts — enqueue EVA shadow-submit jobs onto
 * the orchestration app's `eva-shadow-submit` storage queue (TKT-298, PLAN-015 Slice A).
 *
 * Fired by the `markEvaSubmitted` route AFTER a real `ready_for_eva → eva_submitted` transition,
 * only while EVA_SHADOW_AUTOSUBMIT_ENABLED is on (the alpha posture). The orchestration consumer
 * (services/orchestration/src/workflows/archive/eva-shadow-submit.ts) additionally requires
 * EVA_API_ENABLED and drives the EXISTING `evaSubmit` activity — payload from
 * `internal/cases/{id}/eva-submission`, submission via the eva-sentry Function. Which EVA
 * environment receives it is decided by the configured credentials (ADR-0005).
 *
 * Transport: the SAME managed-identity Queue REST mechanics as `outlook-move` /
 * `evidence-backfill` (outlook-queue.ts's shared enqueueQueueMessage) — the queue lives on the
 * orchestration storage account, and the account-scoped Storage Queue Data Message Sender role
 * already covers it. The service URL rides OUTLOOK_MOVE_QUEUE_SERVICE_URL via
 * gates.evidenceBackfillQueueServiceUrl()'s fallback.
 *
 * BEST-EFFORT by contract: the staff response must never change because the shadow could not be
 * enqueued — use maybeEnqueueEvaShadowSubmit, which swallows failures into a warn. (Contrast
 * evidence-backfill, which THROWS so its caller can degrade to a manual note.)
 */

import { gates } from '../settings/gates.js';
import { enqueueQueueMessage } from '../inbound/outlook-queue.js';

export const EVA_SHADOW_SUBMIT_QUEUE_NAME = 'eva-shadow-submit';

/** The job the orchestration shadow consumer consumes — keep in sync with
 *  services/orchestration/src/workflows/archive/eva-shadow-submit.ts. */
export interface EvaShadowSubmitJob {
  caseId: string;
}

/** Enqueue one shadow-submit job. THROWS on any failure (transport contract). */
export async function enqueueEvaShadowSubmit(job: EvaShadowSubmitJob): Promise<void> {
  const serviceUrl = gates.evidenceBackfillQueueServiceUrl();
  if (!serviceUrl) throw new Error('eva-shadow-submit queue service URL not configured');
  await enqueueQueueMessage(serviceUrl, EVA_SHADOW_SUBMIT_QUEUE_NAME, job);
}

/**
 * The route-facing seam: enqueue only after a REAL transition (`updated === true`) and only
 * while the gate is on; NEVER throws — an enqueue failure is warned and dropped so the staff
 * response is byte-identical whether or not the shadow fired. A missed shadow is recoverable
 * (the operator can re-drive the queue for the case); a changed staff response is not.
 */
export async function maybeEnqueueEvaShadowSubmit(
  updated: boolean,
  caseId: string,
  warn: (message: string) => void,
): Promise<void> {
  if (!updated || !gates.evaShadowAutosubmit()) return;
  try {
    await enqueueEvaShadowSubmit({ caseId });
  } catch (e) {
    warn(`[eva-shadow] enqueue failed for case ${caseId} (shadow skipped, staff flow unaffected): ${e instanceof Error ? e.message : String(e)}`);
  }
}

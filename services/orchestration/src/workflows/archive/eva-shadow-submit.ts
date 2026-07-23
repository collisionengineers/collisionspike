/** *
 * EVA shadow auto-submit (TKT-298, PLAN-015 Slice A): queue trigger draining the
 * `eva-shadow-submit` storage queue the Data API enqueues onto when a REAL
 * `ready_for_eva → eva_submitted` transition happens with EVA_SHADOW_AUTOSUBMIT_ENABLED on.
 *
 * The orchestrator is a single retry-wrapped call of the EXISTING `evaSubmit` activity
 * (finalize-eva-box.ts): payload from the Data API's internal eva-submission producer,
 * submission via the eva-sentry Function, `eva_submitted` audit on success. It deliberately
 * does NOT run `boxFolderAugment` — the Case/PO Archive folder is already created at
 * intake, so re-running the folder step here would be redundant.
 *
 * Gates (both required, checked at the consumer edge): EVA_SHADOW_AUTOSUBMIT_ENABLED and
 * EVA_API_ENABLED. Off => honest traced drop; the queue message is consumed, nothing runs.
 * Which EVA environment receives the submission is decided by the configured credentials
 * (ADR-0005 — vendor UAT credentials route to the vendor test environment).
 *
 * Idempotency stack: the DB transition fires at most one enqueue per case; duplicate queue
 * deliveries collapse onto the deterministic `eva-shadow-{caseId}` instance id (same dedup
 * shape as intake-starter); a genuinely re-submitted payload is finally absorbed by
 * eva-sentry's own payloadHash cache. Failed/Terminated instances stay re-startable so an
 * operator can re-drive a case by re-enqueueing `{ "caseId": "..." }`.
 */

import { app, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';

app.storageQueue('eva-shadow-submit-starter', {
  queueName: 'eva-shadow-submit',
  connection: 'AzureWebJobsStorage',
  extraInputs: [df.input.durableClient()],
  handler: async (item: unknown, ctx: InvocationContext): Promise<void> => {
    // Functions v4 auto-deserializes JSON queue messages; accept a raw string too.
    const msg = (typeof item === 'string' ? JSON.parse(item) : item) as { caseId?: unknown };
    const caseId = String(msg?.caseId ?? '').trim();
    if (!caseId) {
      ctx.warn('[eva-shadow] dropped — message carries no caseId');
      return;
    }

    if (!gates.evaShadowAutosubmit() || !gates.evaApi()) {
      ctx.log(`[eva-shadow] dropped for case ${caseId} — EVA_SHADOW_AUTOSUBMIT_ENABLED and/or EVA_API_ENABLED off`);
      return;
    }

    const client = df.getClient(ctx);

    // Deterministic, management-API-safe instance id (same shape as intake-starter):
    // duplicate deliveries for one case map onto one orchestration.
    const safeCaseId = caseId.replace(/[^A-Za-z0-9_-]/g, '');
    const instanceId = `eva-shadow-${safeCaseId}`;

    // getStatus THROWS a 404 when no instance exists — the normal first-seen case.
    let existing;
    try {
      existing = await client.getStatus(instanceId);
    } catch {
      existing = undefined;
    }
    if (existing && existing.runtimeStatus !== 'Failed' && existing.runtimeStatus !== 'Terminated') {
      ctx.log(`[eva-shadow] skipping duplicate — instance ${instanceId} already ${existing.runtimeStatus}`);
      return;
    }

    await client.startNew('evaShadowSubmitOrchestrator', { instanceId, input: { caseId } });
    ctx.log(`[eva-shadow] started orchestration ${instanceId}`);
  },
});

const retry = new df.RetryOptions(5_000, 3);
retry.backoffCoefficient = 2;
retry.maxRetryIntervalInMilliseconds = 60_000;

df.app.orchestration('evaShadowSubmitOrchestrator', function* (ctx) {
  const { caseId } = ctx.df.getInput() as { caseId: string };
  // Reuse the app-global evaSubmit activity — its own gate check makes a mid-flight
  // gate-off flip degrade to `{ skipped: true }` rather than fail the instance.
  const eva = yield ctx.df.callActivityWithRetry('evaSubmit', retry, { caseId });
  return { caseId, eva };
});

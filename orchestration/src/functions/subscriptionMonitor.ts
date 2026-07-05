/**
 * orchestration/src/functions/subscriptionMonitor.ts
 *
 * PRIMARY, durable Graph-subscription renewal — the fix for the Flex Consumption timer that
 * never fires (graph-renew logged 0 executions in 7d because a plain timer trigger isn't woken
 * when the app is scaled to zero).
 *
 * An ETERNAL durable orchestration: renew (activity) → durable timer (INTERVAL) → continueAsNew.
 * Per Microsoft Learn (durable-task timers): "If the function app is scaled down to zero
 * instances in the meantime, the newly visible timer message ensures that the function app
 * activates again on an appropriate VM." So unlike a plain timer trigger, a DURABLE timer wakes
 * a scaled-to-zero Flex app — reliable renewal with NO always-ready instance and NO external
 * scheduler (it also reuses the existing durable=1 always-ready group's warm dispatcher).
 *
 * Singleton (fixed instanceId). Bootstrapped idempotently from the graph-renew HTTP route and
 * from intake-starter (any intake traffic re-ensures it). continueAsNew keeps history bounded
 * and the orchestration alive forever.
 *
 * App-setting: SUBSCRIPTION_MONITOR_INTERVAL_HOURS (default 6 — well under the ~7-day sub max).
 */

import * as df from 'durable-functions';
import { runSubscriptionMaintenance } from '../lib/subscriptions.js';

export const SUBSCRIPTION_MONITOR_INSTANCE_ID = 'subscription-monitor-singleton';

const INTERVAL_HOURS = Number(process.env.SUBSCRIPTION_MONITOR_INTERVAL_HOURS ?? '6');
const INTERVAL_MS = (Number.isFinite(INTERVAL_HOURS) && INTERVAL_HOURS > 0 ? INTERVAL_HOURS : 6) * 3_600_000;

/** Retry for the maintenance activity: 30 s first retry, 2x backoff, cap 5 min, 4 attempts — so a
 *  transient Graph/list/auth blip is absorbed before it ever reaches the orchestrator's catch. */
const maintenanceRetry = new df.RetryOptions(/*firstRetryIntervalInMilliseconds*/ 30_000, /*maxNumberOfAttempts*/ 4);
maintenanceRetry.backoffCoefficient = 2;
maintenanceRetry.maxRetryIntervalInMilliseconds = 300_000;

/** Activity: the actual Graph renew/bootstrap work (I/O lives here, not in the orchestrator). */
df.app.activity('subscriptionMaintenance', {
  handler: async (_input: unknown, ctx): Promise<unknown> => {
    const summary = await runSubscriptionMaintenance(ctx);
    ctx.log(
      JSON.stringify({
        evt: 'subscription-maintenance',
        renewed: summary.renewed.length,
        created: summary.created.length,
        recreated: summary.recreated.length,
        pruned: summary.pruned.length,
        errors: summary.errors.length,
      }),
    );
    return summary;
  },
});

/** Eternal orchestrator: renew now, sleep on a durable timer, then continueAsNew (forever). */
df.app.orchestration('subscriptionMonitorOrchestrator', function* (ctx) {
  // This singleton is the ONLY thing keeping the Graph subscriptions alive (a plain timer can't
  // wake a scaled-to-zero Flex app), so it must be UNKILLABLE (#49). Maintenance is retried; and
  // EVEN IF it ultimately throws, we swallow it and STILL reschedule below — a thrown maintenance
  // must never stop the eternal loop, or the renewer dies and the subscriptions silently lapse.
  try {
    yield ctx.df.callActivityWithRetry('subscriptionMaintenance', maintenanceRetry);
  } catch (e) {
    if (!ctx.df.isReplaying) {
      ctx.log(
        `[subscriptionMonitor] maintenance failed after retries — rescheduling anyway so the renewer never dies: ${String(e)}`,
      );
    }
  }
  // currentUtcDateTime (NOT Date.now()) keeps the orchestrator replay-deterministic. This runs
  // unconditionally (even after a caught failure) so the loop ALWAYS schedules the next pass.
  const next = new Date(ctx.df.currentUtcDateTime.getTime() + INTERVAL_MS);
  yield ctx.df.createTimer(next);
  ctx.df.continueAsNew(undefined);
});

/**
 * Start the singleton monitor if it is not already alive (idempotent). getStatus throws 404
 * when the instance has never run — treated as "not running" → start.
 */
export async function ensureSubscriptionMonitor(
  client: df.DurableClient,
  log?: (m: string) => void,
): Promise<{ started: boolean; status?: string }> {
  try {
    const status = await client.getStatus(SUBSCRIPTION_MONITOR_INSTANCE_ID);
    const alive =
      status && ['Running', 'Pending', 'ContinuedAsNew'].includes(String(status.runtimeStatus));
    if (alive) return { started: false, status: String(status.runtimeStatus) };
  } catch {
    /* not found → fall through and start */
  }
  await client.startNew('subscriptionMonitorOrchestrator', {
    instanceId: SUBSCRIPTION_MONITOR_INSTANCE_ID,
  });
  log?.(`[subscriptionMonitor] started singleton ${SUBSCRIPTION_MONITOR_INSTANCE_ID}`);
  return { started: true };
}

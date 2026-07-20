/**
 * Eternal Durable monitor for the Box image-classification sweep (TKT-146).
 *
 * Split out of `box-maintenance-monitor.ts` in TKT-264: it is NOT part of the Archive outbox
 * data plane, so it lives in its own module. The combined `maintenance/box-monitors` control route
 * and the `box-maintenance-monitor-bootstrap` timer stay in `box-maintenance-monitor.ts` and compose
 * this monitor's status alongside the File Request monitor via the exports below.
 *
 * Every Durable identifier — `box-classification-monitor-singleton`,
 * `boxClassificationMonitorOrchestrator`, `boxClassificationSweepActivity` — the interval env and
 * default, the retry policy, and the orchestrator body are byte-identical to the pre-split code so
 * in-flight replay history is unchanged.
 */

import * as df from 'durable-functions';
import { runBoxClassifySweep } from './box-classify-sweep.js';
import {
  ensureMonitor,
  readMonitor,
  type BoxMonitorStatus,
  type MonitorDefinition,
} from '../../platform/durable-monitor.js';

export const BOX_CLASSIFY_MONITOR_INSTANCE_ID = 'box-classification-monitor-singleton';

const classifyMinutes = Number(process.env.BOX_CLASSIFY_MONITOR_INTERVAL_MINUTES ?? '5');
const CLASSIFY_INTERVAL_MS = (
  Number.isFinite(classifyMinutes) && classifyMinutes > 0 ? classifyMinutes : 5
) * 60_000;

const activityRetry = new df.RetryOptions(15_000, 4);
activityRetry.backoffCoefficient = 2;
activityRetry.maxRetryIntervalInMilliseconds = 120_000;

const CLASSIFY_MONITOR: MonitorDefinition = {
  instanceId: BOX_CLASSIFY_MONITOR_INSTANCE_ID,
  orchestratorName: 'boxClassificationMonitorOrchestrator',
  label: 'boxClassificationMonitor',
};

df.app.activity('boxClassificationSweepActivity', {
  handler: async (_input: unknown, ctx): Promise<{ completed: true }> => {
    // runBoxClassifySweep drains status-recompute generations BEFORE its Box/model
    // gates, so committed status work remains recoverable while classification is off.
    await runBoxClassifySweep(ctx);
    return { completed: true };
  },
});

df.app.orchestration('boxClassificationMonitorOrchestrator', function* (ctx) {
  try {
    yield ctx.df.callActivityWithRetry('boxClassificationSweepActivity', activityRetry);
  } catch (error) {
    if (!ctx.df.isReplaying) {
      ctx.log(`[boxClassificationMonitor] sweep failed; rescheduling: ${String(error)}`);
    }
  }
  const next = new Date(ctx.df.currentUtcDateTime.getTime() + CLASSIFY_INTERVAL_MS);
  yield ctx.df.createTimer(next);
  ctx.df.continueAsNew(undefined);
});

export function ensureBoxClassificationMonitor(
  client: df.DurableClient,
  log?: (message: string) => void,
): Promise<BoxMonitorStatus> {
  return ensureMonitor(client, CLASSIFY_MONITOR, log);
}

export function readBoxClassificationMonitor(client: df.DurableClient): Promise<BoxMonitorStatus> {
  return readMonitor(client, CLASSIFY_MONITOR);
}

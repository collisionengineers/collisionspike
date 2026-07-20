/**
 * Wake-safe eternal Durable monitor for the Box File Request outbox, plus the combined maintenance
 * control surface.
 *
 * FC1 may scale the host to zero, so the existing NCRONTAB timers are fallback catch-up paths only.
 * This singleton orchestration schedules Durable timers, whose control-queue messages wake the app
 * for the next pass.
 *
 * TKT-264 split the unrelated Box classification monitor into `box-classification-monitor.ts`. The
 * combined `maintenance/box-monitors` route and the `box-maintenance-monitor-bootstrap` timer stay
 * here and compose BOTH monitors' status (File Request + classification) exactly as before; the
 * shared client-side singleton lifecycle lives in `platform/durable-monitor.ts`.
 */

import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import * as df from 'durable-functions';
import { boxMaintenanceApi } from '../../adapters/box-maintenance-api.js';
import {
  ensureMonitor,
  readMonitor,
  type BoxMonitorStatus,
  type MonitorDefinition,
} from '../../platform/durable-monitor.js';
import {
  BOX_CLASSIFY_MONITOR_INSTANCE_ID,
  ensureBoxClassificationMonitor,
  readBoxClassificationMonitor,
} from './box-classification-monitor.js';

// Re-exported so the classification singleton id and its ensure entrypoint keep the same import
// path after the TKT-264 split (the combined control surface below is their only in-repo consumer).
export {
  BOX_CLASSIFY_MONITOR_INSTANCE_ID,
  ensureBoxClassificationMonitor,
} from './box-classification-monitor.js';
export type { BoxMonitorStatus } from '../../platform/durable-monitor.js';

export const BOX_FILE_REQUEST_MONITOR_INSTANCE_ID =
  'box-file-request-outbox-monitor-singleton';

const fileRequestMinutes = Number(process.env.BOX_FILE_REQUEST_MONITOR_INTERVAL_MINUTES ?? '1');
const FILE_REQUEST_INTERVAL_MS = (
  Number.isFinite(fileRequestMinutes) && fileRequestMinutes > 0 ? fileRequestMinutes : 1
) * 60_000;

const activityRetry = new df.RetryOptions(15_000, 4);
activityRetry.backoffCoefficient = 2;
activityRetry.maxRetryIntervalInMilliseconds = 120_000;

const FILE_REQUEST_MONITOR: MonitorDefinition = {
  instanceId: BOX_FILE_REQUEST_MONITOR_INSTANCE_ID,
  orchestratorName: 'boxFileRequestOutboxMonitorOrchestrator',
  label: 'boxFileRequestMonitor',
};

export function ensureBoxFileRequestMonitor(
  client: df.DurableClient,
  log?: (message: string) => void,
): Promise<BoxMonitorStatus> {
  return ensureMonitor(client, FILE_REQUEST_MONITOR, log);
}

export async function readBoxMaintenanceMonitors(
  client: df.DurableClient,
): Promise<{ fileRequest: BoxMonitorStatus; classification: BoxMonitorStatus }> {
  const [fileRequest, classification] = await Promise.all([
    readMonitor(client, FILE_REQUEST_MONITOR),
    readBoxClassificationMonitor(client),
  ]);
  return { fileRequest, classification };
}

df.app.activity('boxFileRequestOutboxDrainActivity', {
  handler: async (_input: unknown, ctx): Promise<unknown> => {
    const summary = await boxMaintenanceApi.drainFileRequests();
    ctx.log(JSON.stringify({ evt: 'boxFileRequestOutboxDrain', ...summary }));
    return summary;
  },
});

df.app.orchestration('boxFileRequestOutboxMonitorOrchestrator', function* (ctx) {
  try {
    yield ctx.df.callActivityWithRetry('boxFileRequestOutboxDrainActivity', activityRetry);
  } catch (error) {
    if (!ctx.df.isReplaying) {
      ctx.log(`[boxFileRequestMonitor] drain failed; rescheduling: ${String(error)}`);
    }
  }
  const next = new Date(ctx.df.currentUtcDateTime.getTime() + FILE_REQUEST_INTERVAL_MS);
  yield ctx.df.createTimer(next);
  ctx.df.continueAsNew(undefined);
});

async function ensureAll(client: df.DurableClient, ctx: InvocationContext) {
  const settle = async (
    ensure: () => Promise<BoxMonitorStatus>,
    instanceId: string,
  ): Promise<BoxMonitorStatus> => {
    try {
      return await ensure();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.error(`[boxMaintenanceMonitor] ${instanceId}: ${message}`);
      return {
        instanceId,
        runtimeStatus: 'Unknown',
        running: false,
        started: false,
        error: message,
      };
    }
  };
  const [fileRequest, classification] = await Promise.all([
    settle(
      () => ensureBoxFileRequestMonitor(client, (message) => ctx.log(message)),
      BOX_FILE_REQUEST_MONITOR_INSTANCE_ID,
    ),
    settle(
      () => ensureBoxClassificationMonitor(client, (message) => ctx.log(message)),
      BOX_CLASSIFY_MONITOR_INSTANCE_ID,
    ),
  ]);
  return { fileRequest, classification };
}

/** Explicit post-deploy bootstrap (POST) and operational readback (GET). */
app.http('box-maintenance-monitors', {
  methods: ['GET', 'POST'],
  authLevel: 'function',
  route: 'maintenance/box-monitors',
  extraInputs: [df.input.durableClient()],
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const client = df.getClient(ctx);
    try {
      const monitors = req.method.toUpperCase() === 'POST'
        ? await ensureAll(client, ctx)
        : await readBoxMaintenanceMonitors(client);
      const ok = monitors.fileRequest.running && monitors.classification.running;
      return {
        status: ok ? 200 : 503,
        jsonBody: {
          ok,
          action: req.method.toUpperCase() === 'POST' ? 'ensure' : 'read',
          monitors,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.error(`[boxMaintenanceMonitor] readback failed: ${message}`);
      return { status: 503, jsonBody: { ok: false, error: message } };
    }
  },
});

// Host-start/hourly fallback. This is NOT the primary wake path; once started,
// Durable timer messages wake each eternal singleton from FC1 scale-to-zero.
app.timer('box-maintenance-monitor-bootstrap', {
  schedule: '0 0 * * * *',
  runOnStartup: true,
  extraInputs: [df.input.durableClient()],
  handler: async (_timer: unknown, ctx: InvocationContext): Promise<void> => {
    await ensureAll(df.getClient(ctx), ctx);
  },
});

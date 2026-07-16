/**
 * Wake-safe eternal Durable monitors for Box maintenance work.
 *
 * FC1 may scale the host to zero, so the existing NCRONTAB timers are fallback
 * catch-up paths only. These singleton orchestrations schedule Durable timers,
 * whose control-queue messages wake the app for the next pass.
 */

import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import * as df from 'durable-functions';
import { boxMaintenanceApi } from '../../adapters/box-maintenance-api.js';
import { runBoxClassifySweep } from './box-classify-sweep.js';

export const BOX_FILE_REQUEST_MONITOR_INSTANCE_ID =
  'box-file-request-outbox-monitor-singleton';
export const BOX_CLASSIFY_MONITOR_INSTANCE_ID =
  'box-classification-monitor-singleton';

const fileRequestMinutes = Number(process.env.BOX_FILE_REQUEST_MONITOR_INTERVAL_MINUTES ?? '1');
const classifyMinutes = Number(process.env.BOX_CLASSIFY_MONITOR_INTERVAL_MINUTES ?? '5');
const FILE_REQUEST_INTERVAL_MS = (
  Number.isFinite(fileRequestMinutes) && fileRequestMinutes > 0 ? fileRequestMinutes : 1
) * 60_000;
const CLASSIFY_INTERVAL_MS = (
  Number.isFinite(classifyMinutes) && classifyMinutes > 0 ? classifyMinutes : 5
) * 60_000;

const activityRetry = new df.RetryOptions(15_000, 4);
activityRetry.backoffCoefficient = 2;
activityRetry.maxRetryIntervalInMilliseconds = 120_000;

const ALIVE_STATUSES = new Set(['Running', 'Pending', 'ContinuedAsNew']);

interface MonitorDefinition {
  instanceId: string;
  orchestratorName: string;
  label: string;
}

const FILE_REQUEST_MONITOR: MonitorDefinition = {
  instanceId: BOX_FILE_REQUEST_MONITOR_INSTANCE_ID,
  orchestratorName: 'boxFileRequestOutboxMonitorOrchestrator',
  label: 'boxFileRequestMonitor',
};
const CLASSIFY_MONITOR: MonitorDefinition = {
  instanceId: BOX_CLASSIFY_MONITOR_INSTANCE_ID,
  orchestratorName: 'boxClassificationMonitorOrchestrator',
  label: 'boxClassificationMonitor',
};

export interface BoxMonitorStatus {
  instanceId: string;
  runtimeStatus: string;
  running: boolean;
  started?: boolean;
  error?: string;
}

function isAlive(status: unknown): boolean {
  return ALIVE_STATUSES.has(String(status ?? ''));
}

function isNotFound(error: unknown): boolean {
  const rec = error as { statusCode?: unknown; status?: unknown } | null;
  if (rec?.statusCode === 404 || rec?.status === 404) return true;
  return /\b404\b|not found|could not find any data/i.test(
    error instanceof Error ? error.message : String(error ?? ''),
  );
}

async function readMonitor(
  client: df.DurableClient,
  definition: MonitorDefinition,
): Promise<BoxMonitorStatus> {
  try {
    const status = await client.getStatus(definition.instanceId);
    const runtimeStatus = String(status?.runtimeStatus ?? 'Unknown');
    return {
      instanceId: definition.instanceId,
      runtimeStatus,
      running: isAlive(runtimeStatus),
    };
  } catch (error) {
    if (!isNotFound(error)) throw error;
    return {
      instanceId: definition.instanceId,
      runtimeStatus: 'NotFound',
      running: false,
    };
  }
}

async function ensureMonitor(
  client: df.DurableClient,
  definition: MonitorDefinition,
  log?: (message: string) => void,
): Promise<BoxMonitorStatus> {
  const current = await readMonitor(client, definition);
  if (current.running) return { ...current, started: false };
  try {
    await client.startNew(definition.orchestratorName, {
      instanceId: definition.instanceId,
    });
    log?.(`[${definition.label}] started singleton ${definition.instanceId}`);
    return {
      instanceId: definition.instanceId,
      runtimeStatus: 'Pending',
      running: true,
      started: true,
    };
  } catch (error) {
    // Two bootstrap requests may race. A fixed instance id makes the loser safe:
    // if the winner is now alive, report the singleton instead of failing deploy.
    const raced = await readMonitor(client, definition).catch(() => undefined);
    if (raced?.running) return { ...raced, started: false };
    throw error;
  }
}

export function ensureBoxFileRequestMonitor(
  client: df.DurableClient,
  log?: (message: string) => void,
): Promise<BoxMonitorStatus> {
  return ensureMonitor(client, FILE_REQUEST_MONITOR, log);
}

export function ensureBoxClassificationMonitor(
  client: df.DurableClient,
  log?: (message: string) => void,
): Promise<BoxMonitorStatus> {
  return ensureMonitor(client, CLASSIFY_MONITOR, log);
}

export async function readBoxMaintenanceMonitors(
  client: df.DurableClient,
): Promise<{ fileRequest: BoxMonitorStatus; classification: BoxMonitorStatus }> {
  const [fileRequest, classification] = await Promise.all([
    readMonitor(client, FILE_REQUEST_MONITOR),
    readMonitor(client, CLASSIFY_MONITOR),
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

df.app.activity('boxClassificationSweepActivity', {
  handler: async (_input: unknown, ctx): Promise<{ completed: true }> => {
    // runBoxClassifySweep drains status-recompute generations BEFORE its Box/model
    // gates, so committed status work remains recoverable while classification is off.
    await runBoxClassifySweep(ctx);
    return { completed: true };
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

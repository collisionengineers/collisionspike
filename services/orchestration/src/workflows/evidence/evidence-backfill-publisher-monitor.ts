/**
 * Eternal Durable monitor for the API-owned evidence-backfill generation outbox.
 *
 * Accepted case-link suggestions normally publish immediately. If that queue write or
 * process dies between the DB request and its enqueued-generation acknowledgement, this
 * singleton wakes the FC1 orchestration app and asks the API to drain pending generations.
 * The API remains the only owner of DB claiming and Storage Queue publication.
 */

import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import * as df from 'durable-functions';
import { dataApi } from '../../adapters/data-api.js';

export const EVIDENCE_BACKFILL_PUBLISHER_MONITOR_INSTANCE_ID =
  'evidence-backfill-publisher-monitor-singleton';

const INTERVAL_MINUTES = Number(
  process.env.EVIDENCE_BACKFILL_PUBLISHER_MONITOR_INTERVAL_MINUTES ?? '5',
);
const INTERVAL_MS = (
  Number.isFinite(INTERVAL_MINUTES) && INTERVAL_MINUTES > 0 ? INTERVAL_MINUTES : 5
) * 60_000;

const retry = new df.RetryOptions(15_000, 4);
retry.backoffCoefficient = 2;
retry.maxRetryIntervalInMilliseconds = 120_000;

df.app.activity('evidenceBackfillPublisherDrain', {
  handler: async (_input: unknown, ctx): Promise<{ published: number; failed: number }> => {
    const result = await dataApi.drainEvidenceBackfillRequests();
    ctx.log(JSON.stringify({ evt: 'evidenceBackfillPublisherDrain', ...result }));
    return result;
  },
});

df.app.orchestration('evidenceBackfillPublisherMonitorOrchestrator', function* (ctx) {
  try {
    yield ctx.df.callActivityWithRetry('evidenceBackfillPublisherDrain', retry);
  } catch (error) {
    if (!ctx.df.isReplaying) {
      ctx.log(
        `[evidenceBackfillPublisherMonitor] drain failed after retries; rescheduling: ${String(error)}`,
      );
    }
  }

  // Durable timer messages wake a scaled-to-zero Flex app. This is unconditional so an
  // exhausted API/queue outage never terminates the monitor; continueAsNew bounds history.
  const next = new Date(ctx.df.currentUtcDateTime.getTime() + INTERVAL_MS);
  yield ctx.df.createTimer(next);
  ctx.df.continueAsNew(undefined);
});

export async function ensureEvidenceBackfillPublisherMonitor(
  client: df.DurableClient,
  log?: (message: string) => void,
): Promise<{ started: boolean; status?: string }> {
  try {
    const status = await client.getStatus(EVIDENCE_BACKFILL_PUBLISHER_MONITOR_INSTANCE_ID);
    if (status && ['Running', 'Pending', 'ContinuedAsNew'].includes(String(status.runtimeStatus))) {
      return { started: false, status: String(status.runtimeStatus) };
    }
  } catch {
    // First deployment or purged history: start the fixed singleton below.
  }
  try {
    await client.startNew('evidenceBackfillPublisherMonitorOrchestrator', {
      instanceId: EVIDENCE_BACKFILL_PUBLISHER_MONITOR_INSTANCE_ID,
    });
  } catch (error) {
    // Concurrent deployment/bootstrap requests may race on the fixed instance id.
    // If the winner is now alive, the loser reports the singleton instead of failing.
    const raced = await readEvidenceBackfillPublisherMonitor(client).catch(() => undefined);
    if (raced?.running) return { started: false, status: raced.runtimeStatus };
    throw error;
  }
  log?.(
    `[evidenceBackfillPublisherMonitor] started singleton ${EVIDENCE_BACKFILL_PUBLISHER_MONITOR_INSTANCE_ID}`,
  );
  return { started: true };
}

export async function readEvidenceBackfillPublisherMonitor(
  client: df.DurableClient,
): Promise<{ instanceId: string; runtimeStatus: string; running: boolean }> {
  try {
    const status = await client.getStatus(EVIDENCE_BACKFILL_PUBLISHER_MONITOR_INSTANCE_ID);
    const runtimeStatus = String(status?.runtimeStatus ?? 'Unknown');
    return {
      instanceId: EVIDENCE_BACKFILL_PUBLISHER_MONITOR_INSTANCE_ID,
      runtimeStatus,
      running: ['Running', 'Pending', 'ContinuedAsNew'].includes(runtimeStatus),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (!/\b404\b|not found|could not find any data/i.test(detail)) throw error;
    return {
      instanceId: EVIDENCE_BACKFILL_PUBLISHER_MONITOR_INSTANCE_ID,
      runtimeStatus: 'NotFound',
      running: false,
    };
  }
}

/** Explicit post-deploy bootstrap (POST) and singleton readback (GET). */
app.http('evidence-backfill-publisher-monitor', {
  methods: ['GET', 'POST'],
  authLevel: 'function',
  route: 'maintenance/evidence-backfill-publisher-monitor',
  extraInputs: [df.input.durableClient()],
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const client = df.getClient(ctx);
    try {
      if (req.method.toUpperCase() === 'POST') {
        const ensured = await ensureEvidenceBackfillPublisherMonitor(
          client,
          (message) => ctx.log(message),
        );
        if (ensured.started) {
          return {
            status: 200,
            jsonBody: {
              ok: true,
              action: 'ensure',
              monitor: {
                instanceId: EVIDENCE_BACKFILL_PUBLISHER_MONITOR_INSTANCE_ID,
                runtimeStatus: 'Pending',
                running: true,
                started: true,
              },
            },
          };
        }
      }
      const monitor = await readEvidenceBackfillPublisherMonitor(client);
      return {
        status: monitor.running ? 200 : 503,
        jsonBody: {
          ok: monitor.running,
          action: req.method.toUpperCase() === 'POST' ? 'ensure' : 'read',
          monitor,
        },
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      ctx.error(`[evidenceBackfillPublisherMonitor] readback failed: ${detail}`);
      return { status: 503, jsonBody: { ok: false, error: detail } };
    }
  },
});

// Deployment bootstrap starts the singleton when a new host is loaded. Once started, its
// own durable timer is the wake source; the hourly trigger is only an idempotent repair seam.
app.timer('evidence-backfill-publisher-monitor-bootstrap', {
  schedule: '0 0 * * * *',
  runOnStartup: true,
  extraInputs: [df.input.durableClient()],
  handler: async (_timer: unknown, ctx: InvocationContext): Promise<void> => {
    try {
      await ensureEvidenceBackfillPublisherMonitor(
        df.getClient(ctx),
        (message) => ctx.log(message),
      );
    } catch (error) {
      ctx.warn(
        `[evidenceBackfillPublisherMonitor] bootstrap failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  },
});

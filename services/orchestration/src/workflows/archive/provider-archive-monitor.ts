/** Eternal Durable consumer for provider-recovery Archive work. */
import { app, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import {
  providerArchiveApi,
  type PendingProviderArchive,
  type ProviderArchiveCompletion,
} from '../../adapters/provider-archive-api.js';

export const PROVIDER_ARCHIVE_MONITOR_INSTANCE_ID = 'provider-archive-monitor-singleton';

const INTERVAL_MINUTES = Number(process.env.PROVIDER_ARCHIVE_MONITOR_INTERVAL_MINUTES ?? '5');
const INTERVAL_MS = (
  Number.isFinite(INTERVAL_MINUTES) && INTERVAL_MINUTES > 0 ? INTERVAL_MINUTES : 5
) * 60_000;

const retry = new df.RetryOptions(10_000, 4);
retry.backoffCoefficient = 2;
retry.maxRetryIntervalInMilliseconds = 120_000;

df.app.activity('providerArchiveOutboxList', {
  handler: async (): Promise<{ rows: PendingProviderArchive[] }> => providerArchiveApi.pending(250),
});

df.app.activity('providerArchiveOutboxComplete', {
  handler: async (input: { caseId: string; generation: number }) =>
    providerArchiveApi.complete(input.caseId, input.generation),
});

df.app.activity('providerArchiveOutboxDefer', {
  handler: async (input: { caseId: string; generation: number; reason: string }) =>
    providerArchiveApi.defer(input.caseId, input.generation, input.reason),
});

df.app.orchestration('providerArchiveMonitorOrchestrator', function* (ctx) {
  try {
    const listed = (yield ctx.df.callActivityWithRetry(
      'providerArchiveOutboxList',
      retry,
    )) as { rows?: PendingProviderArchive[] };
    const rows = Array.isArray(listed?.rows) ? listed.rows : [];

    for (const row of rows) {
      if (row.archiveRequired) {
        try {
          // This is the existing fail-closed seam: it derives the folder name from
          // Case/PO, asserts the pinned test root before remote access, adopts exact
          // 409 name conflicts, and stamps through the Data API first-wins route.
          yield ctx.df.callSubOrchestratorWithRetry(
            'boxFolderCreateOrchestrator',
            retry,
            { caseId: row.caseId },
          );
        } catch (e) {
          if (!ctx.df.isReplaying) {
            ctx.log(`[providerArchiveMonitor] Archive ensure failed for ${row.caseId}: ${String(e)}`);
          }
          try {
            yield ctx.df.callActivityWithRetry('providerArchiveOutboxDefer', retry, {
              caseId: row.caseId,
              generation: row.generation,
              reason: 'Archive folder ensure failed',
            });
          } catch {
            // The unacknowledged generation remains durable for the next wake.
          }
          continue;
        }
      }

      try {
        // Never trust the orchestration result as completion evidence. The API locks
        // and verifies the exact case has a folder and no provider recovery hold.
        const completed = (yield ctx.df.callActivityWithRetry(
          'providerArchiveOutboxComplete',
          retry,
          { caseId: row.caseId, generation: row.generation },
        )) as ProviderArchiveCompletion;
        if (!completed.completed && completed.pending) {
          yield ctx.df.callActivityWithRetry('providerArchiveOutboxDefer', retry, {
            caseId: row.caseId,
            generation: row.generation,
            reason: 'Archive completion is not yet verified',
          });
        }
      } catch (e) {
        if (!ctx.df.isReplaying) {
          ctx.log(`[providerArchiveMonitor] completion check failed for ${row.caseId}: ${String(e)}`);
        }
        try {
          yield ctx.df.callActivityWithRetry('providerArchiveOutboxDefer', retry, {
            caseId: row.caseId,
            generation: row.generation,
            reason: 'Archive completion verification failed',
          });
        } catch {
          // The unacknowledged generation remains durable for the next wake.
        }
      }
    }
  } catch (e) {
    if (!ctx.df.isReplaying) {
      ctx.log(`[providerArchiveMonitor] outbox list failed; rescheduling: ${String(e)}`);
    }
  }

  const next = new Date(ctx.df.currentUtcDateTime.getTime() + INTERVAL_MS);
  yield ctx.df.createTimer(next);
  ctx.df.continueAsNew(undefined);
});

export async function ensureProviderArchiveMonitor(
  client: df.DurableClient,
  log?: (message: string) => void,
): Promise<{ started: boolean; status?: string }> {
  try {
    const status = await client.getStatus(PROVIDER_ARCHIVE_MONITOR_INSTANCE_ID);
    if (status && ['Running', 'Pending', 'ContinuedAsNew'].includes(String(status.runtimeStatus))) {
      return { started: false, status: String(status.runtimeStatus) };
    }
  } catch {
    // First deployment or purged history: start below.
  }
  await client.startNew('providerArchiveMonitorOrchestrator', {
    instanceId: PROVIDER_ARCHIVE_MONITOR_INSTANCE_ID,
  });
  log?.(`[providerArchiveMonitor] started singleton ${PROVIDER_ARCHIVE_MONITOR_INSTANCE_ID}`);
  return { started: true };
}

app.timer('provider-archive-monitor-bootstrap', {
  schedule: '0 0 * * * *',
  runOnStartup: true,
  extraInputs: [df.input.durableClient()],
  handler: async (_timer: unknown, ctx: InvocationContext): Promise<void> => {
    try {
      await ensureProviderArchiveMonitor(df.getClient(ctx), (message) => ctx.log(message));
    } catch (e) {
      ctx.warn(
        `[providerArchiveMonitor] bootstrap failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },
});

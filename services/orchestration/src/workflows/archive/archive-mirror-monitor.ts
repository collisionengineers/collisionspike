/**
 * Eternal Durable monitor for staff-requested archive mirroring.
 *
 * The DB outbox is the durable source of truth; no manually provisioned queue is
 * required. Work is grouped by case so one idempotent Box pass handles all pending
 * evidence for that case. A generation is acknowledged only through the Data API's
 * row-specific verifier after a complete pass. Gate/folder/partial/stamp failures stay
 * pending for the next durable wake.
 */

import { app, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import {
  archiveMirrorApi,
  type PendingArchiveMirror,
} from '../../adapters/archive-mirror-api.js';
import { isAlive } from '../../platform/durable-monitor.js';

export const ARCHIVE_MIRROR_MONITOR_INSTANCE_ID = 'archive-mirror-monitor-singleton';

const INTERVAL_MINUTES = Number(process.env.ARCHIVE_MIRROR_MONITOR_INTERVAL_MINUTES ?? '10');
const INTERVAL_MS = (
  Number.isFinite(INTERVAL_MINUTES) && INTERVAL_MINUTES > 0 ? INTERVAL_MINUTES : 10
) * 60_000;

const retry = new df.RetryOptions(15_000, 4);
retry.backoffCoefficient = 2;
retry.maxRetryIntervalInMilliseconds = 120_000;

interface BoxArchiveResult {
  uploaded: number;
  total: number;
  skipped?: string;
}

export function groupPendingArchiveMirrors(
  rows: PendingArchiveMirror[],
): Map<string, PendingArchiveMirror[]> {
  const grouped = new Map<string, PendingArchiveMirror[]>();
  for (const row of rows) {
    const group = grouped.get(row.caseId);
    if (group) group.push(row);
    else grouped.set(row.caseId, [row]);
  }
  return grouped;
}

export function canVerifyArchivePass(result: BoxArchiveResult): boolean {
  return !result.skipped && result.uploaded === result.total;
}

df.app.activity('archiveMirrorOutboxList', {
  handler: async (): Promise<{ rows: PendingArchiveMirror[] }> => archiveMirrorApi.pending(250),
});

df.app.activity('archiveMirrorOutboxComplete', {
  handler: async (input: { evidenceId: string; generation: number }) =>
    archiveMirrorApi.complete(input.evidenceId, input.generation),
});

df.app.activity('archiveMirrorOutboxDefer', {
  handler: async (input: { evidenceId: string; generation: number; reason: string }) =>
    archiveMirrorApi.defer(input.evidenceId, input.generation, input.reason),
});

df.app.orchestration('archiveMirrorMonitorOrchestrator', function* (ctx) {
  try {
    const listed = (yield ctx.df.callActivityWithRetry(
      'archiveMirrorOutboxList',
      retry,
    )) as { rows?: PendingArchiveMirror[] };
    const rows = Array.isArray(listed?.rows) ? listed.rows : [];

    // Rows already archived (or no longer eligible after a race) need no Box pass,
    // but still go through the same exact-row verifier before acknowledgement.
    for (const row of rows.filter((candidate) => !candidate.mirrorEligible)) {
      try {
        yield ctx.df.callActivityWithRetry('archiveMirrorOutboxComplete', retry, {
          evidenceId: row.evidenceId,
          generation: row.generation,
        });
      } catch (e) {
        if (!ctx.df.isReplaying) {
          ctx.log(`[archiveMirrorMonitor] completion failed for ${row.evidenceId}: ${String(e)}`);
        }
        try {
          yield ctx.df.callActivityWithRetry('archiveMirrorOutboxDefer', retry, {
            evidenceId: row.evidenceId,
            generation: row.generation,
            reason: 'completion verification failed',
          });
        } catch {
          // The next durable wake retries if both completion and defer are unavailable.
        }
      }
    }

    const eligible = rows.filter((row) => row.mirrorEligible);
    for (const [caseId, pendingRows] of groupPendingArchiveMirrors(eligible)) {
      let result: BoxArchiveResult;
      try {
        result = (yield ctx.df.callActivityWithRetry('boxArchiveEvidence', retry, {
          caseId,
        })) as BoxArchiveResult;
      } catch (e) {
        if (!ctx.df.isReplaying) {
          ctx.log(`[archiveMirrorMonitor] archive pass failed for ${caseId}: ${String(e)}`);
        }
        for (const row of pendingRows) {
          try {
            yield ctx.df.callActivityWithRetry('archiveMirrorOutboxDefer', retry, {
              evidenceId: row.evidenceId,
              generation: row.generation,
              reason: 'archive activity failed',
            });
          } catch (deferError) {
            if (!ctx.df.isReplaying) {
              ctx.log(`[archiveMirrorMonitor] defer failed for ${row.evidenceId}: ${String(deferError)}`);
            }
          }
        }
        continue;
      }
      // A partial or skipped pass is never enough to acknowledge anything. On a
      // complete pass (including 0/0 after a race), the API still verifies EACH row's
      // box_file_id/no-longer-eligible state before advancing its exact generation.
      if (!canVerifyArchivePass(result)) {
        for (const row of pendingRows) {
          try {
            yield ctx.df.callActivityWithRetry('archiveMirrorOutboxDefer', retry, {
              evidenceId: row.evidenceId,
              generation: row.generation,
              reason: result.skipped ?? 'archive pass incomplete',
            });
          } catch (deferError) {
            if (!ctx.df.isReplaying) {
              ctx.log(`[archiveMirrorMonitor] defer failed for ${row.evidenceId}: ${String(deferError)}`);
            }
          }
        }
        continue;
      }
      for (const row of pendingRows) {
        try {
          yield ctx.df.callActivityWithRetry('archiveMirrorOutboxComplete', retry, {
            evidenceId: row.evidenceId,
            generation: row.generation,
          });
        } catch (e) {
          if (!ctx.df.isReplaying) {
            ctx.log(`[archiveMirrorMonitor] completion failed for ${row.evidenceId}: ${String(e)}`);
          }
          try {
            yield ctx.df.callActivityWithRetry('archiveMirrorOutboxDefer', retry, {
              evidenceId: row.evidenceId,
              generation: row.generation,
              reason: 'completion verification failed',
            });
          } catch {
            // The next durable wake retries if both completion and defer are unavailable.
          }
        }
      }
    }
  } catch (e) {
    if (!ctx.df.isReplaying) {
      ctx.log(`[archiveMirrorMonitor] outbox list failed; rescheduling: ${String(e)}`);
    }
  }

  // Always reschedule, including after exhausted retries. Durable timer messages wake
  // the scale-to-zero app; continueAsNew keeps this singleton's history bounded.
  const next = new Date(ctx.df.currentUtcDateTime.getTime() + INTERVAL_MS);
  yield ctx.df.createTimer(next);
  ctx.df.continueAsNew(undefined);
});

export async function ensureArchiveMirrorMonitor(
  client: df.DurableClient,
  log?: (message: string) => void,
): Promise<{ started: boolean; status?: string }> {
  try {
    const status = await client.getStatus(ARCHIVE_MIRROR_MONITOR_INSTANCE_ID);
    if (status && isAlive(status.runtimeStatus)) {
      return { started: false, status: String(status.runtimeStatus) };
    }
  } catch {
    // First deployment / purged history: start below.
  }
  await client.startNew('archiveMirrorMonitorOrchestrator', {
    instanceId: ARCHIVE_MIRROR_MONITOR_INSTANCE_ID,
  });
  log?.(`[archiveMirrorMonitor] started singleton ${ARCHIVE_MIRROR_MONITOR_INSTANCE_ID}`);
  return { started: true };
}

// Deployment bootstrap. runOnStartup starts the durable singleton when a new host loads;
// intake-starter also re-ensures it, so a transient bootstrap failure self-heals on traffic.
app.timer('archive-mirror-monitor-bootstrap', {
  schedule: '0 0 * * * *',
  runOnStartup: true,
  extraInputs: [df.input.durableClient()],
  handler: async (_timer: unknown, ctx: InvocationContext): Promise<void> => {
    try {
      await ensureArchiveMirrorMonitor(df.getClient(ctx), (message) => ctx.log(message));
    } catch (e) {
      ctx.warn(
        `[archiveMirrorMonitor] bootstrap failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },
});

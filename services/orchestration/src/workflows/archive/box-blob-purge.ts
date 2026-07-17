/** *
 * Gated TIMER orchestration (plan 22 §C): the daily evidence-blob purge after the one-way
 * Archive mirror has confirmed the bytes (PostgreSQL stays authoritative; the local
 * evidence blob is the transient landing zone). Flow today: `Recurrence` (Day) → Durable
 * **timer**-triggered starter that kicks a short orchestration.
 *
 * Gate: BOX_API_ENABLED (off by default) — read FIRST in the timer; no-op when off.
 */

import { app, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import type { Task } from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { dataApi } from '../../adapters/data-api.js';
import { deleteEvidenceBytes } from '../../platform/blob.js';

/* ---- timer starter (Recurrence Day analogue: daily 03:00) ---- */
app.timer('box-blob-purge-timer', {
  schedule: '0 0 3 * * *',
  extraInputs: [df.input.durableClient()],
  handler: async (_t: unknown, ctx: InvocationContext): Promise<void> => {
    if (!gates.boxApi()) {
      ctx.log('[box-blob-purge] skipped — BOX_API_ENABLED=false');
      return;
    }
    const client = df.getClient(ctx);
    await client.startNew('boxBlobPurgeOrchestrator', {});
    ctx.log('[box-blob-purge] started orchestration');
  },
});

const retry = new df.RetryOptions(5_000, 3);
retry.backoffCoefficient = 2;

/**
 * Sequential ON PURPOSE (TKT-227, the retro-related-ingest precedent): the old unbounded
 * `Task.all` fan-out ran EVERY candidate's `boxPurgeOne` concurrently; each item's
 * markBlobPurged opens a data-api transaction (FOR UPDATE case lock), so ~440 candidates
 * exhausted the dev-tier Postgres `max_connections` at 03:00Z and the whole run failed with
 * "remaining connection slots are reserved". The loop bounds DB pressure to one in-flight
 * activity, and the per-item try/catch salvages the run — one bad item never sinks the
 * batch. At the LIMIT-1000 candidate ceiling a sequential nightly run is a few minutes.
 * Return shape is honest: `purged` counts successes (the old `results.length` counted
 * attempts), `failed` counts salvaged items, `total` the candidate list.
 */
df.app.orchestration('boxBlobPurgeOrchestrator', function* (ctx): Generator<Task, unknown, never> {
  const candidates = (yield ctx.df.callActivityWithRetry('boxPurgeList', retry, {})) as Array<{
    caseId: string; blobPath: string;
  }>;
  let purged = 0;
  let failed = 0;
  for (const c of candidates) {
    try {
      yield ctx.df.callActivityWithRetry('boxPurgeOne', retry, c);
      purged++;
    } catch (e) {
      failed++;
      if (!ctx.df.isReplaying) ctx.log(`[box-blob-purge] item failed (salvaged): ${String(e)}`);
    }
  }
  return { purged, failed, total: candidates.length };
});

df.app.activity('boxPurgeList', {
  handler: async (): Promise<Array<{ caseId: string; blobPath: string }>> => {
    if (!gates.boxApi()) return [];
    return dataApi.blobsForPurge();
  },
});

df.app.activity('boxPurgeOne', {
  handler: async (input: { caseId: string; blobPath: string }, ctx): Promise<{ purged: boolean }> => {
    if (!gates.boxApi()) return { purged: false };
    const purged = await deleteEvidenceBytes(input.blobPath);
    await dataApi.markBlobPurged({ caseId: input.caseId, blobPath: input.blobPath });
    ctx.log(JSON.stringify({ evt: 'boxPurgeOne', caseId: input.caseId, blobPath: input.blobPath, purged }));
    return { purged };
  },
});

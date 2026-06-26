/**
 * orchestration/src/functions/gated/box-blob-purge.ts
 *
 * Gated TIMER orchestration (plan 22 §C): the daily evidence-blob purge after the one-way
 * Box mirror has confirmed the bytes (Dataverse/Postgres stays authoritative; the local
 * evidence blob is the transient landing zone). Flow today: `Recurrence` (Day) → Durable
 * **timer**-triggered starter that kicks a short orchestration.
 *
 * Gate: BOX_API_ENABLED (off by default) — read FIRST in the timer; no-op when off.
 */

import { app, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { dataApi } from '../../lib/data-api.js';
import { deleteEvidenceBytes } from '../../lib/blob.js';

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

df.app.orchestration('boxBlobPurgeOrchestrator', function* (ctx) {
  const candidates = (yield ctx.df.callActivityWithRetry('boxPurgeList', retry, {})) as Array<{ caseId: string; blobPath: string }>;
  const tasks = candidates.map((c) => ctx.df.callActivityWithRetry('boxPurgeOne', retry, c));
  const results = yield ctx.df.Task.all(tasks);
  return { purged: (results as unknown[]).length };
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

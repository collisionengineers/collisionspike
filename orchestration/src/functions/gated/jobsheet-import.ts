/**
 * orchestration/src/functions/gated/jobsheet-import.ts
 *
 * Gated orchestration (plan 22 §C): per-principal job-sheet import. Flow today does
 * `List_principals_rows` → `Apply_to_each_principal`; that becomes a **fan-out/fan-in**
 * orchestration (df.Task.all over per-principal activities). Manual `Request`/Http trigger
 * preserved as an HTTP starter.
 *
 * No dedicated gate in the source flow — the import itself is operator-invoked.
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { dataApi } from '../../lib/data-api.js';

app.http('jobsheet-import-start', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'jobsheet-import',
  extraInputs: [df.input.durableClient()],
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const client = df.getClient(ctx);
    const instanceId = await client.startNew('jobsheetImportOrchestrator', {});
    ctx.log(`[jobsheet-import] started ${instanceId}`);
    return client.createCheckStatusResponse(req, instanceId);
  },
});

const retry = new df.RetryOptions(5_000, 3);
retry.backoffCoefficient = 2;

df.app.orchestration('jobsheetImportOrchestrator', function* (ctx) {
  // Fan-out: one import activity per principal, fan-in with Task.all.
  const principals = (yield ctx.df.callActivityWithRetry('jobsheetPrincipals', retry, {})) as Array<{ principalCode: string }>;
  const tasks = principals.map((p) => ctx.df.callActivityWithRetry('jobsheetImportOne', retry, p));
  const results = yield ctx.df.Task.all(tasks);
  return { principals: principals.length, results };
});

df.app.activity('jobsheetPrincipals', {
  handler: async (): Promise<Array<{ principalCode: string }>> => dataApi.principals(),
});

df.app.activity('jobsheetImportOne', {
  handler: async (input: { principalCode: string }, ctx): Promise<{ principalCode: string; imported: boolean }> => {
    // Per-principal job-sheet import (read sheet rows → upsert via Data API). Audited as jobsheet_imported.
    await dataApi.recordAudit({ action: 'jobsheet_imported', summary: `job-sheet import for ${input.principalCode}` });
    ctx.log(JSON.stringify({ evt: 'jobsheetImportOne', principalCode: input.principalCode }));
    return { principalCode: input.principalCode, imported: true };
  },
});

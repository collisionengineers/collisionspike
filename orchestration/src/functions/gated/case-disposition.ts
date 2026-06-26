/**
 * orchestration/src/functions/gated/case-disposition.ts
 *
 * Gated TIMER orchestration (plan 22 §C): the retention/erasure job (ADR-0017). Flow today:
 * `Recurrence` (Day) → Durable **timer**-triggered starter that kicks a short orchestration.
 *
 * Gate: CASE_DISPOSITION_ENABLED (the destructive kill switch, off by default) — read FIRST
 * in the timer; no-op when off. The actual delete runs under the Data API's job DB identity
 * (the app roles never delete a Case — plan 10 §5.2 invariant 3), invoked here per-case.
 */

import { app, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { dataApi } from '../../lib/data-api.js';

app.timer('case-disposition-timer', {
  schedule: '0 0 2 * * *',
  extraInputs: [df.input.durableClient()],
  handler: async (_t: unknown, ctx: InvocationContext): Promise<void> => {
    if (!gates.caseDisposition()) {
      ctx.log('[case-disposition] skipped — CASE_DISPOSITION_ENABLED=false');
      return;
    }
    const client = df.getClient(ctx);
    await client.startNew('caseDispositionOrchestrator', {});
    ctx.log('[case-disposition] started orchestration');
  },
});

const retry = new df.RetryOptions(5_000, 3);
retry.backoffCoefficient = 2;

df.app.orchestration('caseDispositionOrchestrator', function* (ctx) {
  const due = (yield ctx.df.callActivityWithRetry('dispositionList', retry, {})) as Array<{ caseId: string }>;
  const tasks = due.map((c) => ctx.df.callActivityWithRetry('dispositionOne', retry, c));
  const results = yield ctx.df.Task.all(tasks);
  return { disposed: (results as unknown[]).length };
});

df.app.activity('dispositionList', {
  handler: async (): Promise<Array<{ caseId: string }>> => {
    if (!gates.caseDisposition()) return [];
    return dataApi.casesForDisposition();
  },
});

df.app.activity('dispositionOne', {
  handler: async (input: { caseId: string }, ctx): Promise<{ disposed: boolean }> => {
    if (!gates.caseDisposition()) return { disposed: false };
    await dataApi.disposeCase(input.caseId);
    await dataApi.recordAudit({ action: 'case_disposed', caseId: input.caseId, summary: 'retention disposition', severity: 'warning' });
    ctx.log(JSON.stringify({ evt: 'dispositionOne', caseId: input.caseId }));
    return { disposed: true };
  },
});

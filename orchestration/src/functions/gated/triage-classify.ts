/**
 * orchestration/src/functions/gated/triage-classify.ts
 *
 * Gated orchestration (plan 22 §C): classify an inbound email (category/subtype) via the
 * parser's `ClassifyEmail` op. Gated by EMAIL_AI_ENABLED (the triage-llm child, ADR-0015).
 * Default off → the activity no-ops.
 *
 * Trigger today: manual → preserved as an HTTP starter.
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { callClassifyEmail } from '../../lib/functions-client.js';
import { dataApi } from '../../lib/data-api.js';

interface TriageInput {
  inboundEmailId: string;
  subject?: string;
  body?: string;
  senderAddress?: string;
}

app.http('triage-classify-start', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'triage-classify',
  extraInputs: [df.input.durableClient()],
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const input = (await req.json()) as TriageInput;
    const client = df.getClient(ctx);
    const instanceId = await client.startNew('triageClassifyOrchestrator', { input });
    return client.createCheckStatusResponse(req, instanceId);
  },
});

const retry = new df.RetryOptions(5_000, 3);
retry.backoffCoefficient = 2;

df.app.orchestration('triageClassifyOrchestrator', function* (ctx) {
  const input = ctx.df.getInput() as TriageInput;
  const result = yield ctx.df.callActivityWithRetry('triageClassify', retry, input);
  return result;
});

df.app.activity('triageClassify', {
  handler: async (input: TriageInput, ctx): Promise<{ skipped?: boolean; category?: string; subtype?: string }> => {
    if (!gates.emailAi()) {
      ctx.log('[triageClassify] skipped — EMAIL_AI_ENABLED=false');
      return { skipped: true };
    }
    const res = await callClassifyEmail({
      subject: input.subject,
      body: input.body,
      from: input.senderAddress,
    });
    await dataApi.recordAudit({ action: 'inbound_classified', summary: `triage ${res.category}/${res.subtype}` });
    ctx.log(JSON.stringify({ evt: 'triageClassify', inboundEmailId: input.inboundEmailId, category: res.category, subtype: res.subtype }));
    return res;
  },
});

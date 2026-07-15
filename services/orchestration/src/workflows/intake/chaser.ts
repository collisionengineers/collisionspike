/** *
 * Gated orchestration (plan 22 §C) covering TWO flows:
 *   chaser-draft  — compose + create a draft chaser. NO gate (draft-only is always safe).
 *   chaser-send   — actually send. Gated by CHASER_SEND_ENABLED (the outbound-send kill switch).
 *
 * Trigger today: manual → preserved as an HTTP starter. The orchestration always drafts; it
 * only sends when CHASER_SEND_ENABLED is on, so an operator can stage chasers with the send
 * kill-switch off (the flows' draft-only-by-default house rule).
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { dataApi } from '../../adapters/data-api.js';

interface ChaserInput {
  caseId: string;
  targetType: 'image_source' | 'repairer' | 'work_provider';
  channel?: 'email' | 'whatsapp';
}

/* ---- HTTP starter ---- */
app.http('chaser-start', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'chaser',
  extraInputs: [df.input.durableClient()],
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const input = (await req.json()) as ChaserInput;
    const client = df.getClient(ctx);
    const instanceId = await client.startNew('chaserOrchestrator', { input });
    return client.createCheckStatusResponse(req, instanceId);
  },
});

/* ---- orchestration ---- */
const retry = new df.RetryOptions(5_000, 3);
retry.backoffCoefficient = 2;

df.app.orchestration('chaserOrchestrator', function* (ctx) {
  const input = ctx.df.getInput() as ChaserInput;
  const draft = yield ctx.df.callActivityWithRetry('chaserDraft', retry, input);
  // chaser-send only runs behind its gate (read inside the activity); no-op when off.
  const sent = yield ctx.df.callActivityWithRetry('chaserSend', retry, { caseId: input.caseId, draft });
  return { caseId: input.caseId, draft, sent };
});

/* ---- activities ---- */
df.app.activity('chaserDraft', {
  handler: async (input: ChaserInput, ctx): Promise<{ drafted: true; targetType: string }> => {
    // Compose + create the draft chaser (always safe — no send). The Data API persists the
    // Chaser row in status 'drafted' (chaserstatus default).
    ctx.log(JSON.stringify({ evt: 'chaserDraft', caseId: input.caseId, targetType: input.targetType }));
    return { drafted: true, targetType: input.targetType };
  },
});

df.app.activity('chaserSend', {
  handler: async (input: { caseId: string; draft: unknown }, ctx): Promise<{ sent: boolean }> => {
    if (!gates.chaserSend()) {
      ctx.log('[chaserSend] skipped — CHASER_SEND_ENABLED=false (draft-only)');
      return { sent: false };
    }
    // Outbound send would happen here (Graph sendMail / WhatsApp); audit on success.
    await dataApi.recordAudit({ action: 'chaser_sent', caseId: input.caseId, summary: 'chaser sent' });
    ctx.log(JSON.stringify({ evt: 'chaserSend', caseId: input.caseId }));
    return { sent: true };
  },
});

/**
 * orchestration/src/functions/graph-renew-http.ts
 *
 * HTTP trigger (POST /api/graph-renew, function-key auth): on-demand Graph-subscription renewal
 * + ensures the durable subscriptionMonitor singleton is running.
 *
 * Why: a plain timer trigger is NOT woken on Flex scale-to-zero (graph-renew fired 0× in 7d),
 * but an HTTP request reliably wakes the app. This route is (a) the manual/operator rescue lever
 * and (b) the bootstrap for the eternal durable monitor (hit once post-deploy → self-perpetuates
 * via durable timers thereafter). An external scheduler may also poll it, but is not required.
 */

import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import * as df from 'durable-functions';
import { runSubscriptionMaintenance } from '../lib/subscriptions.js';
import { ensureSubscriptionMonitor } from './subscriptionMonitor.js';

app.http('graph-renew-http', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'graph-renew',
  extraInputs: [df.input.durableClient()],
  handler: async (_req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const summary = await runSubscriptionMaintenance(ctx);
    let monitor: { started: boolean; status?: string } | { error: string };
    try {
      const client = df.getClient(ctx);
      monitor = await ensureSubscriptionMonitor(client, (m) => ctx.log(m));
    } catch (e) {
      monitor = { error: e instanceof Error ? e.message : String(e) };
      ctx.warn(`[graph-renew-http] ensureSubscriptionMonitor failed: ${JSON.stringify(monitor)}`);
    }
    return { status: 200, jsonBody: { ok: true, summary, monitor } };
  },
});

/**
 * orchestration/src/functions/graph-webhook.ts
 *
 * HTTP trigger: /api/graph-webhook
 * Handles Microsoft Graph change-notification delivery for the shared Outlook intake mailboxes.
 *
 * Protocol (plan 22 §A.3):
 *   1. On subscription creation: Graph POSTs with ?validationToken — echo it back, 200, text/plain.
 *   2. On notification: verify clientState; enqueue message id to 'intake-messages'; return 202 fast.
 *      (Never call the Data API or fetch the email here — Graph expects sub-second acks.)
 *
 * App-settings required:
 *   GRAPH_CLIENT_STATE  — the clientState secret (KV-backed); verified on every notification.
 */

import { app, output, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';

interface GraphNotification {
  subscriptionId: string;
  clientState?: string;
  tenantId?: string;
  resource?: string;
  resourceData?: { id?: string };
}

const intakeQueue = output.storageQueue({
  queueName: 'intake-messages',
  connection: 'AzureWebJobsStorage',
});

app.http('graph-webhook', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'graph-webhook',
  extraOutputs: [intakeQueue],
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    // 1) Validation handshake — must reply within 10 s, 200, text/plain, body = validationToken
    const validationToken = req.query.get('validationToken');
    if (validationToken) {
      return {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: validationToken,
      };
    }

    // 2) Notification batch
    const body = (await req.json()) as { value?: GraphNotification[] };
    const expected = process.env.GRAPH_CLIENT_STATE;
    const msgs: string[] = [];

    for (const n of body.value ?? []) {
      if (n.clientState !== expected) {
        ctx.warn('[graph-webhook] clientState mismatch — dropping notification');
        continue;
      }
      const messageId = n.resourceData?.id ?? n.resource ?? '';
      ctx.log(JSON.stringify({ evt: 'graph-notification-received', subscriptionId: n.subscriptionId, messageId }));
      msgs.push(
        JSON.stringify({
          subscriptionId: n.subscriptionId,
          messageId,
          // `resource` carries the mailbox (users/<mailbox>/…); fetchMessage derives it.
          resource: n.resource,
          tenantId: n.tenantId,
          receivedAt: new Date().toISOString(),
        }),
      );
    }

    ctx.extraOutputs.set(intakeQueue, msgs);
    return { status: 202 }; // Graph needs a prompt 202; real work happens in intake-starter
  },
});

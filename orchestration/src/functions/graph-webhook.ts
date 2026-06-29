/**
 * orchestration/src/functions/graph-webhook.ts
 *
 * HTTP trigger: /api/graph-webhook
 * Handles Microsoft Graph change-notification delivery for the shared Outlook intake mailboxes.
 *
 * Protocol (plan 22 §A.3):
 *   1. On subscription creation: Graph POSTs with ?validationToken — echo it back, 200, text/plain.
 *   2. On notification: verify clientState; enqueue message id to 'intake-messages'; return 202 fast.
 *      (Never call the Data API or fetch the email here — Graph expects a sub-3s ack.)
 *
 * COLD-START HARDENING: on Flex scale-to-zero the worker can take seconds to start; Graph aborts
 * at its ~3 s SLA and closes the socket (499), which truncated the request stream and surfaced as
 * unhandled `BadHttpRequestException: Unexpected end of request content`. The body is now read
 * defensively (req.text → JSON.parse, both guarded) so a truncated/aborted request never throws —
 * we just ack (Graph redelivers; the deterministic intake instanceId dedups the replay). The only
 * real cure for the 3 s p95 under cold start is an always-ready HTTP instance (cost — flagged to
 * the operator, NOT enabled here).
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
    // 1) Validation handshake — reply within 10 s, 200, text/plain, body = validationToken.
    const validationToken = req.query.get('validationToken');
    if (validationToken) {
      return {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: validationToken,
      };
    }

    // 2) Notification batch — read the body DEFENSIVELY. Under cold start Graph may abort at its
    //    3 s SLA, truncating the stream; never let that surface as an unhandled exception.
    let raw = '';
    try {
      raw = await req.text();
    } catch (e) {
      ctx.warn(`[graph-webhook] request body read aborted (cold-start/timeout): ${e instanceof Error ? e.message : String(e)}`);
      return { status: 202 }; // moot if Graph already closed; Graph will redeliver
    }

    let body: { value?: GraphNotification[] };
    try {
      body = raw ? (JSON.parse(raw) as { value?: GraphNotification[] }) : {};
    } catch {
      ctx.warn('[graph-webhook] unparseable notification body — acking');
      return { status: 202 };
    }

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
    return { status: 202 }; // prompt ack; real work happens in intake-starter
  },
});

/** *
 * HTTP triggers: /api/graph-webhook-sent + /api/graph-lifecycle-sent
 *
 * The SEPARATE notification surface for the gated `users/{mailbox}/mailFolders('SentItems')/
 * messages` Graph subscriptions (DONE_SENT_EMAIL_ENABLED — created/pruned ONLY by
 * runSubscriptionMaintenance on a gate flip; deploying this file creates NOTHING).
 * Separate on purpose: a change notification's `resource` is canonicalised to
 * `Users/<GUID>/Messages/<id>` with NO folder, so the only structural way to keep a
 * sent-message notification out of the intake pipeline is a distinct notificationUrl.
 * A SentItems notification therefore can never reach graph-webhook / 'intake-messages'.
 *
 * Protocol mirrors graph-webhook.ts: validation-handshake echo; defensive body read
 * (cold-start truncation → 503 so Graph redelivers); clientState verify; enqueue to
 * 'sent-messages' (drained by sent-items-processor.ts) and ack 202 fast.
 *
 * GATE-OFF behaviour: notifications are dropped with a trace and a 202 (Graph must NOT
 * redeliver something we intend to drop). With the gate off no SentItems subscription
 * exists anyway — this is belt-and-braces for the flip-off window while maintenance
 * prunes.
 *
 * /api/graph-lifecycle-sent is deliberately MINIMAL (unlike graph-lifecycle.ts, whose
 * subscriptionRemoved arm recreates INBOX subscriptions + resyncs the intake queue):
 *   reauthorizationRequired → PATCH-renew;
 *   subscriptionRemoved / missed → log only. Recreation is left to the next
 *   runSubscriptionMaintenance tick (folder-aware), and a missed sent-message needs no
 *   resync — the detector is suggestion-grade (the manual bridge + Box detector cover a
 *   missed flip); a backfill sweep is documented, not built.
 */

import { app, output, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { gates } from '@cs/domain/gates';
import { renewSubscription } from '../../platform/subscriptions.js';

interface GraphNotification {
  subscriptionId: string;
  clientState?: string;
  tenantId?: string;
  resource?: string;
  resourceData?: { id?: string };
}

const sentQueue = output.storageQueue({
  queueName: 'sent-messages',
  connection: 'AzureWebJobsStorage',
});

app.http('graph-webhook-sent', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'graph-webhook-sent',
  extraOutputs: [sentQueue],
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    // 1) Validation handshake — reply within 10 s, 200, text/plain, body = validationToken.
    //    (Fires only when maintenance CREATES a SentItems subscription — i.e. gate ON.)
    const validationToken = req.query.get('validationToken');
    if (validationToken) {
      return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: validationToken };
    }

    // 2) Notification batch — defensive body read (graph-webhook.ts cold-start doctrine).
    let raw = '';
    try {
      raw = await req.text();
    } catch (e) {
      ctx.warn(`[graph-webhook-sent] request body read aborted (cold-start/timeout): ${e instanceof Error ? e.message : String(e)}`);
      return { status: 503 }; // not processed → Graph redelivers
    }
    let body: { value?: GraphNotification[] };
    try {
      body = raw ? (JSON.parse(raw) as { value?: GraphNotification[] }) : {};
    } catch {
      ctx.warn('[graph-webhook-sent] unparseable notification body — 5xx so Graph redelivers');
      return { status: 503 };
    }

    // Gate check AFTER the parse, BEFORE any enqueue: while OFF everything is dropped
    // with a trace + 202 (deliberate drop — never a redelivery loop for a dark feature).
    if (!gates.doneSentEmail()) {
      ctx.log(`[graph-webhook-sent] DONE_SENT_EMAIL_ENABLED off — dropped ${body.value?.length ?? 0} notification(s)`);
      return { status: 202 };
    }

    const expected = process.env.GRAPH_CLIENT_STATE;
    const msgs: string[] = [];
    for (const n of body.value ?? []) {
      if (n.clientState !== expected) {
        ctx.warn('[graph-webhook-sent] clientState mismatch — dropping notification');
        continue;
      }
      const messageId = n.resourceData?.id ?? n.resource ?? '';
      ctx.log(JSON.stringify({ evt: 'graph-sent-notification-received', subscriptionId: n.subscriptionId, messageId }));
      msgs.push(
        JSON.stringify({
          subscriptionId: n.subscriptionId,
          messageId,
          resource: n.resource,
          tenantId: n.tenantId,
          receivedAt: new Date().toISOString(),
        }),
      );
    }
    ctx.extraOutputs.set(sentQueue, msgs);
    return { status: 202 }; // prompt ack; real work happens in sent-items-processor
  },
});

interface LifecycleNotification {
  lifecycleEvent?: 'reauthorizationRequired' | 'subscriptionRemoved' | 'missed';
  subscriptionId?: string;
  resource?: string;
  clientState?: string;
}

app.http('graph-lifecycle-sent', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'graph-lifecycle-sent',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const validationToken = req.query.get('validationToken');
    if (validationToken) {
      return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: validationToken };
    }
    const body = (await req.json().catch(() => ({}))) as { value?: LifecycleNotification[] };
    const expected = process.env.GRAPH_CLIENT_STATE;
    for (const n of body.value ?? []) {
      if (n.clientState !== expected) {
        ctx.warn('[graph-lifecycle-sent] clientState mismatch — dropping');
        continue;
      }
      ctx.log(JSON.stringify({ evt: 'graph-lifecycle-sent', lifecycleEvent: n.lifecycleEvent, subscriptionId: n.subscriptionId }));
      try {
        if (n.lifecycleEvent === 'reauthorizationRequired' && n.subscriptionId && gates.doneSentEmail()) {
          await renewSubscription(n.subscriptionId);
        }
        // subscriptionRemoved / missed → log only: recreation is owned by the folder-aware
        // runSubscriptionMaintenance tick; sent items need no resync (see module doc).
      } catch (e) {
        ctx.error(`[graph-lifecycle-sent] handler error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { status: 202 };
  },
});

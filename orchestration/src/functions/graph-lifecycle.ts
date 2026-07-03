/**
 * orchestration/src/functions/graph-lifecycle.ts
 *
 * HTTP trigger: /api/graph-lifecycle
 * Handles Microsoft Graph lifecycle notification events for Outlook `message` subscriptions
 * (all three are supported for `message` — plan 22 §A.6, verified on Learn).
 *
 *   reauthorizationRequired  → re-acquire token + PATCH-renew the subscription (same as §A.5)
 *   subscriptionRemoved      → recreate the subscription (§A.2) + resync missed messages
 *   missed                   → resync: GET messages since the watermark and enqueue each id
 *
 * Same validation handshake as graph-webhook (echo validationToken, 200, text/plain) and the
 * same clientState verification.
 *
 * Re-enqueuing already-ingested messages is SAFE: the deterministic `intake-{messageId}`
 * orchestration instance id (§A.4) and the UNIQUE(sourcemessageid) backstop dedup replays, so
 * the resync never creates a second case — the reason the orchestrator must be idempotent.
 */

import {
  app,
  output,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import {
  renewSubscription,
  createSubscription,
  mailboxOfResource,
  looksLikeMailboxAddress,
  resolveSubscriptionMailbox,
} from '../lib/subscriptions.js';
import { listMessageIdsSince } from '../lib/graph.js';

interface LifecycleNotification {
  lifecycleEvent?: 'reauthorizationRequired' | 'subscriptionRemoved' | 'missed';
  subscriptionId?: string;
  resource?: string;
  clientState?: string;
}

const intakeQueue = output.storageQueue({
  queueName: 'intake-messages',
  connection: 'AzureWebJobsStorage',
});

/** Lower bound for a `missed`/recreate resync: max(mailbox MinIntakeDate, now - lookback). */
function resyncSince(mailbox: string): string {
  const lookbackHours = Number(process.env.MISSED_RESYNC_LOOKBACK_HOURS ?? '48');
  const floorByWindow = new Date(Date.now() - lookbackHours * 3_600_000);
  // Per-mailbox MinIntakeDate floor (go-live watermark) keeps backlog out.
  const cfg = (() => {
    try {
      const arr = JSON.parse(process.env.GRAPH_INTAKE_MAILBOXES ?? '[]') as Array<{ mailbox: string; minIntakeDate: string }>;
      return arr.find((m) => m.mailbox === mailbox);
    } catch {
      return undefined;
    }
  })();
  const minIntake = cfg?.minIntakeDate ? new Date(cfg.minIntakeDate) : floorByWindow;
  const since = floorByWindow > minIntake ? floorByWindow : minIntake;
  return since.toISOString();
}

app.http('graph-lifecycle', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'graph-lifecycle',
  extraOutputs: [intakeQueue],
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    // Validation handshake (same as the data webhook).
    const validationToken = req.query.get('validationToken');
    if (validationToken) {
      return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: validationToken };
    }

    const body = (await req.json()) as { value?: LifecycleNotification[] };
    const expected = process.env.GRAPH_CLIENT_STATE;
    const resync: string[] = [];

    for (const n of body.value ?? []) {
      if (n.clientState !== expected) {
        ctx.warn('[graph-lifecycle] clientState mismatch — dropping');
        continue;
      }
      // Lifecycle notifications can echo the canonicalised Users/<GUID>/… resource form.
      // Resolve the UPN via the subscription BEFORE enqueueing resyncs — resync queue
      // messages carry no subscriptionId, so a GUID here would persist as source_mailbox
      // provenance downstream (TKT-054).
      let mailbox = mailboxOfResource(n.resource ?? '');
      if (!looksLikeMailboxAddress(mailbox) && n.subscriptionId) {
        const resolved = await resolveSubscriptionMailbox(n.subscriptionId);
        if (resolved) mailbox = resolved;
      }
      ctx.log(JSON.stringify({ evt: 'graph-lifecycle', lifecycleEvent: n.lifecycleEvent, subscriptionId: n.subscriptionId, mailbox }));

      try {
        switch (n.lifecycleEvent) {
          case 'reauthorizationRequired':
            if (n.subscriptionId) await renewSubscription(n.subscriptionId);
            break;
          case 'subscriptionRemoved': {
            // Never create a subscription keyed on a non-address mailbox — the maintenance
            // bootstrap dedups by configured UPN, so a GUID-resourced subscription would
            // double-subscribe. Unresolvable here (sub already deleted, GET 404s) → leave
            // recreation to runSubscriptionMaintenance's next tick.
            if (looksLikeMailboxAddress(mailbox)) {
              await createSubscription(mailbox);
              await enqueueResync(mailbox, resync, ctx);
            } else if (mailbox) {
              ctx.warn(`[graph-lifecycle] subscriptionRemoved for unresolvable mailbox "${mailbox}" — recreation left to subscription maintenance`);
              await enqueueResync(mailbox, resync, ctx);
            }
            break;
          }
          case 'missed':
            // Resync even with an unresolved GUID — intake beats provenance (backfillable).
            if (mailbox) await enqueueResync(mailbox, resync, ctx);
            break;
          default:
            ctx.warn(`[graph-lifecycle] unknown lifecycleEvent: ${n.lifecycleEvent}`);
        }
      } catch (e) {
        // Lifecycle must still 202 promptly; log + let the 12 h renewal timer be the backstop.
        ctx.error(`[graph-lifecycle] handler error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    ctx.extraOutputs.set(intakeQueue, resync);
    return { status: 202 };
  },
});

async function enqueueResync(mailbox: string, sink: string[], ctx: InvocationContext): Promise<void> {
  const since = resyncSince(mailbox);
  const { ids, newWatermark } = await listMessageIdsSince(mailbox, since);
  for (const id of ids) {
    sink.push(
      JSON.stringify({
        messageId: id,
        resource: `users/${mailbox}/mailFolders('Inbox')/messages/${id}`,
        receivedAt: new Date().toISOString(),
        resync: true,
      }),
    );
  }
  ctx.log(JSON.stringify({ evt: 'graph-lifecycle-resync', mailbox, since, enqueued: ids.length, newWatermark }));
}

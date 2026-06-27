/**
 * orchestration/src/functions/graph-renew.ts
 *
 * Timer trigger: runs every 12 hours (NCRONTAB schedule is set on the app.timer registration below).
 * Renews all active Graph change-notification subscriptions before they expire (plan 22 §A.5).
 *
 * Outlook `message` subscriptions max out under 7 days (10,080 min) with includeResourceData=false.
 * A 12 h cadence gives ~13 renewal attempts before any single subscription could lapse — the price
 * of the D2 self-managed Graph path. Each PATCH pushes expiry to now + 6d 23h.
 *
 * If a PATCH 404s (subscription already gone), recreate it for the same mailbox (same path as §A.2)
 * — the lifecycle `subscriptionRemoved` handler covers the same case.
 *
 * Logs a `graph-renewal-success` custom event per success — the heartbeat key the §A.7 Azure
 * Monitor "renewal stalled" alert (no events in 26 h → fire) queries.
 */

import { app, type InvocationContext } from '@azure/functions';
import {
  listOurSubscriptions,
  renewSubscription,
  createSubscription,
  mailboxOfResource,
  intakeMailboxes,
} from '../lib/subscriptions.js';

app.timer('graph-renew', {
  schedule: '0 0 */12 * * *',
  handler: async (_timerInfo: unknown, ctx: InvocationContext): Promise<void> => {
    const subs = await listOurSubscriptions();
    const configured = intakeMailboxes();
    const subbed = new Set(subs.map((s) => mailboxOfResource(s.resource)).filter(Boolean));

    // BOOTSTRAP — ensure every configured intake mailbox has a subscription (create if missing).
    // This is what actually STARTS intake: the renew loop below only extends existing subscriptions,
    // so a freshly-configured mailbox would otherwise never get one. Until the mailbox is
    // Exchange-RBAC-scoped, POST /subscriptions 403s — logged and retried next tick; a no-op once scoped.
    for (const cfg of configured) {
      if (subbed.has(cfg.mailbox)) continue;
      try {
        const created = await createSubscription(cfg.mailbox);
        ctx.log(JSON.stringify({ evt: 'graph-subscription-created', subId: created.id, mailbox: cfg.mailbox, next: created.expirationDateTime }));
      } catch (e) {
        ctx.error(`[graph-renew] bootstrap subscription for ${cfg.mailbox} failed (is the mailbox Exchange-RBAC-scoped?): ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (subs.length === 0) {
      if (configured.length === 0) ctx.warn('[graph-renew] no managed subscriptions and no configured intake mailboxes');
      return;
    }

    for (const sub of subs) {
      try {
        const renewed = await renewSubscription(sub.id);
        // Heartbeat signal for Azure Monitor Alert 1 (plan 22 §A.7).
        ctx.log(JSON.stringify({ evt: 'graph-renewal-success', subId: sub.id, next: renewed.expirationDateTime }));
      } catch (e) {
        // 404 (gone) → recreate for the same mailbox; otherwise log + continue.
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('→ 404')) {
          const mailbox = mailboxOfResource(sub.resource);
          ctx.warn(`[graph-renew] subscription ${sub.id} gone — recreating for ${mailbox}`);
          if (mailbox) {
            const recreated = await createSubscription(mailbox);
            ctx.log(JSON.stringify({ evt: 'graph-renewal-success', subId: recreated.id, recreated: true, next: recreated.expirationDateTime }));
          }
        } else {
          ctx.error(`[graph-renew] PATCH ${sub.id} failed: ${msg}`);
        }
      }
    }
  },
});

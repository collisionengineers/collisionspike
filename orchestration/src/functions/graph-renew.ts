/**
 * orchestration/src/functions/graph-renew.ts
 *
 * Timer trigger (BACKSTOP ONLY): renews all active Graph change-notification subscriptions.
 *
 * ⚠️ On the Flex Consumption plan this timer does NOT reliably fire: a timer trigger has no
 * external event source, so when the app is scaled to zero at a scheduled tick nothing wakes a
 * host to run it (observed: 0 executions over 7 days). The PRIMARY, reliable renewal mechanism
 * is the durable `subscriptionMonitorOrchestrator` (durable timer messages DO wake a scaled-to-
 * zero Flex app) plus the `graph-renew` HTTP route. This timer is retained only as a belt-and-
 * braces backstop that fires IF an always-ready instance is ever configured for it.
 *
 * Outlook `message` subscriptions max out under 7 days (10,080 min) with includeResourceData=false;
 * each PATCH pushes expiry to now + 6d 23h. Logs `graph-renewal-success` per success (the Azure
 * Monitor "renewal stalled" heartbeat key).
 */

import { app, type InvocationContext } from '@azure/functions';
import { runSubscriptionMaintenance } from '../lib/subscriptions.js';

app.timer('graph-renew', {
  schedule: '0 0 */12 * * *',
  handler: async (_timerInfo: unknown, ctx: InvocationContext): Promise<void> => {
    await runSubscriptionMaintenance(ctx);
  },
});

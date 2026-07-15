/**
 * orchestration/src/functions/intake-starter.ts
 *
 * Queue trigger: drains 'intake-messages' storage queue.
 * Dedup choke-point: starts one Durable intakeOrchestrator per message using a
 * deterministic instance id derived from the message id — preventing duplicate orchestrations
 * from re-delivered Graph notifications (plan 22 §A.4).
 *
 * Only starts a new orchestration if no non-failed/non-terminated instance exists for
 * this message id. Durable instance status is checked via the durableClient input binding.
 */

import { app, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { ensureSubscriptionMonitor } from './subscriptionMonitor.js';
import { ensureArchiveMirrorMonitor } from './archive-mirror-monitor.js';

app.storageQueue('intake-starter', {
  queueName: 'intake-messages',
  connection: 'AzureWebJobsStorage',
  extraInputs: [df.input.durableClient()],
  handler: async (item: unknown, ctx: InvocationContext): Promise<void> => {
    // The Functions v4 storage-queue trigger auto-deserializes a JSON message into an
    // object; only a non-JSON message arrives as a raw string. Accept both (parsing an
    // already-parsed object throws `"[object Object]" is not valid JSON`).
    const msg = (typeof item === 'string' ? JSON.parse(item) : item) as {
      messageId: string;
      subscriptionId?: string;
      tenantId?: string;
      receivedAt?: string;
    };

    const client = df.getClient(ctx);

    // Belt-and-braces: ensure the eternal subscription-renewal monitor is running. A durable
    // timer message wakes a scaled-to-zero Flex app (a plain timer trigger does not), so any
    // intake traffic re-bootstraps renewal. Best-effort — never blocks intake.
    try {
      await ensureSubscriptionMonitor(client, (m) => ctx.log(m));
    } catch (e) {
      ctx.warn(`[intake-starter] ensureSubscriptionMonitor: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      await ensureArchiveMirrorMonitor(client, (m) => ctx.log(m));
    } catch (e) {
      ctx.warn(`[intake-starter] ensureArchiveMirrorMonitor: ${e instanceof Error ? e.message : String(e)}`);
    }

    // The Graph messageId is base64url WITH '=' padding (and other non-alphanumerics);
    // a Durable instanceId must be management-API-safe, so strip to [A-Za-z0-9_-].
    // Deterministic, so re-delivered notifications still map to the same instance.
    const safeMessageId = String(msg.messageId).replace(/[^A-Za-z0-9_-]/g, '');
    const instanceId = `intake-${safeMessageId}`;

    // getStatus THROWS an HTTP 404 ("could not find any data associated with the
    // instanceId") when no instance exists yet — the normal first-seen case. Treat that
    // as "no prior run" instead of letting it fail the whole starter (which dropped every
    // first email). A genuine duplicate returns a status object and is deduped below.
    let existing;
    try {
      existing = await client.getStatus(instanceId);
    } catch (err) {
      ctx.log(`[intake-starter] no existing instance for ${instanceId} (${err instanceof Error ? err.message : String(err)})`);
      existing = undefined;
    }
    if (
      existing &&
      existing.runtimeStatus !== 'Failed' &&
      existing.runtimeStatus !== 'Terminated'
    ) {
      ctx.log(`[intake-starter] skipping duplicate — instance ${instanceId} already ${existing.runtimeStatus}`);
      return;
    }

    await client.startNew('intakeOrchestrator', { instanceId, input: msg });
    ctx.log(`[intake-starter] started orchestration ${instanceId}`);
  },
});

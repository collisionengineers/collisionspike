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
    const instanceId = `intake-${msg.messageId}`;

    const existing = await client.getStatus(instanceId);
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

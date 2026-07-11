import { app } from '@azure/functions';
import {
  pendingBoxFileRequestCaseIds,
  processBoxFileRequestIntent,
} from '../lib/box-file-request-outbox.js';
import { gates } from '../lib/gates.js';
import { withServiceAuth } from './internal.js';

export async function drainBoxFileRequestOutbox(): Promise<{ processed: number; completed: number }> {
  if (!gates.boxApi() || !gates.boxFileRequest()) return { processed: 0, completed: 0 };
  const caseIds = await pendingBoxFileRequestCaseIds();
  let completed = 0;
  for (const caseId of caseIds) {
    const result = await processBoxFileRequestIntent(caseId);
    if (result.kind === 'ok') completed++;
  }
  return { processed: caseIds.length, completed };
}

// Already-awake fallback only. The orchestration app's eternal Durable monitor is
// the primary FC1 wake path and calls the authenticated HTTP drain below.
app.timer('box-file-request-outbox-drain', {
  schedule: '30 * * * * *',
  handler: async () => {
    try {
      await drainBoxFileRequestOutbox();
    } catch (error) {
      console.error('[box-file-request] timer drain failed', error);
    }
  },
});

/**
 * Wake-safe drain seam for the orchestration app's eternal Durable monitor.
 *
 * The API remains the sole owner of the remote CopyFileRequest call and the atomic
 * case/outbox stamp. Orchestration only wakes this authenticated, idempotent drain.
 */
app.http('internalBoxFileRequestOutboxDrain', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/box-file-request-outbox/drain',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => ({
      status: 200,
      jsonBody: await drainBoxFileRequestOutbox(),
    })),
});

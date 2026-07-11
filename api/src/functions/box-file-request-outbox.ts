import { app } from '@azure/functions';
import {
  pendingBoxFileRequestCaseIds,
  processBoxFileRequestIntent,
} from '../lib/box-file-request-outbox.js';
import { gates } from '../lib/gates.js';

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

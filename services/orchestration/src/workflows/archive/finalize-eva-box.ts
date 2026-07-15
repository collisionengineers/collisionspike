/** *
 * Gated orchestration (plan 22 §C): EVA submit + Box folder-augment as ONE atomic unit
 * (the flow's house pattern — keep EVA-submit and the Box folder-augment together).
 *
 * Gates: EVA_API_ENABLED **and** BOX_API_ENABLED — both must be on for it to do anything.
 * Default off → the HTTP starter no-ops without launching the orchestration.
 *
 * Trigger today: manual (`When_submit_requested`) → preserved as an HTTP starter.
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { callEvaSubmit, box } from '../../adapters/functions-client.js';
import { dataApi } from '../../adapters/data-api.js';

/* ---- HTTP starter (manual trigger analogue) ---- */
app.http('finalize-eva-box-start', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'finalize-eva-box',
  extraInputs: [df.input.durableClient()],
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!gates.evaApi() || !gates.boxApi()) {
      ctx.log('[finalize-eva-box] skipped — EVA_API_ENABLED and/or BOX_API_ENABLED off');
      return { status: 200, jsonBody: { skipped: true, reason: 'gated off' } };
    }
    const { caseId } = (await req.json()) as { caseId: string };
    const client = df.getClient(ctx);
    const instanceId = await client.startNew('finalizeEvaBoxOrchestrator', { input: { caseId } });
    return client.createCheckStatusResponse(req, instanceId);
  },
});

/* ---- orchestration ---- */
const retry = new df.RetryOptions(5_000, 3);
retry.backoffCoefficient = 2;
retry.maxRetryIntervalInMilliseconds = 60_000;

df.app.orchestration('finalizeEvaBoxOrchestrator', function* (ctx) {
  const { caseId } = ctx.df.getInput() as { caseId: string };
  const eva = yield ctx.df.callActivityWithRetry('evaSubmit', retry, { caseId });
  const boxResult = yield ctx.df.callActivityWithRetry('boxFolderAugment', retry, { caseId });
  return { caseId, eva, box: boxResult };
});

/* ---- activities ---- */
df.app.activity('evaSubmit', {
  handler: async (input: { caseId: string }, ctx): Promise<unknown> => {
    if (!gates.evaApi()) return { skipped: true };
    const payload = await dataApi.evaSubmission(input.caseId);
    const res = await callEvaSubmit(payload) as { submitted?: boolean };
    if (res.submitted !== true) return res;
    await dataApi.recordAudit({ action: 'eva_submitted', caseId: input.caseId, summary: 'EVA Sentry submit' });
    ctx.log(JSON.stringify({ evt: 'evaSubmit', caseId: input.caseId }));
    return res;
  },
});

df.app.activity('boxFolderAugment', {
  handler: async (input: { caseId: string }, ctx): Promise<unknown> => {
    if (!gates.boxApi()) return { skipped: true };
    // Folder-augment delta via the box-webhook facade (never re-mints CCG tokens — plan 22 §C).
    const folder = await box.createFolder(input.caseId, gates.boxFolderRootId());
    const folderUrl = `https://app.box.com/folder/${encodeURIComponent(folder.id)}`;
    await dataApi.recordAudit({ action: 'box_synced', caseId: input.caseId, summary: `Archive folder ${folder.id} augmented` });
    ctx.log(JSON.stringify({ evt: 'boxFolderAugment', caseId: input.caseId, folderId: folder.id }));
    return { folderId: folder.id, folderUrl };
  },
});

/** *
 * Gated orchestration (plan 22 §C): EVA submit + Box folder-ensure as ONE atomic unit
 * (the flow's house pattern — keep EVA-submit and the Box folder step together).
 *
 * Gates: EVA_API_ENABLED **and** BOX_API_ENABLED — both must be on for it to do anything.
 * Default off → the HTTP starter no-ops without launching the orchestration.
 *
 * Trigger today: manual (`When_submit_requested`) → preserved as an HTTP starter.
 * Function-key auth (TKT-298 hardening): the starter was anonymous while both gates were
 * dark; with the PLAN-015 alpha flipping EVA_API_ENABLED on, an anonymous route could
 * drive real EVA submissions (+ Box folder writes) from any internet caller.
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { resolveArchiveFolderName } from '@cs/intake-engine';
import { callEvaSubmit } from '../../adapters/functions-client.js';
import { dataApi } from '../../adapters/data-api.js';
import { ensureArchiveFolderV2Core } from '../intake-v2/ensureArchiveFolder.js';

/* email-engine-rebuild — the former `boxFolderAugment` activity minted a Box folder
 * NAMED BY RAW CASE UUID with NO safety check (`box.createFolder(input.caseId, ...)`
 * directly against whatever `gates.boxFolderRootId()` resolved to). That naming
 * convention does not carry over: the replacement activity below reads the case's saved
 * Case/PO (the SAME `dataApi.getCaseBoxFolder` read `case-archive-folder.ts` uses),
 * derives the archive folder name from it via `@cs/intake-engine`'s
 * `resolveArchiveFolderName`, and creates/finds it through `ensureArchiveFolderV2Core`
 * (intake-v2/ensureArchiveFolder.ts) — the one guarded Box-folder-creation primitive for
 * this rebuild, which fails closed unless the target parent is the pinned test root. A
 * case with no Case/PO yet (held, no provider match) skips, exactly like
 * case-archive-folder.ts's own no-PO skip. */

/* ---- HTTP starter (manual trigger analogue) ---- */
app.http('finalize-eva-box-start', {
  methods: ['POST'],
  authLevel: 'function',
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
  const boxResult = yield ctx.df.callActivityWithRetry('evaArchiveFolderEnsure', retry, { caseId });
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

df.app.activity('evaArchiveFolderEnsure', {
  handler: async (input: { caseId: string }, ctx): Promise<unknown> => {
    if (!gates.boxApi()) return { skipped: true };
    const existing = await dataApi.getCaseBoxFolder(input.caseId);
    const rawCasePo = (existing.casePo ?? '').trim();
    if (!rawCasePo) {
      ctx.log(JSON.stringify({ evt: 'evaArchiveFolderEnsure', caseId: input.caseId, skipped: 'no_case_po' }));
      return { skipped: true, reason: 'no_case_po' };
    }
    const folderName = resolveArchiveFolderName(rawCasePo);
    // The guarded ensure call — @cs/intake-engine's box-test-guard fails closed unless
    // the target parent is the pinned test root (see intake-v2/ensureArchiveFolder.ts).
    const folder = await ensureArchiveFolderV2Core({ name: folderName });
    const folderUrl = `https://app.box.com/folder/${encodeURIComponent(folder.id)}`;
    await dataApi.recordAudit({ action: 'box_synced', caseId: input.caseId, summary: `Archive folder ${folder.id} augmented` });
    ctx.log(JSON.stringify({ evt: 'evaArchiveFolderEnsure', caseId: input.caseId, folderId: folder.id }));
    return { folderId: folder.id, folderUrl };
  },
});

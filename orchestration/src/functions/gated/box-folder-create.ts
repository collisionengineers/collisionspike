/**
 * orchestration/src/functions/gated/box-folder-create.ts
 *
 * Gated orchestration (plan 22 §C): create the case Box folder at parse-confirm via the
 * box-webhook Function facade (CCG token minted inside that Function — the orchestration
 * NEVER re-mints Box tokens).
 *
 * Gates: BOX_FOLDER_AT_INTAKE_ENABLED **and** BOX_API_ENABLED — both off by default → the
 * HTTP starter no-ops without launching the orchestration.
 *
 * Trigger today: manual → preserved as an HTTP starter.
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { box } from '../../lib/functions-client.js';
import { dataApi } from '../../lib/data-api.js';

interface BoxFolderCreateInput {
  caseId: string;
  /** Folder name = Case/PO (Principal+YY+NNN). */
  folderName: string;
}

app.http('box-folder-create-start', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'box-folder-create',
  extraInputs: [df.input.durableClient()],
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!gates.boxApi() || !gates.boxFolderAtIntake()) {
      ctx.log('[box-folder-create] skipped — BOX_API_ENABLED and/or BOX_FOLDER_AT_INTAKE_ENABLED off');
      return { status: 200, jsonBody: { skipped: true, reason: 'gated off' } };
    }
    const input = (await req.json()) as BoxFolderCreateInput;
    const client = df.getClient(ctx);
    const instanceId = await client.startNew('boxFolderCreateOrchestrator', { input });
    return client.createCheckStatusResponse(req, instanceId);
  },
});

const retry = new df.RetryOptions(5_000, 3);
retry.backoffCoefficient = 2;

df.app.orchestration('boxFolderCreateOrchestrator', function* (ctx) {
  const input = ctx.df.getInput() as BoxFolderCreateInput;
  const result = yield ctx.df.callActivityWithRetry('boxFolderCreate', retry, input);
  return result;
});

df.app.activity('boxFolderCreate', {
  handler: async (input: BoxFolderCreateInput, ctx): Promise<unknown> => {
    if (!gates.boxApi() || !gates.boxFolderAtIntake()) return { skipped: true };
    const folder = await box.createFolder(input.folderName, gates.boxFolderRootId());
    const link = await box.folderSharedLink(folder.id);
    await dataApi.recordAudit({ action: 'box_folder_created', caseId: input.caseId, summary: `Box folder ${folder.id} (${input.folderName})` });
    ctx.log(JSON.stringify({ evt: 'boxFolderCreate', caseId: input.caseId, folderId: folder.id }));
    return { folderId: folder.id, sharedLink: link.shared_link?.url };
  },
});

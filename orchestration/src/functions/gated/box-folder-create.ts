/**
 * orchestration/src/functions/gated/box-folder-create.ts
 *
 * Gated orchestration (plan 22 §C): create the case Box folder at parse-confirm via the
 * box-webhook Function facade (CCG token minted inside that Function — the orchestration
 * NEVER re-mints Box tokens).
 *
 * Gates: BOX_FOLDER_AT_INTAKE_ENABLED **and** BOX_API_ENABLED — both off by default → the
 * HTTP starter no-ops without launching the orchestration, and the activity no-ops when
 * called (so the intake orchestrator's gate-less callSubOrchestrator is replay-safe).
 *
 * Triggers: (1) the intake orchestrator calls `boxFolderCreateOrchestrator` via
 * callSubOrchestrator after caseResolve mints the Case/PO (known-provider cases only);
 * (2) the manual HTTP starter, preserved as an operator lever.
 *
 * Idempotent: the activity reads the case's current box_folder_id first and SKIPS if the
 * case already has a folder; on create it stamps box_folder_id/box_folder_url onto the case
 * (the Data API writes the box_folder_created audit, first-wins).
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
    // Gate enforced HERE (not in the calling orchestrator) so the decision is recorded in
    // Durable history and stays replay-safe — the parse/enrich/chaser convention.
    if (!gates.boxApi() || !gates.boxFolderAtIntake()) return { skipped: true, reason: 'gated off' };

    // Idempotency: never mint a second Box folder for a case that already has one (a replayed
    // intake, an attach catch-up, or a manual re-trigger). Read-before-create avoids the
    // orphan-folder a blind create-then-stamp would leave when the case is already linked.
    const existing = await dataApi.getCaseBoxFolder(input.caseId);
    if (existing.boxFolderId) {
      ctx.log(JSON.stringify({ evt: 'boxFolderCreate', caseId: input.caseId, skipped: 'already_linked', folderId: existing.boxFolderId }));
      return { skipped: true, reason: 'already_linked', folderId: existing.boxFolderId, folderUrl: existing.boxFolderUrl ?? undefined };
    }

    // Mint the folder via the box-webhook facade (never re-mints Box tokens — plan 22 §C).
    // Do not mint a public shared link: staff open the authenticated app deep link.
    const folder = await box.createFolder(input.folderName, gates.boxFolderRootId());
    const folderUrl = `https://app.box.com/folder/${encodeURIComponent(folder.id)}`;

    // Stamp box_folder_id/url onto the case (first-wins) — the Data API writes the
    // box_folder_created audit on the stamping call only.
    const stamp = await dataApi.stampCaseBoxFolder(input.caseId, {
      boxFolderId: folder.id,
      boxFolderUrl: folderUrl,
    });
    ctx.log(JSON.stringify({ evt: 'boxFolderCreate', caseId: input.caseId, folderId: folder.id, applied: stamp.applied }));
    return { folderId: folder.id, folderUrl, applied: stamp.applied };
  },
});

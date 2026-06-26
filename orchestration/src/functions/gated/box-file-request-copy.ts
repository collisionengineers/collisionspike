/**
 * orchestration/src/functions/gated/box-file-request-copy.ts
 *
 * Gated orchestration (plan 22 §C): copy the Box File-Request template onto the case folder
 * (the File-Request chaser + webhook-intake path) via the box-webhook Function facade.
 *
 * Gates: BOX_FILEREQUEST_ENABLED **and** BOX_API_ENABLED — both off by default → no-op.
 *
 * Trigger today: manual → preserved as an HTTP starter.
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { box } from '../../lib/functions-client.js';
import { dataApi } from '../../lib/data-api.js';

interface BoxFileRequestInput {
  caseId: string;
  /** Target case folder id (from box-folder-create). */
  folderId: string;
}

app.http('box-file-request-copy-start', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'box-file-request-copy',
  extraInputs: [df.input.durableClient()],
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!gates.boxApi() || !gates.boxFileRequest()) {
      ctx.log('[box-file-request-copy] skipped — BOX_API_ENABLED and/or BOX_FILEREQUEST_ENABLED off');
      return { status: 200, jsonBody: { skipped: true, reason: 'gated off' } };
    }
    const input = (await req.json()) as BoxFileRequestInput;
    const client = df.getClient(ctx);
    const instanceId = await client.startNew('boxFileRequestCopyOrchestrator', { input });
    return client.createCheckStatusResponse(req, instanceId);
  },
});

const retry = new df.RetryOptions(5_000, 3);
retry.backoffCoefficient = 2;

df.app.orchestration('boxFileRequestCopyOrchestrator', function* (ctx) {
  const input = ctx.df.getInput() as BoxFileRequestInput;
  const result = yield ctx.df.callActivityWithRetry('boxFileRequestCopy', retry, input);
  return result;
});

df.app.activity('boxFileRequestCopy', {
  handler: async (input: BoxFileRequestInput, ctx): Promise<unknown> => {
    if (!gates.boxApi() || !gates.boxFileRequest()) return { skipped: true };
    const templateId = gates.boxFileRequestTemplateId();
    if (!templateId) {
      ctx.warn('[boxFileRequestCopy] BOX_FILE_REQUEST_TEMPLATE_ID empty — nothing to copy');
      return { skipped: true, reason: 'no template' };
    }
    const res = await box.copyFileRequest(templateId, input.folderId);
    await dataApi.recordAudit({ action: 'box_file_request_copied', caseId: input.caseId, summary: `File-Request copied to folder ${input.folderId}` });
    ctx.log(JSON.stringify({ evt: 'boxFileRequestCopy', caseId: input.caseId, folderId: input.folderId }));
    return res;
  },
});

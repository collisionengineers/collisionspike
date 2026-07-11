/**
 * Retired compatibility route for the former orchestration-owned Box File Request copy.
 *
 * File Request creation now belongs exclusively to the Data API's durable case outbox.
 * Keeping this route as an explicit 410 prevents an old operator bookmark or caller from
 * receiving a successful-looking response while creating an unstamped remote request.
 * No Durable orchestration/activity is registered here and this module never calls Box.
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';

interface LegacyBoxFileRequestInput {
  caseId?: unknown;
}

const CASE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

app.http('box-file-request-copy-start', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'box-file-request-copy',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const body = (await req.json().catch(() => ({}))) as LegacyBoxFileRequestInput;
    const caseId = typeof body.caseId === 'string' ? body.caseId.trim() : '';
    if (!CASE_ID_RE.test(caseId)) {
      return {
        status: 400,
        jsonBody: { error: 'caseId must be a valid case identifier' },
      };
    }

    const replacementPath = `/api/cases/${encodeURIComponent(caseId)}/box/copy-file-request`;
    ctx.warn(
      `[box-file-request-copy] retired starter called for ${caseId}; ` +
        `no remote work started (replacement ${replacementPath})`,
    );
    return {
      status: 410,
      jsonBody: {
        error: 'retired_starter',
        message: 'Create the image-upload link from the case page.',
        replacement: { method: 'POST', path: replacementPath },
      },
    };
  },
});

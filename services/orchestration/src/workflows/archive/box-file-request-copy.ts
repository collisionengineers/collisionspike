/**
 * Unavailable Archive File Request route. Creation belongs to the data service's
 * durable case outbox, so this endpoint returns 410 with the canonical route.
 * No Durable orchestration or activity is registered here.
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';

interface BoxFileRequestInput {
  caseId?: unknown;
}

const CASE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

app.http('box-file-request-copy-start', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'box-file-request-copy',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const body = (await req.json().catch(() => ({}))) as BoxFileRequestInput;
    const caseId = typeof body.caseId === 'string' ? body.caseId.trim() : '';
    if (!CASE_ID_RE.test(caseId)) {
      return {
        status: 400,
        jsonBody: { error: 'caseId must be a valid case identifier' },
      };
    }

    const replacementPath = `/api/cases/${encodeURIComponent(caseId)}/box/copy-file-request`;
    ctx.warn(
      `[box-file-request-copy] unavailable route called for ${caseId}; ` +
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

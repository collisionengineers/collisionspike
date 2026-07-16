/** Function-key protected, read-only exact-message resolver used by the Data API. */
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { intakeMailboxes } from '../../platform/subscriptions.js';
import { readMessageLinkByImmutableId } from '../../platform/outlook-links.js';

export async function outlookLinkResolveHandler(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const body = (await req.json().catch(() => ({}))) as {
    sourceMailbox?: unknown;
    graphMessageId?: unknown;
  };
  const sourceMailbox = typeof body.sourceMailbox === 'string' ? body.sourceMailbox.trim().toLowerCase() : '';
  const graphMessageId = typeof body.graphMessageId === 'string' ? body.graphMessageId.trim() : '';
  if (!sourceMailbox || !graphMessageId || graphMessageId.length > 1_024) {
    return { status: 400, jsonBody: { status: 'missing_identity' } };
  }
  const configured = new Set(intakeMailboxes().map((entry) => entry.mailbox.trim().toLowerCase()));
  if (!configured.has(sourceMailbox)) {
    // Even a caller holding the function key cannot use this endpoint to enumerate
    // mailboxes beyond the three explicitly configured intake inboxes.
    return { status: 200, jsonBody: { status: 'not_accessible' } };
  }
  const result = await readMessageLinkByImmutableId(sourceMailbox, graphMessageId);
  return { status: 200, jsonBody: result };
}

app.http('outlook-link-resolve', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'outlook-link-resolve',
  handler: outlookLinkResolveHandler,
});

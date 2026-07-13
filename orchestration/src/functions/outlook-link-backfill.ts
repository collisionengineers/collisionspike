/**
 * Explicit, function-key protected historical link remediation. It is not timer/queue
 * triggered and therefore remains inert until an operator deliberately invokes it.
 * Every Graph operation is GET-only; results are ledgered by the Data API.
 */
import { randomUUID } from 'node:crypto';
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { dataApi } from '../lib/data-api.js';
import { findHistoricalMessageLink } from '../lib/outlook-links.js';

export async function runOutlookLinkBackfill(
  limit: number,
  ctx: Pick<InvocationContext, 'log' | 'warn'>,
  attemptIdFactory: () => string = randomUUID,
): Promise<{ attempted: number; resolved: number; unresolved: number }> {
  const bounded = Math.max(1, Math.min(100, Math.trunc(limit) || 25));
  const { rows } = await dataApi.outlookLinkBackfillCandidates(bounded);
  let resolved = 0;
  let unresolved = 0;

  for (const row of rows) {
    const lookup = await findHistoricalMessageLink(row.sourceMailbox, row.sourceMessageId);
    const payload = {
      attemptId: attemptIdFactory(),
      inboundEmailId: row.inboundEmailId,
      sourceMailbox: row.sourceMailbox,
      sourceMessageId: row.sourceMessageId,
      outcome: lookup.status === 'resolved' ? 'resolved' as const : lookup.status,
      reason: lookup.status === 'resolved' ? 'exact_mailbox_message_id_match' : lookup.reason,
      ...(lookup.status === 'resolved' ? {
        graphMessageId: lookup.graphMessageId,
        outlookWebLink: lookup.outlookWebLink,
      } : {}),
    };
    const recorded = await dataApi.reportOutlookLinkBackfill(payload);
    if (recorded.applied) resolved += 1;
    else unresolved += 1;
    ctx.log(JSON.stringify({
      evt: 'outlook-link-backfill',
      inboundEmailId: row.inboundEmailId,
      outcome: recorded.outcome,
    }));
  }
  if (unresolved) ctx.warn(`[outlook-link-backfill] ${unresolved} row(s) retained saved-preview-only outcomes`);
  return { attempted: rows.length, resolved, unresolved };
}

export async function outlookLinkBackfillHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const limit = Number(req.query.get('limit') ?? '25');
  const summary = await runOutlookLinkBackfill(limit, ctx);
  return { status: 200, jsonBody: summary };
}

app.http('outlook-link-backfill', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'outlook-link-backfill',
  handler: outlookLinkBackfillHandler,
});

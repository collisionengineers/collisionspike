/** Ledgered historical Outlook-link recovery. All Outlook work is read-only; this
 * module only enumerates Postgres candidates and records a terminal evidence row. */
import { normalizeOutlookWebLink } from '@cs/domain';
import { query, tx, type TxQuery } from '../../platform/db/client.js';

export interface OutlookLinkBackfillCandidate {
  inboundEmailId: string;
  sourceMailbox: string;
  sourceMessageId: string;
}

export type OutlookLinkBackfillOutcome =
  | 'resolved'
  | 'not_found'
  | 'not_accessible'
  | 'ambiguous'
  | 'unavailable';

export interface OutlookLinkBackfillResult {
  attemptId: string;
  inboundEmailId: string;
  sourceMailbox: string;
  sourceMessageId: string;
  outcome: OutlookLinkBackfillOutcome;
  reason: string;
  graphMessageId?: string;
  outlookWebLink?: string;
}

export async function listOutlookLinkBackfillCandidates(
  limit: number,
): Promise<OutlookLinkBackfillCandidate[]> {
  const bounded = Math.max(1, Math.min(100, Math.trunc(limit) || 25));
  const rows = await query<Record<string, unknown>>(
    `SELECT ie.id, ie.source_mailbox, ie.source_message_id
       FROM inbound_email ie
      WHERE NULLIF(btrim(ie.source_mailbox), '') IS NOT NULL
        AND NULLIF(btrim(ie.source_message_id), '') IS NOT NULL
        AND (ie.graph_message_id IS NULL OR ie.outlook_web_link IS NULL)
        AND NOT EXISTS (
          SELECT 1 FROM outlook_link_backfill_ledger l
           WHERE l.inbound_email_id = ie.id
             AND l.outcome IN ('resolved','not_found','not_accessible','ambiguous','identity_conflict')
        )
      ORDER BY ie.received_on DESC NULLS LAST, ie.id
      LIMIT $1`,
    [bounded],
  );
  return rows.map((row) => ({
    inboundEmailId: String(row.id),
    sourceMailbox: String(row.source_mailbox),
    sourceMessageId: String(row.source_message_id),
  }));
}

async function insertLedger(
  q: TxQuery,
  result: OutlookLinkBackfillResult,
  outcome: OutlookLinkBackfillOutcome | 'stale_source' | 'identity_conflict',
  graphMessageId: string | null,
  outlookWebLink: string | null,
): Promise<void> {
  await q(
    `INSERT INTO outlook_link_backfill_ledger
       (attempt_id, inbound_email_id, source_mailbox, source_message_id,
        outcome, reason, graph_message_id, outlook_web_link)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (attempt_id) DO NOTHING`,
    [
      result.attemptId,
      result.inboundEmailId,
      result.sourceMailbox,
      result.sourceMessageId,
      outcome,
      result.reason.slice(0, 300),
      graphMessageId,
      outlookWebLink,
    ],
  );
}

/** Atomically preserve the row's mailbox/message/Graph/link tuple and append the outcome ledger. */
export async function recordOutlookLinkBackfillResult(
  result: OutlookLinkBackfillResult,
): Promise<{ recorded: boolean; applied: boolean; outcome: string }> {
  return tx(async (q) => {
    const rows = await q<Record<string, unknown>>(
      `SELECT source_mailbox, source_message_id, graph_message_id, outlook_web_link
         FROM inbound_email WHERE id = $1 FOR UPDATE`,
      [result.inboundEmailId],
    );
    const row = rows[0];
    if (!row) return { recorded: false, applied: false, outcome: 'missing_row' };

    const currentMailbox = String(row.source_mailbox ?? '');
    const currentMessageId = String(row.source_message_id ?? '');
    if (currentMailbox !== result.sourceMailbox || currentMessageId !== result.sourceMessageId) {
      await insertLedger(q, result, 'stale_source', null, null);
      return { recorded: true, applied: false, outcome: 'stale_source' };
    }

    if (result.outcome !== 'resolved') {
      await insertLedger(q, result, result.outcome, null, null);
      return { recorded: true, applied: false, outcome: result.outcome };
    }

    const graphMessageId = (result.graphMessageId ?? '').trim();
    const outlookWebLink = normalizeOutlookWebLink(result.outlookWebLink) ?? null;
    if (!graphMessageId || graphMessageId.length > 1_024 || !outlookWebLink) {
      await insertLedger(q, result, 'unavailable', null, null);
      return { recorded: true, applied: false, outcome: 'unavailable' };
    }

    const existingGraphId = String(row.graph_message_id ?? '').trim();
    const existingLink = normalizeOutlookWebLink(row.outlook_web_link) ?? '';
    if (
      (existingGraphId && existingGraphId !== graphMessageId) ||
      (existingLink && existingLink !== outlookWebLink)
    ) {
      await insertLedger(q, result, 'identity_conflict', graphMessageId, outlookWebLink);
      return { recorded: true, applied: false, outcome: 'identity_conflict' };
    }

    await q(
      `UPDATE inbound_email
          SET graph_message_id = $4, outlook_web_link = $5, updated_at = now()
        WHERE id = $1 AND source_mailbox = $2 AND source_message_id = $3`,
      [result.inboundEmailId, result.sourceMailbox, result.sourceMessageId, graphMessageId, outlookWebLink],
    );
    await insertLedger(q, result, 'resolved', graphMessageId, outlookWebLink);
    return { recorded: true, applied: true, outcome: 'resolved' };
  });
}

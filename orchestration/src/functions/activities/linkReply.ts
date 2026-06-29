/**
 * orchestration/src/functions/activities/linkReply.ts  (activity 1.6 — #3)
 *
 * Durable activity: when the classifier flagged an inbound as a REPLY about existing work
 * (is_reply; typically the query_existing_work subtype), resolve it against OPEN cases and
 * LINK the triage row to the matching case instead of minting a new one.
 *
 * The DB lookup + the ADR-0010 decision run server-side in the Data API
 * (POST /api/internal/inbound/link-reply): Case-ref (provider ref / case_po) FIRST, then VRM;
 * exactly one match → link; >1 (ambiguous) → never auto-link, flag for a human; 0 → no match.
 * This activity is the thin orchestration seam (idempotent — the upsert keys on
 * source_message_id, so an at-least-once Durable replay re-links the same row).
 */

import * as df from 'durable-functions';
import { dataApi } from '../../lib/data-api.js';
import type { InboundEnvelope } from './fetchMessage.js';

interface LinkReplyInput {
  inbound: InboundEnvelope;
  providerId?: string;
  /** Case reference to match first (subject/body provider ref or case_po). */
  ref?: string;
  /** VRM to match as the fallback. */
  vrm?: string;
}

df.app.activity('linkReply', {
  handler: async (
    input: LinkReplyInput,
    ctx,
  ): Promise<{ outcome: 'linked' | 'ambiguous' | 'no_match'; caseId?: string }> => {
    const result = await dataApi.linkReplyToOpenCase({
      inbound: input.inbound,
      providerId: input.providerId,
      ref: input.ref,
      vrm: input.vrm,
    });
    ctx.log(
      JSON.stringify({
        evt: 'linkReply',
        messageId: input.inbound.messageId,
        outcome: result.outcome,
        candidateCount: result.candidateCount,
      }),
    );
    return { outcome: result.outcome, ...(result.caseId ? { caseId: result.caseId } : {}) };
  },
});

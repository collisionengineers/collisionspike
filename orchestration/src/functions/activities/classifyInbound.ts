/**
 * orchestration/src/functions/activities/classifyInbound.ts  (activity 1.5)
 *
 * Durable activity: deterministic inbound-email triage (ADR-0015). It does two things,
 * both idempotent so an at-least-once Durable replay is safe:
 *   1. calls the parser's `/classify-email` route (subject + body + sender + attachment
 *      kinds + provider-match state) to get the category/subtype the orchestrator
 *      branches on; and
 *   2. records the classified `inbound_email` triage row (one per arrival, NO case yet —
 *      the Data API upserts on source_message_id). For `receiving_work` the later
 *      caseResolve stamps `case_id` onto the same row; `query`/`other` stop here.
 *
 * ALWAYS-ON: the deterministic pass is $0 and runs for every email. EMAIL_AI_ENABLED
 * gates only a later optional LLM refinement of `other`/low-confidence rows — never this.
 */

import * as df from 'durable-functions';
import { describeEvidence } from '@cs/domain';
import { callClassifyEmail } from '../../lib/functions-client.js';
import { dataApi } from '../../lib/data-api.js';
import type { InboundEnvelope } from './fetchMessage.js';

interface ClassifyInboundInput {
  inbound: InboundEnvelope;
  workProviderId?: string;
  matchState?: 'matched' | 'unmatched' | 'ambiguous';
}

export type InboundCategory = 'receiving_work' | 'query' | 'other';

export interface InboundClassification {
  category: InboundCategory;
  subtype: string;
  confidence: number;
  signals: string[];
  bodyVrm: string;
  bodyCaseref: string;
  /** Reply about existing work (#3) — drives the open-case link path. Default false. */
  isReply: boolean;
}

/** providerMatch outcome -> the classifier's provider_match_state vocab (one|none|ambiguous). */
const MATCH_STATE_TO_CLASSIFIER: Record<string, string> = {
  matched: 'one',
  unmatched: 'none',
  ambiguous: 'ambiguous',
};

const KNOWN_CATEGORIES = new Set<InboundCategory>(['receiving_work', 'query', 'other']);

function domainOf(address: string): string {
  const at = address.lastIndexOf('@');
  return at >= 0 ? address.slice(at + 1).toLowerCase().trim() : '';
}

df.app.activity('classifyInbound', {
  handler: async (input: ClassifyInboundInput, ctx): Promise<InboundClassification> => {
    const { inbound, workProviderId, matchState } = input;

    const attachmentKinds = inbound.attachments.map(
      (a) => describeEvidence(a.filename, a.contentType).evidenceClass,
    );

    const res = await callClassifyEmail({
      subject: inbound.subject,
      body: inbound.body,
      from: inbound.senderAddress,
      senderDomain: domainOf(inbound.senderAddress),
      providerMatchState: MATCH_STATE_TO_CLASSIFIER[matchState ?? 'unmatched'] ?? 'none',
      attachmentKinds,
      hasAttachments: inbound.attachments.length > 0,
      inReplyTo: inbound.inReplyTo,
      references: inbound.references,
    });

    const category: InboundCategory = KNOWN_CATEGORIES.has(res.category as InboundCategory)
      ? (res.category as InboundCategory)
      : 'other';

    const classification: InboundClassification = {
      category,
      subtype: res.subtype || 'other',
      confidence: res.confidence ?? 0,
      signals: res.signals ?? [],
      bodyVrm: res.body_vrm ?? '',
      bodyCaseref: res.body_caseref ?? '',
      isReply: res.is_reply ?? false,
    };

    // Record the classified triage row (no case yet). Idempotent upsert on source_message_id.
    await dataApi.recordInboundEmail({ inbound, providerId: workProviderId, classification });

    await dataApi.recordAudit({
      action: 'inbound_classified',
      summary: `triage ${category}/${classification.subtype} (conf ${classification.confidence})`,
    });

    ctx.log(
      JSON.stringify({
        evt: 'classifyInbound',
        messageId: inbound.messageId,
        category,
        subtype: classification.subtype,
      }),
    );
    return classification;
  },
});

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
import { describeEvidence, INBOUND_CATEGORIES, type InboundCategory } from '@cs/domain';
import { callClassifyEmail } from '../../lib/functions-client.js';
import { dataApi } from '../../lib/data-api.js';
import type { InboundEnvelope } from './fetchMessage.js';

/** Re-exported for callers that import it from this module (unchanged import site) —
 *  single-sourced from `@cs/domain`'s DTO union (see KNOWN_CATEGORIES below for why). */
export type { InboundCategory };

interface ClassifyInboundInput {
  inbound: InboundEnvelope;
  workProviderId?: string;
  matchState?: 'matched' | 'unmatched' | 'ambiguous';
}

export interface InboundClassification {
  category: InboundCategory;
  subtype: string;
  confidence: number;
  signals: string[];
  bodyVrm: string;
  bodyCaseref: string;
  /** Provider job/claim reference the engine surfaces — the triage-policy ref-gate's
   *  job-ref signal (rules-engine-v2 Phase 2 / ADR-0019, activity 1.55: closes TKT-023). */
  bodyJobref?: string;
  /** Reply about existing work (#3) — drives the open-case link path. Default false. */
  isReply: boolean;
  /** Which taxonomy vintage produced this row (v1 today; v2 once the DDL-gated engine tag
   *  ships — adds case_update/cancellation). Absent = v1 (today's live parser). Carried
   *  through to the triage-policy activity (1.55) for decision telemetry only —
   *  classification/routing never branches on it. */
  taxonomyVersion?: number;
}

/** providerMatch outcome -> the classifier's provider_match_state vocab (one|none|ambiguous). */
const MATCH_STATE_TO_CLASSIFIER: Record<string, string> = {
  matched: 'one',
  unmatched: 'none',
  ambiguous: 'ambiguous',
};

/** Every category Stage A may emit, v1 + v2 (taxonomy-v2 additions: case_update,
 *  cancellation — rules-engine-v2 Phase 2 / ADR-0019). Single-sourced from
 *  `@cs/domain`'s `INBOUND_CATEGORIES` DTO list rather than a hand-duplicated array, so
 *  this activity can never again silently coerce a real v2 category down to 'other' —
 *  which, before this fix, would have quietly defeated `decideTriage`'s cancellation rung
 *  (rung 2 only fires on `classification.category === 'cancellation'`) the moment the
 *  taxonomy-v2 engine tag ships. */
const KNOWN_CATEGORIES = new Set<InboundCategory>(INBOUND_CATEGORIES);

function domainOf(address: string): string {
  const at = address.lastIndexOf('@');
  return at >= 0 ? address.slice(at + 1).toLowerCase().trim() : '';
}

/** Attachment evidence-class list for an envelope (D10 — the SAME `describeEvidence` rule
 *  classifyPersist uses to persist evidence), exported so the triage-policy activity
 *  (1.55) can derive `imagesOnly`/`attachmentKinds` without re-deriving the mapping —
 *  classification and triage policy must never disagree about what an attachment IS. */
export function attachmentKindsOf(inbound: Pick<InboundEnvelope, 'attachments'>): string[] {
  return inbound.attachments.map((a) => describeEvidence(a.filename, a.contentType).evidenceClass);
}

/**
 * Pure construction of the `/classify-email` request from the inbound envelope +
 * provider-match outcome — split out from the activity handler so it is
 * unit-testable without the Durable activity harness. `attachmentFilenames`
 * mirrors `attachmentKinds`: the engine treats an absent/empty list as "no
 * attachments" (classify_email's list-when-provided contract), so sending `[]`
 * for a bare email is equivalent to omitting the field.
 */
export function buildClassifyRequest(
  inbound: InboundEnvelope,
  matchState?: 'matched' | 'unmatched' | 'ambiguous',
): Parameters<typeof callClassifyEmail>[0] {
  const attachmentKinds = attachmentKindsOf(inbound);
  const attachmentFilenames = inbound.attachments.map((a) => a.filename);

  return {
    subject: inbound.subject,
    body: inbound.body,
    from: inbound.senderAddress,
    senderDomain: domainOf(inbound.senderAddress),
    providerMatchState: MATCH_STATE_TO_CLASSIFIER[matchState ?? 'unmatched'] ?? 'none',
    attachmentKinds,
    attachmentFilenames,
    hasAttachments: inbound.attachments.length > 0,
    inReplyTo: inbound.inReplyTo,
    references: inbound.references,
  };
}

df.app.activity('classifyInbound', {
  handler: async (input: ClassifyInboundInput, ctx): Promise<InboundClassification> => {
    const { inbound, workProviderId, matchState } = input;

    const res = await callClassifyEmail(buildClassifyRequest(inbound, matchState));

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
      bodyJobref: res.body_jobref ?? '',
      isReply: res.is_reply ?? false,
      taxonomyVersion: res.taxonomy_version,
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

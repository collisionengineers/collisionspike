/** inbound-identity — cohesive Data API module. */

import { TERMINAL_STATUSES, type CaseStatus } from '@cs/domain';
import { automationModeCodec, caseStatusCodec } from '@cs/domain/codecs';
import { type TxQuery } from '../../../platform/db/client.js';
import { type Row } from '../../../shared/mapping/index.js';

export interface InboundEnvelope {
  messageId: string;
  internetMessageId: string;
  /** Immutable message id returned by Graph for same-mailbox move stability. */
  graphMessageId?: string;
  /** Graph's authoritative Outlook-on-the-web target. Persisted only after the
   *  shared safety validator accepts its scheme and host. */
  outlookWebLink?: string;
  subject: string;
  senderAddress: string;
  receivedAt: string;
  sourceMailbox: string;
  payloadHash: string;
  candidateVrm: string;
  candidateRef: string;
  body?: string;
  bodyPreview?: string;
  /** Graph conversationId (services/orchestration/src/workflows/intake/fetchMessage.ts's
   *  InboundEnvelope carries the same field name) — rules-engine-v2 Phase 2 LOCAL thread
   *  correlation only. Optional: absent on any caller still on the pre-Phase-2 envelope
   *  shape. Persisted SCHEMA-TOLERANTLY by upsertInboundEmail (see schema-introspect.ts) —
   *  a no-op until the 2026-07-02 DDL delta adds inbound_email.conversation_id. */
  conversationId?: string;
  attachments: Array<{ filename: string; contentType: string; blobPath: string; size: number }>;
}

export interface ExistingSourceMessageCase {
  caseId: string;
  casePo: string | null;
  providerAutomationMode: 'manual' | 'review_auto' | 'full_auto';
  status: CaseStatus;
  replayAllowed: boolean;
}

export async function exactCaseForSourceMessage(
  q: TxQuery,
  sourceMessageId: string,
): Promise<ExistingSourceMessageCase | null> {
  const rows = await q<Row>(
    `SELECT c.id, c.case_po, c.status_code, wp.provider_automation_mode_code
       FROM case_ c
       LEFT JOIN work_provider wp ON wp.id = c.work_provider_id
      WHERE c.source_message_id = $1`,
    [sourceMessageId],
  );
  if (!rows[0]) return null;
  const status = caseStatusCodec.toName(rows[0].status_code) ?? 'error';
  return {
    caseId: rows[0].id as string,
    casePo: (rows[0].case_po as string | null) ?? null,
    providerAutomationMode:
      automationModeCodec.toName(rows[0].provider_automation_mode_code) ?? 'manual',
    status,
    replayAllowed: !TERMINAL_STATUSES.includes(status),
  };
}

export interface InboundClassificationDto {
  category: string;
  subtype: string;
  confidence: number;
  signals: string[];
  bodyVrm: string;
  bodyCaseref: string;
  /** Provider job/claim reference (email_classifier.py's `_job_reference` pass-through;
   *  services/orchestration/src/workflows/intake/classifyInbound.ts's InboundClassification
   *  carries the same field name). Optional for the same reason as conversationId above.
   *  Persisted SCHEMA-TOLERANTLY (inbound_email.body_jobref, same DDL delta). */
  bodyJobref?: string;
}

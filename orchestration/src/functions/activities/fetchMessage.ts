/**
 * orchestration/src/functions/activities/fetchMessage.ts  (A0)
 *
 * Durable activity: fetch the email message + file attachments from Microsoft Graph,
 * land the attachment bytes in Blob storage (cespkevidstdev01), and return a normalised
 * inbound envelope the subsequent activities consume (plan 22 §B).
 *
 * Idempotent: the blob path is deterministic (`{messageId}/{filename}`) so an at-least-once
 * replay overwrites the same bytes rather than duplicating; the envelope it returns is pure
 * over (message, attachments).
 *
 * App-settings: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, EVIDENCE_BLOB_CONNECTION.
 */

import { createHash } from 'node:crypto';
import * as df from 'durable-functions';
import { getMessageWithAttachments } from '../../lib/graph.js';
import { mailboxOfResource } from '../../lib/subscriptions.js';
import { uploadEvidenceBytes } from '../../lib/blob.js';

interface FetchMessageInput {
  messageId: string;
  resource?: string;
  subscriptionId?: string;
  tenantId?: string;
  receivedAt?: string;
}

/** The normalised inbound envelope — the contract between A0 and activities 1–6. */
export interface InboundEnvelope {
  messageId: string;
  internetMessageId: string;
  subject: string;
  senderAddress: string;
  receivedAt: string;
  /** Which of the three shared inboxes this arrived on (source_mailbox provenance). */
  sourceMailbox: string;
  /** SHA256 over normalised subject + from + sorted attachment (name,size) — dedup rung-1 key. */
  payloadHash: string;
  /** Best-effort VRM sniff from the subject (pre-parse; '' when none). */
  candidateVrm: string;
  /** Best-effort provider reference sniff from the subject (pre-parse; '' when none). */
  candidateRef: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    blobPath: string;
    size: number;
  }>;
}

const UK_VRM_RE = /\b([A-Z]{2}[0-9]{2}\s?[A-Z]{3}|[A-Z][0-9]{1,3}\s?[A-Z]{3}|[A-Z]{3}\s?[0-9]{1,3}[A-Z])\b/;

df.app.activity('fetchMessage', {
  handler: async (input: FetchMessageInput, ctx): Promise<InboundEnvelope> => {
    const mailbox = mailboxOfResource(input.resource ?? '');
    if (!mailbox) throw new Error(`fetchMessage: cannot derive mailbox from resource "${input.resource}"`);

    const { message, attachments } = await getMessageWithAttachments(mailbox, input.messageId);

    const landed: InboundEnvelope['attachments'] = [];
    for (const a of attachments) {
      const bytes = Buffer.from(a.contentBytes ?? '', 'base64');
      const up = await uploadEvidenceBytes(input.messageId, a.name, bytes, a.contentType);
      landed.push({ filename: a.name, contentType: a.contentType, blobPath: up.blobPath, size: up.size });
    }

    const subject = message.subject ?? '';
    const senderAddress = message.from?.emailAddress?.address ?? '';
    const payloadHash = hashPayload(subject, senderAddress, landed);
    const candidateVrm = sniffVrm(subject);

    const envelope: InboundEnvelope = {
      messageId: input.messageId,
      internetMessageId: message.internetMessageId ?? input.messageId,
      subject,
      senderAddress,
      receivedAt: message.receivedDateTime ?? input.receivedAt ?? new Date().toISOString(),
      sourceMailbox: mailbox,
      payloadHash,
      candidateVrm,
      candidateRef: '', // a provider reference is parser-confirmed later (step 4); '' pre-parse
      attachments: landed,
    };
    ctx.log(JSON.stringify({ evt: 'fetchMessage', messageId: input.messageId, mailbox, attachments: landed.length }));
    return envelope;
  },
});

function hashPayload(
  subject: string,
  from: string,
  attachments: Array<{ filename: string; size: number }>,
): string {
  const norm =
    subject.trim().toLowerCase() +
    '|' +
    from.trim().toLowerCase() +
    '|' +
    attachments
      .map((a) => `${a.filename.toLowerCase()}:${a.size}`)
      .sort()
      .join(',');
  return createHash('sha256').update(norm).digest('hex');
}

function sniffVrm(subject: string): string {
  const m = UK_VRM_RE.exec(subject.toUpperCase());
  return m ? m[1].replace(/\s+/g, '') : '';
}

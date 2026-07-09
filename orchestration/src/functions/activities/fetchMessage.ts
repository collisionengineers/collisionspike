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
import { getMessageWithAttachments, getMessageHeaders, getMessageRawMime } from '../../lib/graph.js';
import {
  mailboxOfResource,
  looksLikeMailboxAddress,
  resolveSubscriptionMailbox,
} from '../../lib/subscriptions.js';
import { uploadEvidenceBytes } from '../../lib/blob.js';
import { cleanEmailBodyForPreview, extractVrm } from '@cs/domain';

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
  /** Graph's thread-correlation id (default property set — capture-only; persisted
   *  from Phase 2's DDL, which adds inbound_email.conversation_id). */
  conversationId?: string;
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
  /** Plain-text email body (Graph text representation, capped at BODY_CAP). '' when none. */
  body: string;
  /** Whitespace-collapsed body preview for the inbound_email triage row. */
  bodyPreview: string;
  /** RFC In-Reply-To header (reply detection, ADR-0015 / #3). '' when absent. */
  inReplyTo: string;
  /** RFC References header (reply detection, ADR-0015 / #3). '' when absent. */
  references: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    blobPath: string;
    size: number;
  }>;
  /**
   * The original message captured as raw MIME (Graph `$value`), landed in Blob as
   * `message.eml`. Persisted as email evidence + archived to the case Box folder
   * (box-sync ticket). Undefined when the `$value` fetch failed (best-effort; never
   * blocks intake).
   */
  rawEml?: {
    filename: string;
    contentType: string;
    blobPath: string;
    size: number;
  };
}

/** Cap the body carried through the durable envelope (keeps activity state bounded). */
const BODY_CAP = 20_000;
/** inbound_email.body_preview is a Memo(4000); keep the preview well under that. */
const BODY_PREVIEW_CAP = 3_500;

df.app.activity('fetchMessage', {
  handler: async (input: FetchMessageInput, ctx): Promise<InboundEnvelope> => {
    // Notifications canonicalise `resource` to Users/<object-id-GUID>/… — the GUID works for
    // the Graph fetches below but is useless provenance (TKT-054: every mailbox chip read
    // "Other source"). Prefer the address; else resolve the UPN via the subscription; else
    // fall back to the GUID (intake never blocks on provenance — old rows are backfillable).
    const parsedMailbox = mailboxOfResource(input.resource ?? '');
    let mailbox = parsedMailbox;
    let mailboxVia: 'resource' | 'subscription' = 'resource';
    if (!looksLikeMailboxAddress(parsedMailbox) && input.subscriptionId) {
      const resolved = await resolveSubscriptionMailbox(input.subscriptionId);
      if (resolved) {
        mailbox = resolved;
        mailboxVia = 'subscription';
      }
    }
    if (!mailbox) throw new Error(`fetchMessage: cannot derive mailbox from resource "${input.resource}"`);

    const { message, attachments } = await getMessageWithAttachments(mailbox, input.messageId);
    // Reply-detection headers (failure-tolerant; {} on error → RE: subject fallback in classifier).
    const headers = await getMessageHeaders(mailbox, input.messageId);

    const landed: InboundEnvelope['attachments'] = [];
    for (const a of attachments) {
      const bytes = Buffer.from(a.contentBytes ?? '', 'base64');
      const up = await uploadEvidenceBytes(input.messageId, a.name, bytes, a.contentType);
      landed.push({ filename: a.name, contentType: a.contentType, blobPath: up.blobPath, size: up.size });
    }

    // Capture the ORIGINAL message as raw MIME (`.eml`) so the case archive holds
    // the email itself, not just its attachments (box-sync ticket). Best-effort: a
    // `$value` failure must never block intake — we just omit rawEml.
    let rawEml: InboundEnvelope['rawEml'];
    try {
      const mime = await getMessageRawMime(mailbox, input.messageId);
      const emlUp = await uploadEvidenceBytes(input.messageId, 'message.eml', mime, 'message/rfc822');
      rawEml = {
        filename: 'message.eml',
        contentType: 'message/rfc822',
        blobPath: emlUp.blobPath,
        size: emlUp.size,
      };
    } catch (e) {
      ctx.warn(`[fetchMessage] raw .eml capture failed for ${input.messageId}: ${e instanceof Error ? e.message : String(e)}`);
    }

    const subject = message.subject ?? '';
    const senderAddress = message.from?.emailAddress?.address ?? '';
    const payloadHash = hashPayload(subject, senderAddress, landed);
    // Body: Graph returns the text representation (Prefer header in getMessageWithAttachments);
    // fall back to the 255-char bodyPreview. Capped to keep the durable envelope bounded.
    const body = (message.body?.content ?? message.bodyPreview ?? '').slice(0, BODY_CAP);
    // TKT-070: a READABLE multi-line preview — line breaks preserved, signature/link/legal
    // garbage stripped (was `replace(/\s+/g, ' ')`, one run-on line). PREVIEW ONLY: the
    // full `body` below stays untouched for the VRM sniff + parser inputs.
    const bodyPreview = cleanEmailBodyForPreview(body).slice(0, BODY_PREVIEW_CAP);
    // VRM sniff spans subject + body — a body-only instruction carries the reg in the text.
    // Canonical shared ruleset (@cs/domain) — postcode/junk-guarded (B8/LS8/BOX2 rejected).
    const candidateVrm = extractVrm(`${subject}\n${body}`);

    const envelope: InboundEnvelope = {
      messageId: input.messageId,
      internetMessageId: message.internetMessageId ?? input.messageId,
      conversationId: message.conversationId ?? '',
      subject,
      senderAddress,
      receivedAt: message.receivedDateTime ?? input.receivedAt ?? new Date().toISOString(),
      sourceMailbox: mailbox,
      payloadHash,
      candidateVrm,
      candidateRef: '', // a provider reference is parser-confirmed later (step 4); '' pre-parse
      body,
      bodyPreview,
      inReplyTo: headers['in-reply-to'] ?? '',
      references: headers['references'] ?? '',
      attachments: landed,
      ...(rawEml ? { rawEml } : {}),
    };
    ctx.log(JSON.stringify({ evt: 'fetchMessage', messageId: input.messageId, mailbox, mailboxVia, attachments: landed.length, eml: Boolean(rawEml) }));
    return envelope;
  },
});

/** Exported for the retro reconstruction envelope builders (ADR-0022 R2 —
 *  lib/retro-envelope.ts): a reconstructed original must hash EXACTLY like a live
 *  arrival so dedup rung-1 keys stay comparable. */
export function hashPayload(
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


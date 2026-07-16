/** *
 * Queue trigger: drains 'sent-messages' (fed ONLY by graph-webhook-sent.ts, which is fed
 * ONLY by the gated SentItems Graph subscriptions — nothing reaches here while
 * DONE_SENT_EMAIL_ENABLED is off).
 *
 * Per sent message (all decision logic is PURE in lib/sent-items.ts — unit-tested):
 *   1. gate re-check (belt-and-braces; off → traced drop);
 *   2. resolve the mailbox (resource UPN, else subscription lookup — the fetchMessage
 *      doctrine) and $select-fetch the sent message from Graph (rides the existing
 *      Exchange-RBAC Mail.Read grant — Sent Items is in the same mailbox scope);
 *   3. match to+cc recipients against the work-provider corpus via the SAME
 *      `matchProviderByDomain` rule intake uses (exact domain / exact address; ambiguity
 *      never picks) — no provider-matched recipient → traced no-op;
 *   4. resolve candidate cases: conversationId → inbound_email.conversation_id →
 *      case ids (the triageContext machinery), fallback Case/PO or VRM parsed from the
 *      subject; hydrate ALL candidates through the STATUS-AGNOSTIC
 *      /api/internal/cases/lookup (triage/context's open-case match excludes terminals —
 *      the detector's targets sit in the terminal `eva_submitted`);
 *   5. decideSentItemsDone: exactly ONE case that is `eva_submitted` AND belongs to a
 *      matched recipient's provider → markDone(caseId, 'sent_email', to+subject snippet).
 *      Zero or ambiguous → no-op with a trace, never a guess.
 *
 * Idempotency: the API's `WHERE status_code = eva_submitted` guard makes a queue retry /
 * duplicate notification a `{ updated: false }` no-op — no local state. Transient
 * Graph/Data API failures are rethrown so the queue retries (poison queue after the
 * host's maxDequeueCount); expected no-resolve paths return quietly with a trace.
 */

import { app, type InvocationContext } from '@azure/functions';
import { gates } from '@cs/domain/gates';
import { dataApi } from '../../adapters/data-api.js';
import { graphFetch } from '../../adapters/graph.js';
import {
  mailboxOfResource,
  looksLikeMailboxAddress,
  resolveSubscriptionMailbox,
} from '../../platform/subscriptions.js';
import {
  buildSentEmailDetail,
  decideSentItemsDone,
  extractRecipientAddresses,
  extractSubjectKeys,
  matchProviderRecipients,
} from '../../platform/sent-items.js';

interface SentQueueItem {
  messageId: string;
  subscriptionId?: string;
  resource?: string;
  receivedAt?: string;
}

interface SentGraphMessage {
  id?: string;
  subject?: string;
  conversationId?: string;
  internetMessageId?: string;
  sentDateTime?: string;
  from?: { emailAddress?: { address?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { address?: string } }>;
}

app.storageQueue('sent-items-processor', {
  queueName: 'sent-messages',
  connection: 'AzureWebJobsStorage',
  handler: async (item: unknown, ctx: InvocationContext): Promise<void> => {
    // Queue trigger auto-deserializes JSON; accept both forms (intake-starter doctrine).
    const msg = (typeof item === 'string' ? JSON.parse(item) : item) as SentQueueItem;

    if (!gates.doneSentEmail()) {
      ctx.log('[sent-items] DONE_SENT_EMAIL_ENABLED off — dropped queued notification');
      return;
    }
    if (!msg.messageId) {
      ctx.warn('[sent-items] queue item without messageId — dropped');
      return;
    }

    // Mailbox: notification resource is canonicalised (Users/<GUID>/…) — prefer the
    // address, else resolve the UPN via the subscription (the fetchMessage doctrine).
    const parsed = mailboxOfResource(msg.resource ?? '');
    let mailbox = parsed;
    if (!looksLikeMailboxAddress(parsed) && msg.subscriptionId) {
      const resolved = await resolveSubscriptionMailbox(msg.subscriptionId);
      if (resolved) mailbox = resolved;
    }
    if (!mailbox) {
      ctx.warn(`[sent-items] cannot derive mailbox from resource "${msg.resource}" — dropped`);
      return;
    }

    // Fetch the sent message. A 404 (hard-deleted since the notification) is a settled
    // drop; anything else rethrows so the queue retries.
    let message: SentGraphMessage;
    try {
      message = await graphFetch<SentGraphMessage>(
        `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(msg.messageId)}` +
          `?$select=subject,from,toRecipients,ccRecipients,conversationId,internetMessageId,sentDateTime`,
      );
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (m.includes('→ 404')) {
        ctx.log(`[sent-items] sent message ${msg.messageId} gone (404) — dropped`);
        return;
      }
      throw e;
    }

    // (3) Recipient → provider match (pure; the intake corpus + rule).
    const recipients = extractRecipientAddresses(message);
    if (recipients.length === 0) {
      ctx.log('[sent-items] no recipients on sent message — no-op');
      return;
    }
    const { providers } = await dataApi.providerMatchRecords();
    const providerHits = matchProviderRecipients(recipients, providers);
    if (providerHits.length === 0) {
      ctx.log(JSON.stringify({ evt: 'sent-items-no-op', reason: 'no_provider_recipient', recipients: recipients.length }));
      return;
    }

    // (4) Candidate cases: conversation thread first, subject keys as fallback.
    const subjectKeys = extractSubjectKeys(message.subject);
    let siblingCaseIds: string[] = [];
    if (message.conversationId) {
      const triage = await dataApi.triageContext({ conversationId: message.conversationId });
      siblingCaseIds = triage.conversationSiblingCaseIds ?? [];
    }
    const lookup = await dataApi.casesLookup({
      ...(siblingCaseIds.length > 0 ? { caseIds: siblingCaseIds } : {}),
      ...(subjectKeys.casePo ? { casePo: subjectKeys.casePo } : {}),
      ...(subjectKeys.vrm ? { vrm: subjectKeys.vrm } : {}),
    });

    // (5) The pure conservative decision + the guarded transition.
    const decision = decideSentItemsDone(lookup.cases ?? [], providerHits);
    if (decision.kind !== 'mark_done') {
      ctx.log(JSON.stringify({
        evt: 'sent-items-no-op',
        reason: decision.reason,
        candidateCount: decision.candidateCount,
        conversationSiblings: siblingCaseIds.length,
        subjectCasePo: subjectKeys.casePo,
        subjectVrm: subjectKeys.vrm ? 'present' : '',
      }));
      return;
    }
    const detail = buildSentEmailDetail(decision.recipient, message.subject);
    const result = await dataApi.markDone(decision.caseId, 'sent_email', detail);
    ctx.log(JSON.stringify({
      evt: 'sent-items-mark-done',
      caseId: decision.caseId,
      casePo: decision.casePo,
      updated: result.updated, // false = the WHERE guard no-opped (already done / not eva_submitted)
    }));
  },
});

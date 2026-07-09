/**
 * orchestration/src/lib/sent-items.ts — PURE helpers for the gated sent-email-to-provider
 * `done` detector (TKT-095 detector (a) / ADR-0023). Zero I/O; unit-tested offline
 * (sent-items.test.ts). The queue processor (functions/sent-items-processor.ts) supplies
 * the fetched Graph message + the Data API lookups and applies the decision.
 *
 * Doctrine: SUGGESTION-GRADE CONSERVATIVE. The detector only marks a case done when
 *   (1) a sent message's RECIPIENT matches a work provider via the SAME
 *       `matchProviderByDomain` corpus rule intake uses (exact domain / exact address,
 *       ambiguity never picks), AND
 *   (2) exactly ONE candidate case resolves (conversation thread first, Case/PO or VRM
 *       in the subject as fallback) that is BOTH in `eva_submitted` AND belongs to that
 *       matched provider.
 * No resolve → no-op with a trace, never a guess. The server-side
 * `WHERE status_code = eva_submitted` guard on mark-done is the final backstop.
 */

import {
  CASE_PO_SHAPE_RE,
  extractVrm,
  matchProviderByDomain,
  normalizeCasePo,
  type ProviderMatchRecord,
} from '@cs/domain';

/** The recipient-bearing subset of a Graph sent message (to + cc). */
export interface SentMessageRecipients {
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { address?: string } }>;
}

/** One case row from the Data API's status-agnostic lookup (internal/cases/lookup). */
export interface CaseLookupRow {
  caseId: string;
  casePo: string;
  status: string;
  workProviderId: string;
  vrm: string;
}

/** A recipient that matched a work provider (exact domain / exact address). */
export interface ProviderRecipientHit {
  workProviderId: string;
  recipient: string;
}

/** Lower-cased, de-duplicated to+cc recipient addresses of a sent message. */
export function extractRecipientAddresses(msg: SentMessageRecipients): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of [...(msg.toRecipients ?? []), ...(msg.ccRecipients ?? [])]) {
    const addr = (r?.emailAddress?.address ?? '').trim().toLowerCase();
    if (addr && !seen.has(addr)) {
      seen.add(addr);
      out.push(addr);
    }
  }
  return out;
}

/**
 * Match every recipient against the provider corpus with the SAME rule intake uses
 * (`matchProviderByDomain`: exact address beats exact domain; ambiguity never picks).
 * Returns one hit per matched recipient; an unmatched or ambiguous recipient simply
 * contributes nothing (conservative).
 */
export function matchProviderRecipients(
  recipients: readonly string[],
  providers: readonly ProviderMatchRecord[],
): ProviderRecipientHit[] {
  const hits: ProviderRecipientHit[] = [];
  for (const recipient of recipients) {
    const result = matchProviderByDomain(recipient, providers);
    if (result.outcome === 'matched' && result.workProviderId) {
      hits.push({ workProviderId: result.workProviderId, recipient });
    }
  }
  return hits;
}

/**
 * Fallback resolution keys from a sent message's SUBJECT: the first Case/PO-shaped
 * token (normalised) + the canonical VRM sniff. Both '' when absent.
 */
export function extractSubjectKeys(subject: string | null | undefined): {
  casePo: string;
  vrm: string;
} {
  let casePo = '';
  for (const token of String(subject ?? '').split(/[\s,;:()[\]<>]+/)) {
    const norm = normalizeCasePo(token);
    if (norm && CASE_PO_SHAPE_RE.test(norm)) {
      casePo = norm;
      break;
    }
  }
  return { casePo, vrm: extractVrm(subject ?? '') };
}

/** The conservative decision outcome — either exactly one case to mark, or a traced no-op. */
export type SentItemsDecision =
  | { kind: 'mark_done'; caseId: string; casePo: string; recipient: string }
  | { kind: 'no_op'; reason: 'no_provider_recipient' | 'no_eligible_case' | 'ambiguous'; candidateCount: number };

/**
 * The core pure decision (TKT-095 detector (a)): given the candidate cases (already
 * status-agnostic, from conversation siblings + subject-key lookup) and the
 * provider-matched recipients, mark done ONLY when exactly one distinct case is both
 * `eva_submitted` and owned by a matched provider. Anything else is a traced no-op.
 */
export function decideSentItemsDone(
  cases: readonly CaseLookupRow[],
  providerHits: readonly ProviderRecipientHit[],
): SentItemsDecision {
  if (providerHits.length === 0) {
    return { kind: 'no_op', reason: 'no_provider_recipient', candidateCount: 0 };
  }
  const recipientByProvider = new Map<string, string>();
  for (const h of providerHits) {
    if (!recipientByProvider.has(h.workProviderId)) {
      recipientByProvider.set(h.workProviderId, h.recipient);
    }
  }
  const eligibleById = new Map<string, CaseLookupRow>();
  for (const c of cases) {
    if (c.status === 'eva_submitted' && c.workProviderId && recipientByProvider.has(c.workProviderId)) {
      eligibleById.set(c.caseId, c);
    }
  }
  if (eligibleById.size === 1) {
    const [c] = eligibleById.values();
    return {
      kind: 'mark_done',
      caseId: c.caseId,
      casePo: c.casePo,
      recipient: recipientByProvider.get(c.workProviderId) ?? '',
    };
  }
  return {
    kind: 'no_op',
    reason: eligibleById.size === 0 ? 'no_eligible_case' : 'ambiguous',
    candidateCount: eligibleById.size,
  };
}

/** The audit `detail` string for a sent_email mark-done (recipient + subject snippet). */
export function buildSentEmailDetail(recipient: string, subject: string | null | undefined): string {
  const snip = String(subject ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return `to=${recipient}${snip ? `; subject=${snip}` : ''}`;
}

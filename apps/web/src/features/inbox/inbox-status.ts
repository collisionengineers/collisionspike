/* ============================================================
   inbox-status — PURE status-cell model for the single-list inbox
   (TKT-054 / 020726 E4). No React — Inbox.tsx renders the model.

   Precedence (each rung beats everything below it):
     dismissed            terminal, hidden by default behind the toggle
     caseId present       the row's real meaning is its case — a LINK, split
                          case-created (receiving work) vs linked (the rest)
     attention            a pipeline outcome that needs a person (TKT-119c/034):
                          unable_to_locate / images_no_match — only while UNLINKED
     new                  genuinely unsorted (amber, icon+text — 010726 D4)
     actioned             handled in place (muted row)
     routed w/o caseId    data gap: linked once but the case id is missing
   ============================================================ */

import type { InboundAttentionReason, InboundEmail } from '@cs/domain';

export type InboxStatusModel =
  | { kind: 'dismissed' }
  | { kind: 'case-created'; caseId: string; casePo?: string }
  | { kind: 'linked'; caseId: string; casePo?: string }
  | { kind: 'attention'; reason: InboundAttentionReason }
  | { kind: 'new' }
  | { kind: 'handled' }
  | { kind: 'linked-unresolved' };

export function inboxStatus(
  e: Pick<InboundEmail, 'triageState' | 'caseId' | 'category' | 'casePo' | 'attentionReason'>,
): InboxStatusModel {
  if (e.triageState === 'dismissed') return { kind: 'dismissed' };
  if (e.caseId) {
    const po = e.casePo ? { casePo: e.casePo } : {};
    return e.category === 'receiving_work'
      ? { kind: 'case-created', caseId: e.caseId, ...po }
      : { kind: 'linked', caseId: e.caseId, ...po };
  }
  // A later case link (above) or a dismissal supersedes the attention flag; a
  // handled/actioned row keeps it visible — "handled" does not answer "where is
  // this case?", and the operator asked for an explicit terminal state.
  if (e.attentionReason === 'unable_to_locate' || e.attentionReason === 'images_no_match') {
    return { kind: 'attention', reason: e.attentionReason };
  }
  if (e.triageState === 'new') return { kind: 'new' };
  if (e.triageState === 'actioned') return { kind: 'handled' };
  return { kind: 'linked-unresolved' }; // routed with no caseId
}

/** The visible status text; the "→" arrow is presentation (aria-hidden in JSX). */
export function inboxStatusText(m: InboxStatusModel): string {
  switch (m.kind) {
    case 'case-created':
      return m.casePo ? `Case created · ${m.casePo}` : 'Case created';
    case 'linked':
      return m.casePo ? `Linked to case · ${m.casePo}` : 'Linked to case';
    case 'attention':
      return m.reason === 'unable_to_locate' ? 'Unable to locate' : 'No matching case';
    case 'new':
      return 'New';
    case 'handled':
      return 'Handled';
    case 'dismissed':
      return 'Dismissed';
    case 'linked-unresolved':
      return 'Linked';
  }
}

/** The fuller one-liner for the attention states (preview pane / tooltips). */
export function attentionDetailText(reason: InboundAttentionReason): string {
  return reason === 'unable_to_locate'
    ? 'We could not find or rebuild a matching case from the mailbox or archive history. Please review this email and create or link the case by hand.'
    : 'These images did not match any case. Please review this email and link or file them by hand.';
}

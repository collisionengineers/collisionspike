---
id: TKT-222
title: Link every related mailbox email to a reconstructed retro case, not just the original instruction
status: backlog
priority: P1
area: intake
tickets-it-relates-to: [TKT-219, TKT-058, TKT-119, TKT-140]
research-link: docs/tickets/verify/TKT-219-retro-parallel-reconstruction/evidence/operator-note.md
plan: PLAN-004
---

# Link every related mailbox email to a reconstructed retro case, not just the original instruction

## Problem

A retro reconstruction (ADR-0022 / TKT-219) links exactly two emails to the new case: the trigger
and the recovered original instruction. Every OTHER email about the same matter that the `$search`
sweep can surface — provider replies, chasers, our own sent responses, later updates sitting in the
three mailboxes (including Deleted Items) — stays un-linked, so a reconstructed case opens with a
two-email history when the mailboxes hold the full correspondence. Operator directive 2026-07-16:
"should be searching for all linked e-mails as well — all related emails would need linking."

## Proposed change

PROPOSED (not built) — bounded backfill after a successful retro create (all three arms), and as a
follow-up lever for rung-1 links:

- New orchestration activity `retroLinkRelated` (gated `RETRO_CASE_ENABLED` +
  `RETRO_OUTLOOK_SEARCH_ENABLED`): re-run the bounded `$search` for the case's keys across the
  intake mailboxes, keep hits whose SUBJECT corroborates a key (conservative v1; body-corroborated
  linking can widen later), INCLUDE own-mailbox senders (our replies belong to the case),
  EXCLUDE the trigger + the reconstructed original, cap the batch (~25) and log truncation.
- Light Graph identity fetch per hit (`$select=internetMessageId,subject,from,receivedDateTime`) —
  `$search` does not return the RFC id the triage table is keyed on.
- New service-auth route `POST /api/internal/retro/link-related`: per row, upsert the
  `inbound_email` row linked to the case with a retro-provenance classification signal
  (`retro_related_linked`), honouring the NEVER RE-POINT guard (a row already carrying a case_id
  is left alone); one summary audit records linked/skipped counts.
- Orchestrator: invoke after `finishPersisted` on every successful create (box_source / combined /
  outlook_only), best-effort (a backfill hiccup never unwinds the case).

## Acceptance

- After a retro create, every subject-corroborated mailbox hit for the case keys (across all three
  mailboxes, own-sender included) is linked to the case, bounded and truncation-logged; the trigger
  and original are not double-processed; an email already linked to ANOTHER case is never re-pointed.
- Unit/generator tests cover: the corroboration filter, the never-re-point guard, own-sender
  inclusion, the cap, and orchestrator invocation on all three create arms.
- Live: one drained reconstruction shows >2 linked emails with `retro_related_linked` provenance
  recorded in verification.md.

## Research

Distilled 2026-07-16 from the operator directive (recorded in the TKT-219 operator note) and the
ADR-0022 amendment of the same date.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)

---
id: TKT-184
title: Treat automatic out-of-office replies as no action needed
status: backlog
priority: P2
area: email
tickets-it-relates-to: [TKT-006, TKT-038, TKT-081, TKT-093, TKT-119, TKT-170, TKT-191]
research-link: docs/tickets/backlog/TKT-184-out-of-office-no-action/evidence/info.md
plan: PLAN-004
---

# Treat automatic out-of-office replies as no action needed

## Problem
An automatic out-of-office reply was left as “Unidentified” and suggested for the general Other folder. These messages are machine-generated availability notices, do not need a case-handler response and must not open work merely because the subject repeats a client reference.

The classifier must distinguish a genuine automatic reply from a human message that happens to mention absence, and from other automated mail such as delivery failures that may require a different disposition.

## Evidence
- [Operator note](./evidence/info.md) — asks for easy identification of automatic/out-of-office mail and a no-action outcome.
- [Supplied automatic reply](<./evidence/Automatic reply RTA136072.001  -  Mr S H Azimi-Sayad.eml>) — subject begins “Automatic reply”, header Auto-Submitted is auto-generated, X-Auto-Response-Suppress is All, and the body states that the sender is out of the office.
- The repeated RTA136072.001 reference is inherited thread context, not new work. Existing non_actionable/acknowledgement handling provides the never-mint safety boundary but has no grounded out-of-office subtype.

## Proposed change
PROPOSED (not built): add an append-only out_of_office subtype under the existing non-actionable category, displayed to handlers as “No action needed · Out of office”. Recognise it from authoritative automatic-response headers plus corroborating subject/body signals, before generic reference-based update/query routing.

Keep any trusted thread/case association only as context. The message creates no task, reply suggestion, case, evidence change, status change or chaser.

## Acceptance
- **A1.** The supplied email classifies deterministically as non_actionable / out_of_office and displays “No action needed · Out of office”, not Unidentified, Other, Case query, Case update or Receiving work.
- **A2.** Strong transport evidence such as Auto-Submitted: auto-generated, X-Auto-Response-Suppress and standard automatic-reply headers is evaluated with corroborating automatic-reply/out-of-office text. A subject phrase or display name alone cannot force the category.
- **A3.** Human replies mentioning “out of office”, calendar invitations, delivery failures, mailbox-full notices, read receipts and automatic case-status messages are not swallowed by the rule; each follows its existing category or remains explicitly unresolved.
- **A4.** An out-of-office message never mints or reconstructs a case, changes case status/readiness, creates evidence/chaser work, or receives a reply-needed/urgent suggestion. A request quoted from the earlier human message does not override this invariant; that original message may be evaluated separately.
- **A5.** If a trusted thread relation identifies an existing case, the association may remain visible for context but still produces no action. Without a trusted relation, the message remains uncased and is never matched by reference/name guessing.
- **A6.** The category/subtype is represented consistently in domain codecs, database values, API filters/counts, classifier contracts and the inbox. Handler actions can mark it handled, and filing suggestions use the agreed no-action destination without moving mail automatically.
- **A7.** Replay, duplicate Graph delivery and classifier rerun are idempotent: one inbound message retains one classification/audit history and cannot generate delayed case work after it has been recognised as out of office.
- **A8.** The supplied fixture plus header-only, text-only, human-mention, delivery-failure, read-receipt, quoted-reference and trusted-thread cases are covered offline; signed-in proof shows the corrected label, no action controls and zero case mutation.

## Validation
- **Offline:** add the exact email to the triage corpus, header/body decision tests, negative automated-mail fixtures, no-mint routing tests, API taxonomy/filter tests and SPA label/action tests. Assert reply generation and case-create routes are never called.
- **Signed-in/live:** safely reprocess or probe the supplied message through the deployed classifier, then inspect it with an assigned staff account. Record the label/filter and absence of reply/case actions; corroborate no new case, evidence, chaser or status audit in Postgres.
- **Regression:** rerun acknowledgement, website enquiry, cancellation, case-update, reference-gate and Outlook filing suites, including messages whose subjects inherit real case references.

## Research
Distilled 2026-07-13 from the [operator note and original email](./evidence/). The sample provides strong standard automatic-response headers, so the rule does not need to rely on prose alone.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/info.md)
- [Supplied automatic reply](<./evidence/Automatic reply RTA136072.001  -  Mr S H Azimi-Sayad.eml>)

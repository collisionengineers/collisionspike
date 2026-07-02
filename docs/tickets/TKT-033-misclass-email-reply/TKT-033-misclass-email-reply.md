---
id: TKT-033
title: Simple reply to our query misclassified as new work
status: done
priority: P1
area: email
tickets-it-relates-to: [TKT-006, TKT-030]
research-link: docs/tickets/TKT-033-misclass-email-reply/evidence/operator-note.md
---

# Simple reply to our query misclassified as new work

## Problem
This email is a simple REPLY to a query we sent out, but it was misclassified (treated as new work rather than a reply to an outstanding query on an existing case). It shares the thread-scoping root cause with TKT-030 — the classifier reading the whole quoted chain rather than the specific received reply.

## Evidence
- `RE 30143 - Mussie Belay  -  BX67OEY  .eml` — the same thread/file as TKT-030 (case 30143, claimant Mussie Belay, reg BX67OEY). The newest segment is a short reply to our outbound query; the quoted history below it carries the original instruction text that drives the misclassification.

## Proposed change
PROPOSED: Recognise a short reply-to-our-query (RE-prefixed, references an existing case, replies to an outbound query we sent) and route it to the existing case as a query reply, not new work. Depends on the same thread-scoping fix as TKT-030 — classify only the newest received message segment, ignoring quoted chain history.

## Acceptance
- The sample reply does NOT classify as new work on re-intake.
- It is associated with the existing case / query rather than minting a new case.
- Classification reads only the newest received message segment, not the quoted chain.

## Research
Distilled 2026-06-30 from an operator drop-note (one of the `miscategorised-emails` triage corpus); raw material in [evidence/](./evidence/). No formal research pack yet.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)

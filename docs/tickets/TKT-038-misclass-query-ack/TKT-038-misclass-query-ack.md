---
id: TKT-038
title: Bare acknowledgement ('Thanks Ed') misclassified as query
status: backlog
priority: P2
area: email
tickets-it-relates-to: [TKT-006]
research-link: docs/tickets/TKT-038-misclass-query-ack/evidence/operator-note.md
---

# Bare acknowledgement ('Thanks Ed') misclassified as query

## Problem
An inbound email whose body is literally just "Thanks Ed" was classified as a **query**. It is a bare
acknowledgement / pleasantry, not a query — a false-positive query classification that creates noise in the
query queue.

## Evidence
File in `evidence/`:
- `RE Client Mrs Ruby Wiggett, Vehicle VOLKSWAGEN T-ROC LIFE TSI S-A DF72LVV, Our Ref 45391_1.eml` — an "RE:"
  reply on an existing thread (existing "Our Ref 45391_1") whose body is just "Thanks Ed", with no question or
  request.

## Proposed change
PROPOSED: Add a low-content / acknowledgement filter so a reply whose body reduces to a short pleasantry
("thanks", "thank you", "cheers", "noted") with no question or actionable request is treated as an
acknowledgement (no-action / close) rather than a query. Fold into the shared email-classification ruleset
(TKT-006). First-pass approach only — guard against suppressing replies that contain both thanks and a real
follow-up.

## Acceptance
- Re-intaking the "Thanks Ed" sample does **not** classify it as a query; it is treated as an acknowledgement /
  no-action.
- Replies that thank and also ask a question are still classified as queries (no over-suppression).

## Research
Distilled 2026-06-30 from an operator drop-note (one of the `miscategorised-emails` triage corpus); raw material in [evidence/](./evidence/). No formal research pack yet.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)

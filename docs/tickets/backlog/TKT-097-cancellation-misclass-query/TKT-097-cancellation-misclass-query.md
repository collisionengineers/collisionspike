---
id: TKT-097
title: Cancellation email misclassified as a case query
status: backlog
priority: P2
area: email
tickets-it-relates-to: [TKT-041, TKT-006, TKT-032]
research-link: docs/tickets/backlog/TKT-097-cancellation-misclass-query/evidence/operator-note.md
---

# Cancellation email misclassified as a case query

## Problem

A cancellation email ("RE Oakwood Scotland Solicitors – Instructions") was classified as a **case query**
when it is actually a **cancellation**. TKT-041 already built a `cancellation` taxonomy category (acting
live, eval-proven, awaiting a live-occurrence probe), so this is the missed **live occurrence**: a real
cancellation is still being caught by the query classifier instead of the cancellation lane.

## Evidence

- `evidence/operator-note.md` — "Listed as a case query but this is a cancellation".
- `evidence/RE Oakwood Scotland Soliciutors- Instructions.eml` — the misrouted cancellation email.
- Relates to TKT-041 (the cancellation-concept ticket) — its own 13-sample eval passed 12/13; this is a
  fresh sample from live intake.

## Proposed change

PROPOSED (not built):
- Treat this as the live-occurrence miss TKT-041 was awaiting: add the sample to the email eval corpus,
  and adjust the `cancellation` rule so it wins over the `query_existing_work` classifier for
  cancellation-language emails carrying a case ref.
- Audited re-route (propose close/hold, never auto-close — per TKT-041's staff-confirmed rule).

## Acceptance

- Live `/classify-email` on the sample returns `cancellation` (not `query_existing_work`).
- An eval-corpus regression pin is added so it can't silently regress.

## Research

Distilled 2026-07-07 from operator drop-note `to-distill/cancellation-miscagetorised/`; raw material in
[evidence/](./evidence). Extends the cancellation work in
[TKT-041](../../verify/TKT-041-cancelled-case/TKT-041-cancelled-case.md).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)

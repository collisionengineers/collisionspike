---
id: TKT-035
title: Information-request misclassification (placeholder)
status: backlog
priority: P3
area: email
tickets-it-relates-to: [TKT-006]
research-link: docs/tickets/backlog/TKT-035-misclass-information-request/evidence/operator-note.md
---

# Information-request misclassification (placeholder)

## Problem
The operator flagged an "information request" misclassification class alongside the other examples in the
`miscategorised-emails` triage corpus, but the source folder
(`spike-tickets-to-distill/miscategorised-emails/information-request/`) was **empty** at distillation time
(2026-06-30) — no sample `.eml` and no description. This ticket is a placeholder for that class. The operator
must supply a sample email plus a one-line description of the mis-routing before it can be specified or
reproduced.

## Evidence
`evidence/` contains **only** `operator-note.md` — there is no sample email yet. The note records that the
source folder was empty and that an "information request" example needs to be added by the operator.

## Proposed change
PROPOSED: Hold as a placeholder. Once the operator provides a sample, capture the actual vs expected category,
determine the distinguishing signal (subject/body cues that mark a pure information request rather than a new
case or query), and fold the rule into the classifier alongside the other email-classification cluster items
(TKT-006). No change can be designed until the sample exists.

## Acceptance
- Operator supplies a sample email (plus a one-line description of the mis-routing) so this class can be
  specified.
- Once supplied: the sample email re-intakes to the correct "information request" handling rather than the
  category it was wrongly routed to.

## Research
Distilled 2026-06-30 from an operator drop-note (one of the `miscategorised-emails` triage corpus); raw material in [evidence/](./evidence). No formal research pack yet.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)

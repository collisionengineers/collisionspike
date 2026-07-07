---
id: TKT-029
title: Case-summary email misclassified as new case
status: done
priority: P2
area: email
tickets-it-relates-to: [TKT-006]
research-link: docs/tickets/done/TKT-029-misclass-case-summary/evidence/operator-note.md
---

# Case-summary email misclassified as new case

## Problem
An email that is a daily *summary* of cases already sent over (yesterday) was classified as a NEW case and entered intake. It should not create a case — it is not actionable new work (we have already accepted those cases). The operator wants it treated as a query, or effectively "spam" in the soft sense (not true spam, just nothing to action).

## Evidence
- `New inspection requests.eml` — the inbound email, subject "New inspection requests", which reads as a recap/summary of previously-instructed cases rather than a single new instruction.
- `Credit_Repair_Engineer_Instruction_46203.2087640856.pdf` — attached instruction-style PDF that the classifier likely keyed on to decide "new case", reinforcing the false-positive.

## Proposed change
PROPOSED: Add a classifier signal that recognises a *summary / digest* email (multiple cases enumerated, "summary"/"requests"-style subject, references to work already received) and routes it to a query / non-actionable category instead of `new case` — so it does not mint a Case/PO or open intake. Surface it under the suggested-categories feature (TKT-006) rather than the new-work queue.

## Acceptance
- The sample `New inspection requests.eml` does NOT create a new case on re-intake.
- It is routed to a query / non-actionable category, not the new-work queue.
- A genuinely-new single instruction email is unaffected (no regression to true new-case detection).

## Research
Distilled 2026-06-30 from an operator drop-note (one of the `miscategorised-emails` triage corpus); raw material in [evidence/](./evidence). No formal research pack yet.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)

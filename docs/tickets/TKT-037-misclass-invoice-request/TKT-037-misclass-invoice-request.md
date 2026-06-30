---
id: TKT-037
title: Invoice request misclassified as new case
status: backlog
priority: P2
area: email
tickets-it-relates-to: [TKT-006]
research-link: docs/tickets/TKT-037-misclass-invoice-request/evidence/operator-note.md
---

# Invoice request misclassified as new case

## Problem
An inbound email was classified as a **new case**, but it is actually the provider requesting that we send the
**invoice** for work we already carried out. Treating an invoice/billing request as a new case spawns a
spurious case for completed work.

## Evidence
Files in `evidence/`:
- `Your Ref kbs26067 __ Our Ref 303671 .eml` — the inbound email. Body contains "Please provide the invoice",
  the explicit invoice-request cue.
- `Engineer Report.pdf` — an attached Collision Engineers report for the work already carried out, confirming
  this references completed work rather than a new engagement.

## Proposed change
PROPOSED: Add an invoice / billing-request class (or route to an existing non-new-case handling) so emails
whose body asks for an invoice ("please provide the invoice", "send the invoice", "invoice for ...") and which
reference an existing "Our Ref" / attach a prior Collision Engineers report are not classified as new cases.
The presence of our own report as an attachment plus an "Our Ref" already on file is a strong signal the work
is existing. Fold into the shared email-classification ruleset (TKT-006). First-pass approach only.

## Acceptance
- Re-intaking `Your Ref kbs26067 __ Our Ref 303671 .eml` does **not** create a new case; it routes to invoice /
  billing-request handling.
- An attached prior Collision Engineers report + an existing "Our Ref" is recognised as referencing completed
  work.

## Research
Distilled 2026-06-30 from an operator drop-note (one of the `miscategorised-emails` triage corpus); raw material in [evidence/](./evidence/). No formal research pack yet.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)

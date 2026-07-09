---
id: TKT-039
title: Report-support request misclassified as new case
status: done
priority: P2
area: email
tickets-it-relates-to: [TKT-006]
research-link: docs/tickets/done/TKT-039-misclass-query-report-support/evidence/operator-note.md
---

# Report-support request misclassified as new case

## Problem
An inbound email was classified as a **new case**, but it is actually a **query**: the sender is asking us to
provide arguments to support a report we already carried out. Treating it as a new case spawns a spurious case
for work that is already done and routes the request away from the query handling it needs.

## Evidence
Files in `evidence/`:
- `Client Mrs Ruby Wiggett, Vehicle VOLKSWAGEN T-ROC LIFE TSI S-A DF72LVV, Our Ref 45391_1.eml` — the inbound
  email (existing "Our Ref 45391_1") whose text requests supporting arguments for an existing report.
- `EngineersReport-V1.pdf` — an attached Collision Engineers-branded report, i.e. the report the query is
  about (work already carried out).

(Same case/vehicle as TKT-038's acknowledgement thread — Our Ref 45391_1.)

## Proposed change
PROPOSED: Classify emails that reference an existing report / "Our Ref" and ask for support, justification, or
arguments ("support the report", "provide arguments", "justify") as a query against an existing case rather
than a new case. An attached Collision Engineers-branded report plus an existing "Our Ref" is a strong
existing-work signal (shared with TKT-037's invoice case). Fold into the shared email-classification ruleset
(TKT-006). First-pass approach only.

## Acceptance
- Re-intaking the sample does **not** create a new case; it routes to query handling against the existing case.
- An attached Collision Engineers report + existing "Our Ref" is recognised as referencing completed work.

## Research
Distilled 2026-06-30 from an operator drop-note (one of the `miscategorised-emails` triage corpus); raw material in [evidence/](./evidence). No formal research pack yet.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)

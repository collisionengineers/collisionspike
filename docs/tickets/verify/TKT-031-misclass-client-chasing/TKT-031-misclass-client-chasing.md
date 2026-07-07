---
id: TKT-031
title: Client report-chaser misrouted to 'Other'
status: verify
priority: P2
area: email
tickets-it-relates-to: [TKT-006]
research-link: docs/tickets/verify/TKT-031-misclass-client-chasing/evidence/operator-note.md
---

# Client report-chaser misrouted to 'Other'

## Problem
An email from a client chasing a report for an existing job was categorised into "Other". It should be a query — it relates to an existing job and needs a query/follow-up route, not the catch-all "Other" bucket.

## Evidence
- `(EREF12) RTA on 15_06_2026  Mr Daniel James Page (Our Ref SAB_46286_1, Vehicle HN13XMO).eml` — a chase referencing an existing job (client ref SAB_46286_1, claimant Mr Daniel James Page, reg HN13XMO, RTA dated 15/06/2026). It carries existing-case identifiers yet landed in "Other".

## Proposed change
PROPOSED: Strengthen the classifier so chase emails carrying existing-job identifiers (client/own ref, claimant name, registration) are recognised as queries on an existing job and routed to the query category rather than falling through to "Other". Surface via the suggested-categories feature (TKT-006).

## Acceptance
- The sample email routes to the query category, not "Other", on re-intake.
- The existing-job identifiers (ref / claimant / reg) are recognised as the basis for the query route.

## Research
Distilled 2026-06-30 from an operator drop-note (one of the `miscategorised-emails` triage corpus); raw material in [evidence/](./evidence). No formal research pack yet.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)

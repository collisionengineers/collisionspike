---
id: TKT-030
title: Report-chaser misclassified as new work
status: backlog
priority: P1
area: email
tickets-it-relates-to: [TKT-006, TKT-033]
research-link: docs/tickets/TKT-030-misclass-chasing-report/evidence/operator-note.md
---

# Report-chaser misclassified as new work

## Problem
An email chasing for *our engineer's report* (on an existing job) was categorised as NEW work. The operator's suspected root cause: the classifier is scanning the ENTIRE email chain rather than the SPECIFIC received message — so the original instruction text buried lower in the thread makes a follow-up chase look like a fresh instruction.

## Evidence
- `RE 30143 - Mussie Belay  -  BX67OEY  .eml` — a reply ("RE ...") in an existing thread, chasing the report for case 30143 (claimant Mussie Belay, reg BX67OEY). The top message is a chase; the quoted history below it contains the original instruction language that likely triggered the new-work classification.

## Proposed change
PROPOSED: Scope classification to the SPECIFIC received message body (the newest segment) rather than the full quoted chain — strip/ignore quoted history when deciding category. Add/strengthen a "report-chaser on existing job" signal (RE-prefixed subject referencing an existing case number, chase phrasing) so it routes to a query/follow-up category, not new work. Thread-scoping is shared with TKT-033 (a reply on the same thread).

## Acceptance
- The sample `RE 30143 - Mussie Belay  -  BX67OEY  .eml` does NOT classify as new work on re-intake.
- It routes to a query / follow-up category.
- Classification reads only the newest received message segment, not quoted chain history.

## Research
Distilled 2026-06-30 from an operator drop-note (one of the `miscategorised-emails` triage corpus); raw material in [evidence/](./evidence/). No formal research pack yet.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)

---
id: TKT-032
title: 'Deferred: clarify routing for audatex + PCD-diminution emails'
status: blocked
priority: P3
area: email
tickets-it-relates-to: [TKT-006]
research-link: docs/tickets/blocked/TKT-032-misclass-defer-routing/evidence/operator-note.md
---

# Deferred: clarify routing for audatex + PCD-diminution emails

## Problem
The operator has DEFERRED these emails: their best routing, category, and downstream purpose are not yet clear. They are parked pending an operator decision on how each should be categorised and what action (if any) intake should take. BLOCKED on that operator routing decision before the ticket can be specified.

## Evidence
- `evidence/audatex-request/Our ref 575689.eml` + `evidence/audatex-request/BUNDLE.PDF` — an Audatex-related request (our ref 575689) with a bundled PDF; routing/purpose to be confirmed.
- `evidence/pcd-diminution/Our ref 576299.eml` + `evidence/pcd-diminution/16DL.pdf` + `evidence/pcd-diminution/16DL - Diminution - 2026-06-29_Manual.pdf` — a PCD / diminution-of-value email (our ref 576299) with source doc `16DL.pdf` and a manually-produced diminution report; routing/purpose to be confirmed.

## Proposed change
PROPOSED (pending operator): Hold both email types out of automatic new-case routing until the operator defines a category and downstream action for each (e.g. dedicated Audatex category, diminution-request category, or route-to-query). No classifier rule can be authored until the routing decision is made.

## Acceptance
- Operator has decided the category + downstream action for the Audatex-request type.
- Operator has decided the category + downstream action for the PCD-diminution type.
- A follow-up implementable ticket (or rules) can then be written from those decisions.

## Research
Distilled 2026-06-30 from an operator drop-note (one of the `miscategorised-emails` triage corpus); raw material in [evidence/](./evidence). No formal research pack yet.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)

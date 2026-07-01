---
id: TKT-051
title: PCH not identified — doc-content name + @pch-ltd.com senders both missed
status: backlog
priority: P2
area: intake
tickets-it-relates-to: [TKT-021, TKT-028]
research-link: docs/tickets/TKT-051-pch-connexus/evidence/operator-note.md
---

# PCH not identified — doc-content name + @pch-ltd.com senders both missed

## Problem (operator drop-note, verbatim in [evidence/operator-note.md](./evidence/operator-note.md))

Intake fails to identify PCH (**Performance Car Hire** — the name is present in the body of the
inspection-request document), and direct mails from `*@pch-ltd.com` senders aren't categorised as
PCH either.

## Wanted

Two fixes working together (ADR-0011): the parser's doc-content provider detection must map to a
real `work_provider_id` at case-resolve (doc content is the *primary* provider signal), and
`@pch-ltd.com` joins the provider's own match domains — while intermediary-routed traffic (Connexus,
TKT-021) resolves through the Image-Source intermediary map.

## Evidence

- `Enclosing Inspection Request to Engineers 2 (Collision Engineers Ltd)  577349.eml`
- `Inspection Request - Audit Report.DOC`
- `_EHR102814_Engineers Repair Images_08076836.pdf`, `_EHR102814_Plus_.pdf`, `_EHR102814_Plus_Report_.pdf`

## Delivery

Phase 3 of the [Rules Engine v2 plan](../../plans/rules_engine_v2_plan_9ba034c4.plan.md)
(identification upgrade).

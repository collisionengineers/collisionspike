---
id: TKT-130
title: needs_review cases belong in the Review queue — readiness wrongly piles everything into Not Ready
status: verify
priority: P1
area: intake
tickets-it-relates-to: [TKT-129, TKT-094, TKT-012]
research-link: docs/tickets/verify/TKT-130-review-queue-readiness/evidence/operator-note.md
plan: PLAN-003
---
# TKT-130 — needs_review cases belong in the Review queue — readiness wrongly piles everything into Not Ready

## Problem

Cases marked "Needs Review" are not appearing in the Review queue, and cases that are actually complete are being held as missing-fields. Example: A.QDOS26029 has all its images and (as an image-based-assessment provider case) should count as having an inspection address — it should be Ready for EVA. Instead everything piles into Not Ready.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — verbatim operator workstream item, 2026-07-08.
- Operator example: A.QDOS26029 — all images present, image-based provider, still shown with missing fields.
- LIVE_FACTS 2026-07-06 reverify: 52 cases moved needs_review -> missing_required_fields; zero reached ready_for_eva; inspection_address empty on ~171/173 was the gate.

## Proposed change

PROPOSED (not built): (1) queue routing — needs_review cases surface in the Review queue, not Not Ready; (2) readiness — with TKT-129, an image-based-assessment inspection value satisfies the inspection requirement so complete cases reach ready_for_eva; (3) re-evaluate live cases after the fix and record the queue movement.

## Acceptance

- A case in needs_review appears in the Review queue on the deployed SPA.
- An A.QDOS26029-shaped case (all images, image-based provider) evaluates to ready_for_eva after TKT-129.
- Live re-evaluation summary recorded (how many cases left Not Ready and where they went).

## Research

Distilled 2026-07-08 from the operator workstream note (see Evidence). 

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)

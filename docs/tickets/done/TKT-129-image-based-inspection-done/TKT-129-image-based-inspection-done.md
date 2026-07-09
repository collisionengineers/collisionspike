---
id: TKT-129
title: Image-based providers: inspection field must auto-complete as Done + fix the inverted wording
status: done
priority: P1
area: ui
tickets-it-relates-to: [TKT-109, TKT-079, TKT-130]
research-link: docs/tickets/done/TKT-129-image-based-inspection-done/evidence/operator-note.md
plan: PLAN-003
---
# TKT-129 — Image-based providers: inspection field must auto-complete as Done + fix the inverted wording

## Problem

For providers that always use Image Based Assessment the case page correctly notes the policy, but the inspection-address field still counts as not Done, blocking readiness. The note wording is also inverted: "This provider is usually recorded as Image Based Assessment — use the override below if the vehicle CANNOT be inspected in person" (the override is for when it CAN be inspected). The image-based providers should be auto-populated from the corpus evidence already obtained (QDOS/PCH/AX/SBL confirmed image-led).

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — verbatim operator workstream item, 2026-07-08.
- TKT-075 corpus run report: QDOS 99.9% / PCH 99.6% / AX 99.2% / SBL 99.5% image-based.
- TKT-109 (backlog) is the pre-fill sibling; TKT-079 built the informational note.

## Proposed change

PROPOSED (not built): for always_image_based providers, auto-satisfy the inspection requirement as "Image Based Assessment" (recorded value, not just a note), leaving a staff override to a physical address; correct the note wording; seed/confirm the always_image_based provider policy flags from the corpus evidence.

## Acceptance

- A case for an always_image_based provider (e.g. QDOS) shows the inspection field populated "Image Based Assessment" and marked Done without manual entry.
- Staff can still override to a physical address.
- The note wording is corrected (no inverted logic).
- always_image_based flags seeded for the evidenced providers; counts recorded in changes.md.
- Verified live on a QDOS case.

## Research

Distilled 2026-07-08 from the operator workstream note (see Evidence). 

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)

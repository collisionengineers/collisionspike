---
id: TKT-123
title: Rename "exclude (person reflection)" to "Exclude" + dismissible vision reflection warning on images
status: done
priority: P2
area: ui
tickets-it-relates-to: [TKT-016, TKT-064]
research-link: docs/tickets/done/TKT-123-exclude-label-reflection-warning/evidence/operator-note.md
plan: PLAN-003
---
# TKT-123 — Rename "exclude (person reflection)" to "Exclude" + dismissible vision reflection warning on images

## Problem

The image-exclusion control reads "exclude (person reflection)" — it should simply read "Exclude". Separately, when the vision classifier detects a person reflection on an image, the image should carry a warning flag that review staff can dismiss/ignore (the domain rule: any photo showing a person's reflection is unusable).

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — verbatim operator workstream item, 2026-07-08.
- TKT-064/TKT-016 built the vision classification that already emits person_reflection per image.

## Proposed change

PROPOSED (not built): (1) rename the control to "Exclude"; (2) render a warning badge on images the classifier flagged person_reflection=true, with a reviewer dismiss action that persists (dismissed flag stays off after reload); exclusion itself stays a manual staff decision.

## Acceptance

- The control label reads exactly "Exclude".
- An image flagged person_reflection shows a visible warning; the reviewer can dismiss it and the dismissal persists across reload.
- Verified live on a case with a flagged image (or a seeded/replayed one).

## Research

Distilled 2026-07-08 from the operator workstream note (see Evidence). 

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)

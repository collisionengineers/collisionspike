---
id: TKT-126
title: Export for EVA downloads a .zip of the JSON plus all the images
status: done
priority: P1
area: ui
tickets-it-relates-to: [TKT-124]
research-link: docs/tickets/done/TKT-126-eva-export-zip/evidence/operator-note.md
plan: PLAN-003
---
# TKT-126 — Export for EVA downloads a .zip of the JSON plus all the images

## Problem

The EVA export currently produces the JSON only. Staff need a single .zip download containing the 12-field EVA JSON and all the case images so the drag-drop submission is one artifact.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — verbatim operator workstream item, 2026-07-08.
- EVA photo-order rule: 2 preview photos (overview + main-damage closeup) first, then all photos in sequence including those two again; excluded images must not ship.

## Proposed change

PROPOSED (not built): make "Export for EVA" produce one .zip containing the EVA JSON and every included (non-excluded) image, named/ordered per the EVA photo-order rules. Client-side zip in the SPA if CSP allows, else an API zip route.

## Acceptance

- Clicking Export for EVA downloads a single .zip containing the 12-field JSON and all included images.
- Image order/naming honours the EVA photo-order rule (2 previews first, then the full sequence including those two again); excluded images absent.
- Verified live: a real case exports and the zip contents are inspected.

## Research

Distilled 2026-07-08 from the operator workstream note (see Evidence). 

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)

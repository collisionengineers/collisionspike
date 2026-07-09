---
id: TKT-124
title: Photo orderer shows .eml files — it must list images only
status: backlog
priority: P2
area: ui
tickets-it-relates-to: [TKT-126]
research-link: docs/tickets/backlog/TKT-124-photo-orderer-images-only/evidence/operator-note.md
plan: PLAN-003
---
# TKT-124 — Photo orderer shows .eml files — it must list images only

## Problem

.eml files (and potentially other non-image evidence) appear in the photo orderer, which exists purely to sequence photos for EVA. Only image evidence belongs there.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — verbatim operator workstream item, 2026-07-08.

## Proposed change

PROPOSED (not built): filter the photo-orderer list to image-kind evidence only (MIME/kind based, not filename), leaving other evidence visible in the general evidence list.

## Acceptance

- The photo orderer lists only images; .eml/PDF/doc evidence never appears there.
- Non-image evidence remains visible in the case evidence list.
- Verified live on a case that has .eml evidence.

## Research

Distilled 2026-07-08 from the operator workstream note (see Evidence). 

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence/)

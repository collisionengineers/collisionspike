---
id: TKT-103
title: Tractable "768.00" wrongly captured as the reference number
status: done
priority: P2
area: parsing
tickets-it-relates-to: [TKT-102, TKT-071, TKT-085]
research-link: docs/tickets/done/TKT-103-tractable-reference-bug/evidence/operator-note.md
---

# Tractable "768.00" wrongly captured as the reference number

## Problem

On Tractable items the classifier pulls **768.00** as the reference number — but that is a
monetary/estimate value, not a reference. This is a false-token capture in the same family as TKT-071
(HD4110 → VRM) and TKT-085 (OCTOBER → VRM), here on the Tractable layout's reference field.

## Evidence

- `evidence/operator-note.md` — "E-mail classifier also incorrectly pulling 768.00 as the reference —
  this is not a reference number."
- Shared samples live in the primary Tractable ticket:
  [TKT-102/evidence/tractableexamples/](../../now/TKT-102-tractable-received-handling/evidence-manifest.json)
  (`LINE_LEVEL_ESTIMATE.pdf`, `tractable.pdf`, `tractable2.pdf`, three "New completed lead…" `.eml`).

## Proposed change

PROPOSED (not built):
- Fix reference extraction so a currency/estimate figure (e.g. `768.00`) is never taken as the provider
  reference on the Tractable layout — anchor to a real reference label/shape, exclude decimal money
  values.
- Add a regression pin over the Tractable samples.

## Acceptance

- Parsing the Tractable samples yields the correct reference (or none), never `768.00`.
- Regression/eval pin covers the Tractable reference field.

## Research

Distilled 2026-07-07 from operator drop-note `to-distill/tractable-integration/`
(`tractable-received.md`). Split from [TKT-102](../../now/TKT-102-tractable-received-handling/TKT-102-tractable-received-handling.md)
(email handling) and [TKT-104](../../blocked/TKT-104-tractable-api-integration/TKT-104-tractable-api-integration.md)
(deferred API).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)

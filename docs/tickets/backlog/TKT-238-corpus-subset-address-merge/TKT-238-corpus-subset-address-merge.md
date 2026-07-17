---
id: TKT-238
title: Merge subset address rows into their full-address superset in the corpus build
status: backlog
priority: P2
area: platform
tickets-it-relates-to: [TKT-152]
research-link: docs/reviews/160726/decisions.md
---

# Merge subset address rows into their full-address superset in the corpus build

## Problem

Some EVA export rows missed the first address line, leaving only a road name and postcode, while other
rows carry the same site's full address. The corpus build keys on the exact
`(provider, name|line|postcode)` tuple (`scripts/evaluation/address/build_corpus.py:134-135,173`), so
the same place appears as separate suggestion rows and their frequencies split — the operator's
2+2-vs-4 example in Review 160726.

## Evidence

- [Review 160726 decision D14](../../../reviews/160726/decisions.md) — operator ruling: they are the
  same place and are to be merged.
- ADR-0016, Amendment — subset-address merge (2026-07-16).

## Proposed change

PROPOSED (not built):

- In the corpus build, collapse rows sharing a normalised address line and postcode into one entry
  labelled with the fullest form; frequencies sum.
- Preserve confirmed/operator-maintained rows unchanged per ADR-0016.
- Fixture-test the 2+2-vs-4 case: two subset rows plus two full rows for one site become one entry.

## Acceptance

- The rebuilt corpus contains one entry for a site whose export rows differ only by the missing first
  address line, with summed frequency and the fullest label.
- Existing corpus tests pass; the refresh remains backup-first, deterministic, and auditable.

## Research

Distilled 2026-07-17 from [Review 160726](../../../reviews/160726/decisions.md) (D14).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)

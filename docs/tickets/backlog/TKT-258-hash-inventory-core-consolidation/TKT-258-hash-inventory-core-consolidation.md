---
id: TKT-258
title: Consolidate the hash and path-normalize inventory core
status: backlog
priority: P2
area: platform
tickets-it-relates-to: [TKT-207, TKT-209, TKT-214, TKT-259, TKT-261]
research-link: docs/tickets/backlog/TKT-258-hash-inventory-core-consolidation/evidence/distillation-note.md
plan: PLAN-010
---

# Consolidate the hash and path-normalize inventory core

## Problem
Two inventory generators independently re-implement the same content-hash and path-normalize logic. The
inventory core is load-bearing for the governance ledgers, so a divergence there is expensive — a hashing or
normalisation change fixed in one generator and missed in the other silently corrupts a ledger.

## Evidence
Verified read-only 2026-07-19: `generate-repository-inventory.mjs` hashes the Git index and
`generate-checkout-inventory.mjs` walks the physical checkout; each carries its own `sha256File` and
path-normalisation. `reconcile-repository-reset.mjs` is **not** a third re-implementation — it already imports
the inventory reader (`readGitBlobMetadata`) and does prefix-move reconciliation. The three files'
classification maps (`categoryFor` / `ownerFor` / `lifecycleFor` and their baseline variants) are
**intentionally divergent** (pre-reset vs current layout) and must not be merged.

## Proposed change
Extract one shared core module holding `sha256File` and path-normalisation, consumed by both inventory
generators (index-based and physical-checkout); leave `reconcile-repository-reset.mjs` on the reader it already
imports. Do not touch the three divergent classification maps. The extraction changes structure only — the
generated ledgers must be byte-identical before and after.

## Acceptance
- **A1.** One shared module provides the content-hash and path-normalise primitives; both inventory generators
  import it and contain no local copy.
- **A2.** `docs/governance/repository-inventory.json` and the reconciliation ledger regenerate **byte-identical**
  to a pre-refactor snapshot (`check:inventory` and `check:reconciliation` pass; a diff shows zero change).
- **A3.** The three divergent classification maps are left intact and separate; `reconcile-repository-reset.mjs`
  is not restructured beyond the reader it already imports.
- **A4.** A unit test pins the shared core's output for each inventory mode.
- **A5.** No live write.

## Validation
- Snapshot the two ledgers, extract, regenerate, assert zero diff; run `check:inventory`,
  `check:reconciliation`, and the new core unit test; full `node verify-all.mjs`.

## Research
Distilled from `04-scripts-and-tooling-dedup.md` item 1, softened after read-only verification on 2026-07-19
(`PLAN-010.dossier`) established two cores (not three) and intentionally divergent classification maps. Gated
on full PLAN-006 close-out.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)

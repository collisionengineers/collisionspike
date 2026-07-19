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
Two inventory generators independently implement content hashing, and the checkout generator also carries a
local copy of repository-path normalisation. The inventory core is load-bearing for the governance ledgers, so
a change fixed in one hashing path and missed in another silently corrupts a ledger.

## Evidence
Verified read-only 2026-07-19: `generate-repository-inventory.mjs` hashes ordinary tracked blobs incrementally
inside `readGitBlobMetadata`, hashes physical files through its local `sha256File`, and hashes symlink bytes
directly. `generate-checkout-inventory.mjs` walks the physical checkout and carries its own `sha256File`,
direct-byte hash, and local `normalize`. `reconcile-repository-reset.mjs` is **not** a third inventory
implementation — it already imports `readGitBlobMetadata` and does prefix-move reconciliation. The three
files' classification policies are **intentionally divergent** (pre-reset, current tracked tree, and physical
checkout) and must not be merged.

## Proposed change
Extract one incremental SHA-256 primitive that can consume both `git cat-file --batch` chunks and filesystem
stream chunks, with byte and file helpers built on the same primitive. Both inventory generators consume it
and the existing `normalizeRepositoryPath` source; neither keeps a local hash or path-normalisation copy. Leave
`reconcile-repository-reset.mjs` on the reader it already imports and do not merge the three divergent
classification policies. The extraction changes structure only — generated ledgers must be byte-identical
before and after.

## Acceptance
- **A1.** One shared incremental content-hash primitive handles streamed Git-index blob chunks, filesystem
  streams, and direct bytes; both inventory generators import it and contain no local `createHash("sha256")`
  or `sha256File` implementation.
- **A2.** `docs/governance/repository-inventory.json` and the reconciliation ledger regenerate **byte-identical**
  to a pre-refactor snapshot (`check:inventory` and `check:reconciliation` pass; a diff shows zero change).
- **A3.** The three divergent classification maps are left intact and separate; `reconcile-repository-reset.mjs`
  is not restructured beyond the reader it already imports.
- **A4.** Both generators import `normalizeRepositoryPath` from its single shared source and contain no local
  path-normalisation implementation.
- **A5.** Unit tests prove identical SHA-256 output for the same bytes supplied as one buffer, multiple Git
  blob-style chunks, and a filesystem stream; generator-level tests pin each inventory mode.
- **A6.** The implementation records before/after owned-file and nonblank-line deltas for PLAN-010 close-out.
- **A7.** No live write.

## Validation
- Snapshot the two ledgers, extract, regenerate, assert zero diff; run `check:inventory`,
  `check:reconciliation`, the primitive tests, and both generator suites; report the structural delta; full
  `node verify-all.mjs`.

## Research
Distilled from `workingspace/architecture-simplification/04-scripts-and-tooling-dedup.md` item 1 and corrected
by direct inspection of `readGitBlobMetadata`, both `sha256File` implementations, both direct-byte hash paths,
and the three classification-policy groups on 2026-07-19. Gated on full PLAN-006 close-out.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)

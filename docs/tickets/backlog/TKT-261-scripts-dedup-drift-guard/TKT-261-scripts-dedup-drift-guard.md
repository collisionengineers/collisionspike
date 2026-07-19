---
id: TKT-261
title: Add the scripts-dedup single-source drift guard
status: backlog
priority: P3
area: platform
tickets-it-relates-to: [TKT-258, TKT-259, TKT-260]
research-link: docs/tickets/backlog/TKT-261-scripts-dedup-drift-guard/evidence/distillation-note.md
plan: PLAN-010
---

# Add the scripts-dedup single-source drift guard

## Problem
The consolidations in TKT-258–260 only hold if re-duplication fails a check. Without a guard, a future change
can re-implement the inventory hash core a third time or re-hard-code the generated-directory set, silently
restarting the drift this plan removes.

## Evidence
The duplication existed because nothing forbade it: two inventory cores, a drifted generated-directory set in
two checks, and a matcher algorithm mirrored across languages. The repository already runs an aggregate
checker (`verify-all.mjs`) and hosts checks under `scripts/checks/` with sibling `*.test.mjs` fixtures.

## Proposed change
Add a guard (import/reference-aware, not a naive text match) asserting the shared internals stay single-source:
the inventory hash primitive and existing path normaliser are imported from their authoritative shared modules
rather than re-implemented, and the generated-directory predicate and set are defined exactly once. Wire it
into `verify-all.mjs`, with independent negative fixtures for both guarded surfaces. Ship it last, after
TKT-258–260 land, so it passes on merge.

## Acceptance
- **A1.** A guard under `scripts/checks/` asserts the hash primitive and path normaliser are imported (not
  re-implemented) by the inventory generators, and that the generated-directory predicate and set each have a
  single definition.
- **A2.** The guard is import/reference-aware, not a lexical grep, and does not false-flag legitimate uses in
  tests or the shared modules themselves.
- **A3.** One negative fixture proves the guard fails on a synthetic re-implementation of the hash core.
- **A4.** A separate negative fixture proves the guard fails on a second generated-directory policy
  definition or bypass of the shared predicate.
- **A5.** The guard runs inside `node verify-all.mjs` and in CI.
- **A6.** The implementation records before/after owned-file and nonblank-line deltas for PLAN-010 close-out.
- **A7.** No live write.

## Validation
- Run the guard over the tree (expect pass, after TKT-258–260), over the hash re-implementation fixture
  (expect fail), and independently over the generated-directory-policy fixture (expect fail); confirm
  `verify-all.mjs` invokes it; report the structural delta; full `node verify-all.mjs`.

## Research
Distilled from `workingspace/architecture-simplification/04-scripts-and-tooling-dedup.md` verification section
and the series README's drift-avoidance rule: each deduplication needs a scoped guard that prevents the removed
copy from returning. This ticket owns PLAN-010's two guards directly. Gated on full PLAN-006 close-out.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)

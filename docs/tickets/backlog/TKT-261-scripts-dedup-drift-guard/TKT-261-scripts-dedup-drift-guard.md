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
the inventory hash + normalise primitives are imported from the one shared module rather than re-implemented,
and the generated-directory set is defined exactly once. Wire it into `verify-all.mjs`, with a negative fixture
proving it fails on a synthetic re-duplication. Ship it last, after TKT-258–260 land, so it passes on merge.

## Acceptance
- **A1.** A guard under `scripts/checks/` asserts the inventory hash/normalise core is imported (not
  re-implemented) by the inventory generators, and that the generated-directory set has a single definition.
- **A2.** The guard is import/reference-aware, not a lexical grep, and does not false-flag legitimate uses in
  tests or the shared modules themselves.
- **A3.** A negative fixture proves the guard fails on a synthetic re-implementation of the hash core or a
  second generated-directory set.
- **A4.** The guard runs inside `node verify-all.mjs` and in CI.
- **A5.** No live write.

## Validation
- Run the guard over the tree (expect pass, after TKT-258–260) and over the negative fixture (expect fail);
  confirm `verify-all.mjs` invokes it; full `node verify-all.mjs`.

## Research
Distilled from `04-scripts-and-tooling-dedup.md` verification section plus Gate 0 item 12 (each plan's final
ticket is an import/reference-aware forbidden-pattern guard). Generalised across all plans by PLAN-012. Gated
on full PLAN-006 close-out.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)

---
id: TKT-251
title: Add the server-runtime forbidden-pattern drift guard
status: backlog
priority: P1
area: platform
tickets-it-relates-to: [TKT-247, TKT-248, TKT-249, TKT-250]
research-link: docs/tickets/backlog/TKT-251-server-runtime-forbidden-pattern-guard/evidence/distillation-note.md
plan: PLAN-007
---

# Add the server-runtime forbidden-pattern drift guard

## Problem
Consolidation is only durable if re-introducing a local mint fails a check. Without a guard, a future change
can hand-roll a tenth `IDENTITY_ENDPOINT` mint and silently restart the drift this plan removes.

## Evidence
The nine-copy mint drift (TKT-248) existed precisely because no check forbade per-service token minting. The
repository already has an aggregate runner (`verify-all.mjs`) and a checks directory
(`scripts/checks/`) to host a new guard, and a production-dependency boundary check to build on.

## Proposed change
Add an AST/import-aware guard (not a lexical text match) asserting that `IDENTITY_ENDPOINT` and the
storage-audience token mint appear only inside `packages/server-runtime`, scoped to production TypeScript so
it never falsely rejects the Python services, tests, or documentation. Wire it into `verify-all.mjs`. Ship it
last, once TKT-248–250 have removed the existing copies, so it passes on merge.

## Acceptance
- **A1.** A guard exists under `scripts/checks/` that parses production TypeScript (import/AST-aware, not a
  lexical grep) and fails if `IDENTITY_ENDPOINT` or the storage-audience mint appears outside
  `packages/server-runtime`.
- **A2.** The guard is scoped to production TypeScript only; it does not flag the Python services, `/tests`,
  or Markdown, proven by a positive run over the current tree after TKT-248–250 land.
- **A3.** A negative fixture proves the guard fails on a synthetic re-introduction of a local
  `IDENTITY_ENDPOINT` mint outside the package.
- **A4.** The guard runs inside `node verify-all.mjs` and in CI.
- **A5.** No live deployment or cloud write.

## Validation
- Run the guard over the tree (expect pass) and over the negative fixture (expect fail); confirm it is invoked
  by `verify-all.mjs`; full `node verify-all.mjs` green.

## Research
Distilled from `01-server-runtime-foundation.md` (ticket 5, drift guard) and Gate 0 item 12 of the reconciled
review, which requires each plan's final ticket to be an import/AST-aware forbidden-pattern guard scoped to
production TypeScript (a lexical `IDENTITY_ENDPOINT` ban would falsely reject the Python services and docs).
This guard is generalised across all plans by PLAN-012.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)

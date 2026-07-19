---
id: TKT-251
title: Add the server-runtime forbidden-pattern drift guard
status: done
priority: P1
area: platform
tickets-it-relates-to: [TKT-247, TKT-248, TKT-249, TKT-250]
research-link: docs/tickets/done/TKT-251-server-runtime-forbidden-pattern-guard/evidence/distillation-note.md
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
Add an AST/import-aware guard (not a lexical text match) asserting that the managed-identity token-mint
surface appears only inside `packages/server-runtime`, scoped to production TypeScript so it never falsely
rejects the Python services, tests, or documentation. The surface is **two-pronged**, because TKT-248 may
prefer the `@azure/identity` SDK over the raw endpoint: (1) the raw-endpoint mint — `IDENTITY_ENDPOINT` and
the storage-audience token acquisition; and (2) SDK-based mints — constructing or importing
`ManagedIdentityCredential` / `DefaultAzureCredential` from `@azure/identity`, or otherwise acquiring a
managed-identity token, outside the package. A guard that watched only `IDENTITY_ENDPOINT` would miss a
`new ManagedIdentityCredential()` reintroduction, which mints an MI token without the app referencing
`IDENTITY_ENDPOINT` at all (Microsoft Learn: the SDK discovers the identity endpoint internally). Wire it into
`verify-all.mjs`. Ship it last, once TKT-248–250 have removed the existing copies, so it passes on merge.

## Acceptance
- **A1.** A guard exists under `scripts/checks/` that parses production TypeScript (import/AST-aware, not a
  lexical grep) and fails if the managed-identity mint surface appears outside `packages/server-runtime` —
  both the raw-endpoint form (`IDENTITY_ENDPOINT` / storage-audience mint) **and** the SDK form
  (`@azure/identity` `ManagedIdentityCredential` / `DefaultAzureCredential` construction or import, or MI-token
  acquisition).
- **A2.** The guard is scoped to production TypeScript only; it does not flag the Python services, `/tests`,
  or Markdown, proven by a positive run over the current tree after TKT-248–250 land.
- **A3.** Negative fixtures prove the guard fails on a synthetic re-introduction outside the package of
  **both** a raw-endpoint `IDENTITY_ENDPOINT` mint and an `@azure/identity` SDK mint
  (`new ManagedIdentityCredential()`).
- **A4.** The guard runs inside `node verify-all.mjs` and in CI.
- **A5.** No live deployment or cloud write.

## Validation
- Run the guard over the tree (expect pass) and over the negative fixture (expect fail); confirm it is invoked
  by `verify-all.mjs`; full `node verify-all.mjs` green.

## Research
Distilled from `01-server-runtime-foundation.md` (ticket 5, drift guard) and Gate 0 item 12 of the reconciled
review, which requires each plan's final ticket to be an import/AST-aware forbidden-pattern guard scoped to
production TypeScript (a lexical `IDENTITY_ENDPOINT` ban would falsely reject the Python services and docs).
This guard is intended for generalisation across the series by a later anti-drift plan (reserved as PLAN-012,
not yet authored); until that plan exists it stands on its own here.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)

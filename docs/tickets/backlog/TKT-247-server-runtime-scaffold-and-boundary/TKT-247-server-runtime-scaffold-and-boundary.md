---
id: TKT-247
title: Scaffold the server-runtime package and record its boundary
status: backlog
priority: P1
area: platform
tickets-it-relates-to: [TKT-210, TKT-248, TKT-249, TKT-250, TKT-251, TKT-246]
research-link: docs/tickets/backlog/TKT-247-server-runtime-scaffold-and-boundary/evidence/distillation-note.md
plan: PLAN-007
---

# Scaffold the server-runtime package and record its boundary

## Problem
There is no server-only shared workspace package, so both TypeScript services re-implement the same runtime
plumbing (managed-identity token mint, Data-API HTTP core, retry, storage token). `@cs/domain` cannot host it:
its README forbids runtime-adapter, database-client and cloud-SDK imports so the browser app can consume it.
The consolidation in this plan needs a home before any call site can migrate.

## Evidence
`packages/` contains exactly one package (`domain`); `package.json` workspaces are `packages/*`, `apps/*`,
`services/data-api`, `services/orchestration`. `@cs/domain`'s README states it "must not depend on a runtime
adapter, database client, or cloud SDK." No `packages/server-runtime` or equivalent exists. Verified
read-only 2026-07-19 (see research link).

## Proposed change
Create `packages/server-runtime` (`@cs/server-runtime`) as a server-only, SDK-allowed workspace member with
build wiring, a test harness, and an ownership README (contract, callers, tests). Author **ADR-0031**
recording the server-only versus browser-safe `@cs/domain` boundary and the bundle-poisoning risk of merging
them. Add no runtime behaviour in this ticket — the mechanisms migrate in TKT-248–250.

## Acceptance
- **A1.** `packages/server-runtime` exists as a workspace member `@cs/server-runtime`, is server-only, and
  builds and tests in isolation with no runtime behaviour added yet.
- **A2.** ADR-0031 is authored (Accepted) at ID **0031** — the series-reserved start; the 0026–0030 range is
  owned by TKT-246 and may remain a temporary numbering gap, and ADR-0031 neither cites nor depends on it. The
  ADR records the server-only vs browser-safe `@cs/domain` boundary and why the two must never be merged; it
  is added to the `docs/adr/README.md` index, and the package README carries a one-line "Decision of record:
  ADR-0031" back-link.
- **A3.** The package is not reachable from the `apps/web` (SPA) production dependency graph
  (`check:production-dependencies` passes, including a negative assertion for the new package).
- **A4.** No route, DTO shape, authentication, resource name, or numeric code changes
  (`check:runtime-contract` clean).
- **A5.** No live deployment or cloud write.

## Validation
- `node scripts/checks/check-production-dependencies.mjs` and `node scripts/checks/check-runtime-contract.mjs`
  pass; full `node verify-all.mjs` green.
- The ADR index link resolves and `check:doc-links` passes.

## Research
Distilled from `workingspace/architecture-simplification/01-server-runtime-foundation.md` and the reconciled
review's finding A/B/F/G, with claims re-verified read-only against current source and Microsoft Learn on
2026-07-19; the grounding is recorded in the [distillation note](./evidence/distillation-note.md).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)

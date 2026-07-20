---
id: TKT-272
title: Record and enforce the repository-structure and package-boundary rules
status: done
priority: P2
area: platform
tickets-it-relates-to: [TKT-247, TKT-259, TKT-270]
research-link: docs/tickets/done/TKT-272-repository-structure-and-package-boundary-rules/evidence/distillation-note.md
plan: PLAN-012
---

# Record and enforce the repository-structure and package-boundary rules

## Problem
The series introduces a new server-only package and a consolidated repo-shape policy, but the structural rules
that keep them from regressing are not recorded in one place. The proposed web-bundle check covers only one
direction: it does not stop `@cs/domain` itself importing a runtime adapter, database client, or cloud SDK.

## Evidence
`@cs/domain` is browser-safe and SDK-free (its README forbids runtime/adapter/DB/cloud-SDK imports);
PLAN-007's `@cs/server-runtime` is the server-only complement, and the repository already runs
`check:production-dependencies`. The current check follows production graphs to reject artificial data; it
does not yet assert either package boundary. PLAN-010 consolidates the repo-shape file-enumeration and
generated-directory policy into a single source.

## Proposed change
Extend PLAN-006's locked structure to record: the two-package boundary (browser-safe `@cs/domain` vs
server-only `@cs/server-runtime`, never merged), and the single-source repo-shape policy. After TKT-247 and
TKT-259 are `done`, extend `check:production-dependencies` so (a) the SPA graph cannot reach
`@cs/server-runtime` and (b) `@cs/domain` production code and its manifest cannot reach server-runtime,
runtime adapters, database clients, Node-only packages, or cloud SDKs. Point the governance structure page
at the dependency and layout checks.

## Acceptance
- **A1.** The governance structure documentation records the `@cs/domain` (browser-safe) vs `@cs/server-runtime`
  (server-only) boundary and the single-source repo-shape policy, extending PLAN-006's locked structure.
- **A2.** `check:production-dependencies` asserts `@cs/server-runtime` is never reachable from the `apps/web`
  production graph; a negative fixture proves it fails on a synthetic leak.
- **A3.** The check separately walks `@cs/domain` source imports and package-manifest production dependencies
  against an explicit browser-safe policy. Negative fixtures prove direct `@azure/identity`/cloud-SDK and
  transitive runtime-adapter or database-client dependencies fail even when the SPA does not import them.
- **A4.** The repo-shape policy has one definition (per PLAN-010) that the layout and tracked-output checks
  import; no second copy is permitted.
- **A5.** The rules run in CI; the structure page links the enforcing checks.
- **A6.** No live write.

## Validation
- Run `check:production-dependencies` over the current tree; run separate SPA-to-server, direct
  domain-to-cloud-SDK, and transitive domain-to-runtime negative fixtures; confirm the layout check imports
  the single repo-shape policy and the structure page links both checks.

## Research
Distilled from PLAN-007's package-boundary decision (future ADR-0031), PLAN-010's repo-shape consolidation,
and the reconciled review's structure prescriptions, then corrected against the current production-dependency
checker. Implementation is gated on TKT-247 and TKT-259 being `done` and consumes TKT-270's audit.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)

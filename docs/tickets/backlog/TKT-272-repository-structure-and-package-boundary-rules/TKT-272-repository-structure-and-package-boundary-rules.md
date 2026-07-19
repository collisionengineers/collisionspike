---
id: TKT-272
title: Record and enforce the repository-structure and package-boundary rules
status: backlog
priority: P2
area: platform
tickets-it-relates-to: [TKT-247, TKT-259, TKT-270]
research-link: docs/tickets/backlog/TKT-272-repository-structure-and-package-boundary-rules/evidence/distillation-note.md
plan: PLAN-012
---

# Record and enforce the repository-structure and package-boundary rules

## Problem
The series introduces a new server-only package and a consolidated repo-shape policy, but the structural rules
that keep them from regressing are not recorded in one place. PLAN-006 locked the directory structure; it did
not yet capture the `@cs/domain` vs `@cs/server-runtime` boundary or the single-source repo-shape policy.

## Evidence
`@cs/domain` is browser-safe and SDK-free (its README forbids runtime/adapter/DB/cloud-SDK imports);
PLAN-007's `@cs/server-runtime` is the server-only complement, and the repository already runs
`check:production-dependencies` (a bundle-boundary assertion) and `check-repository-layout.mjs`. PLAN-010
consolidates the repo-shape file-enumeration and generated-directory policy into a single source.

## Proposed change
Extend PLAN-006's locked structure to record: the two-package boundary (browser-safe `@cs/domain` vs
server-only `@cs/server-runtime`, never merged), and the single-source repo-shape policy. Enforce the boundary
via `check:production-dependencies` (the package must not reach the SPA path) and the layout check; point the
governance structure page at both.

## Acceptance
- **A1.** The governance structure documentation records the `@cs/domain` (browser-safe) vs `@cs/server-runtime`
  (server-only) boundary and the single-source repo-shape policy, extending PLAN-006's locked structure.
- **A2.** `check:production-dependencies` asserts `@cs/server-runtime` is never reachable from the `apps/web`
  production graph; a negative fixture proves it fails on a synthetic leak.
- **A3.** The repo-shape policy has one definition (per PLAN-010) that the layout and tracked-output checks
  import; no second copy is permitted.
- **A4.** The rules run in CI; the structure page links the enforcing checks.
- **A5.** No live write.

## Validation
- Run `check:production-dependencies` (pass) and a synthetic SPA-leak fixture (fail); confirm the layout check
  imports the single repo-shape policy; the structure page resolves and links both checks.

## Research
Distilled from PLAN-007's package-boundary decision (ADR-0031), PLAN-010's repo-shape consolidation, and the
reconciled review's structure prescriptions. Extends PLAN-006's locked structure; consumes TKT-270's audit.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)

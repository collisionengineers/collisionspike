---
id: TKT-210
title: Decompose source by feature and enforce the production-data boundary
status: now
priority: P1
area: platform
tickets-it-relates-to: [TKT-020, TKT-209, TKT-211, TKT-214]
research-link: docs/tickets/now/TKT-210-source-decomposition-no-mock-invariant/evidence/operator-note.md
plan: PLAN-006
---

# Decompose source by feature and enforce the production-data boundary

## Problem
Moving folders alone will not make large cross-feature files or mixed production/test modules easy to navigate. Production code must also be structurally prevented from importing mock, sample, demo, seed, fixture or evaluation data.

## Evidence
PLAN-006 requires feature-level source organization, unchanged runtime contracts and a deterministic no-mock production invariant.

## Proposed change
Within the locked application and service roots, split oversized mixed-responsibility modules along stable domain and feature boundaries. Preserve public contracts and use dependency checks to keep all artificial data and evaluation tooling in /tests or explicitly non-production database seeds.

## Acceptance
- **A1.** Each application and service root has a documented feature/module map with one clear owner for routes, use cases, domain logic, persistence adapters and external integration boundaries.
- **A2.** Oversized or mixed-responsibility source files identified by the inventory are decomposed into cohesive modules without duplicating business rules or creating pass-through compatibility wrappers.
- **A3.** Public routes, DTO shapes, authentication and authorization behavior, Azure resource names, Postgres columns, numeric domain codes, error semantics and durable/idempotency behavior remain unchanged by decomposition.
- **A4.** Production dependency graphs contain zero imports from mock, sample, demo, seed, fixture, evaluation, story or prototype sources. Dynamic loading, path aliases and package exports are included in the check.
- **A5.** Test fixtures live only under /tests/fixtures, evaluation code only under /tests/evaluation or /scripts/evaluation, and database seed material only under /database/seeds with no production entry-point reachability.
- **A6.** Negative fixtures prove the production-import check fails for direct, transitive, aliased and dynamic artificial-data imports and passes for legitimate test-only use.
- **A7.** Existing unit, integration and contract tests are relocated with their feature ownership and retain or improve coverage of the decomposed boundaries.
- **A8.** Clean install, build and test pass in all four npm package scopes, together with retained Python and schema tests, with behavior compared against the pre-change baseline.
- **A9.** No source decomposition step deploys or writes to a live system.

## Validation
- Generate production dependency graphs for every executable entry point and run the negative fixtures.
- Run clean package, Python and schema suites and compare route/DTO/auth/schema snapshots before and after.
- Review module ownership and dependency direction independently for each application and service.

## Research
Distilled from the operator's requirement that the cleaned repository be immediately navigable by another AI agent while retaining the no-mock live-data rule.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)

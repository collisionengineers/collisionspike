---
id: TKT-214
title: Enforce repository structure in local checks and CI
status: verify
priority: P0
area: platform
tickets-it-relates-to: [TKT-020, TKT-207, TKT-208, TKT-209, TKT-210, TKT-211, TKT-212, TKT-213, TKT-215]
research-link: docs/tickets/verify/TKT-214-repository-gates-ci-closeout/evidence/operator-note.md
plan: PLAN-006
---

# Enforce repository structure in local checks and CI

## Problem
A one-time cleanup will drift unless the locked structure, complete inventory, evidence hashes, current-only language, production-data boundary, docs/ticket parity, adapter generation and full build/test surface run together on a clean checkout.

## Evidence
Current checks cover only portions of the required state and can pass while known-absent links or status/index drift remain. PLAN-006 defines a broader close-out contract.

## Proposed change
Create one documented local verification entry point and matching CI workflow that runs every PLAN-006 structural, content, integrity and regression gate. Close the programme only when the clean checkout, final ledger and independent review agree.

## Acceptance
- **A1.** One local command runs inventory/final-ledger reconciliation, locked-structure validation, forbidden-reference scanning, evidence/workingspace hash checks, production-import checks, docs links, ticket/index/plan parity and agent/skill generation parity.
- **A2.** The same command performs clean dependency installation, build and test in all four npm package scopes and runs retained Python, schema, vendored-source and evaluation suites.
- **A3.** CI executes the same versioned gate definitions from a clean checkout; local and CI commands cannot silently omit a check through different wrappers or environment defaults.
- **A4.** Controlled failing fixtures cover an unexplained inventory path, wrong target path, configured forbidden-reference variant, changed evidence hash, missing logical occurrence, production fixture import, broken/known-absent link, ticket/plan drift and edited adapter.
- **A5.** The gate fails for archive/stub/build/dependency output, an extra top-level source root, an unowned generated artifact or a disallowed path.
- **A6.** Runtime baseline comparison fails for unexpected route, DTO, auth, Azure resource name, Postgres column or numeric-code change; explicitly separate ticket-owned changes require a cited approved baseline update.
- **A7.** Gate scripts are deterministic, print actionable file/line or ledger-row failures, avoid credentials and client content, and require no live access for the normal CI path.
- **A8.** TKT-215's read-only live audit is recorded separately and cannot turn the normal repository gate into a cloud write or deployment path.
- **A9.** Final close-out independently samples every TKT-207 disposition class, retained evidence type, source/service root, docs authority, ticket status and generated-adapter target.
- **A10.** PLAN-006 remains active and every member verdict remains PENDING until all acceptance evidence exists; a green plan is never inferred from ticket-spec creation or partial checks.

## Validation
- Run the complete command twice from fresh clean checkouts and compare normalized outputs.
- Run every negative fixture in isolation and through the aggregate entry point.
- Inspect the corresponding authenticated CI result and independently reconcile final inventory totals and hashes.

## Research
Distilled from PLAN-006's close-out requirements and the current documentation/ticket check gaps.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)

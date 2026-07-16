---
id: TKT-209
title: Migrate repository paths and remove generated output
status: verify
priority: P1
area: platform
tickets-it-relates-to: [TKT-020, TKT-207, TKT-208, TKT-210, TKT-211, TKT-212, TKT-213, TKT-214]
research-link: docs/tickets/verify/TKT-209-monorepo-path-migration-generated-output-removal/evidence/operator-note.md
plan: PLAN-006
---

# Migrate repository paths and remove generated output

## Problem
Application, service, function, package, database, infrastructure, script, fixture and tool roots have accumulated under unrelated naming schemes. Build output, duplicate vendored copies and dependency artifacts further blur which files are authoritative.

## Evidence
PLAN-006 records the locked destination tree. TKT-207 must map every current source path to that destination or an explicit deletion before this ticket moves files.

## Proposed change
Apply the TKT-207 path map into /apps, /services, /packages, /contracts, /database, /infrastructure, /tests, /docs, /scripts, /tools and /workingspace. Update all repository-local path consumers atomically, remove non-source outputs, and retain no redirect directory or continuity stub.

## Acceptance
- **A1.** Every source move follows the approved TKT-207 row and lands in PLAN-006's locked target structure; there are no additional top-level application, service, database, evidence, script or documentation roots.
- **A2.** Package workspaces, dependency declarations, TypeScript/Python configuration, imports, test discovery, build scripts, deployment source paths, CI workflows, editor tasks and documentation links resolve the new paths without fallback to an old path.
- **A3.** All retained functions occupy the named /services/functions children, web/data/orchestration code occupies its named destination, shared domain code lives under /packages/domain, and contracts have one owner under /contracts.
- **A4.** Database baseline, migrations, seeds, tests and operations are separated under /database without changing schema meaning, migration order or operational behavior.
- **A5.** Archive trees, redirect stubs, application build output, dependency folders, caches and unowned generated artifacts are absent from the tracked final tree and ignored where regeneration is expected.
- **A6.** Intentional vendored source is retained only when a documented upstream/source-lock contract requires it; its parity/hash check distinguishes it from disposable generated output.
- **A7.** Clean dependency install, build, unit/integration test and packaging commands run using only the new paths. A clean checkout contains no reference that requires an old path to exist.
- **A8.** Runtime routes, DTOs, authentication behavior, Azure resource names, Postgres columns, numeric codes and deployed resource configuration are unchanged by the path migration.
- **A9.** The migration performs repository writes only and does not deploy, change cloud configuration or write live data.

## Validation
- Run all path and structure checks from a clean checkout on a case-sensitive filesystem where available.
- Search manifests, configuration, source, workflows and docs for every former path recorded by TKT-207.
- Run the complete package, Python, schema, vendored-source and evaluation suites before and after and compare behavior.

## Research
Distilled from the operator's locked repository-layout decision and authorization to break and then repair internal links.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)

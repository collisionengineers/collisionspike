---
id: PLAN-006
title: Repository structure and documentation reset
status: active
tickets: [TKT-020, TKT-207, TKT-208, TKT-209, TKT-210, TKT-211, TKT-212, TKT-213, TKT-214, TKT-215]
depends-on: []
---

# PLAN-006 — Repository structure and documentation reset

## Context
The operator authorized a complete repository reorganization on 2026-07-15. The repository is still pre-release, so clarity, one source of truth and deterministic navigation outrank preservation of stale paths or links. Git history is the retirement record; the cleaned tree must not carry an archive, compatibility stubs or stale implementation narratives.

The planning snapshot contains 3,268 tracked files, 775 tracked directory paths and 602,332,769 bytes. Documentation alone contains 1,587 tracked files in 537 directory paths and 351,160,434 bytes; the ticket tree accounts for 1,113 of those files. The evidence and test-data tree contains 385 tracked files and 214,951,155 bytes. These counts are a baseline, not the final inventory: TKT-207 must produce a path-by-path pre-change and final ledger covering every file and directory, including tracked, untracked, ignored, binary, generated and dependency material.

The operator's four brainstorming files are currently under docs/workingspace. Their contents are immutable. TKT-208 may only relocate the directory to the repository root and must prove the same four names, byte lengths and SHA-256 hashes before and after.

## Locked target structure

    /apps/web
    /services/data-api
    /services/orchestration
    /services/functions/box-webhook
    /services/functions/eva-sentry
    /services/functions/eva-validation
    /services/functions/location-assist
    /services/functions/ocr
    /services/functions/parser
    /services/functions/vehicle-enrichment
    /packages/domain
    /contracts
    /database/baseline
    /database/migrations
    /database/seeds
    /database/tests
    /database/operations
    /infrastructure
    /tests/fixtures/evidence/sha256
    /tests/fixtures/cases
    /tests/fixtures/email
    /tests/fixtures/manifests
    /tests/evaluation
    /docs/README.md
    /docs/product
    /docs/architecture
    /docs/adr
    /docs/operations
    /docs/design
    /docs/governance
    /docs/reference
    /docs/reviews
    /docs/tickets
    /workingspace
    /scripts/build
    /scripts/checks
    /scripts/database
    /scripts/evaluation
    /scripts/hooks
    /scripts/maintenance
    /tools

## Decisions recorded
- The target structure above is locked. A deviation requires an explicit operator decision recorded in this plan before implementation.
- The complete inventory is a repository artifact, not a chat summary. Every pre-change path receives an owner, disposition, reason and final path or deletion proof, and every final path reconciles back to that ledger.
- No retired-platform technology, product name, identifier, URL, command, inherited prefix-based logical name, compatibility layer or narrative remains in the final tracked tree. Git history is sufficient context.
- The workingspace move is the only permitted change to those four files. Their bytes, names and hashes remain exact.
- Evidence is content-addressed by SHA-256. Manifests preserve every logical occurrence, source relationship and byte hash even when identical bytes are stored once.
- Runtime routes, request and response shapes, authentication behavior, Azure resource names, Postgres columns and numeric domain codes do not change as a side effect of repository cleanup.
- Production source never imports mock, sample, demo, seed or evaluation data. Test-only material remains behind explicit test boundaries.
- .agents is the canonical agent and skill source. Any required adapter is generated deterministically from it and cannot become an independently maintained copy.
- The cleanup authorizes repository writes only. It authorizes no live write, deployment, mailbox mutation, database mutation or cloud configuration change.
- TKT-216 is a separate production-readiness defect under PLAN-004. The cleanup must preserve the EVA Sentry service and must not conceal its route/body seam mismatch by deleting or replacing the service.

## Ticket sequence
1. [TKT-020](../now/TKT-020-docs-cleanup/TKT-020-docs-cleanup.md) — owns the programme-wide documentation and repository reset contract.
2. [TKT-207](../now/TKT-207-repository-inventory-disposition-ledger/TKT-207-repository-inventory-disposition-ledger.md) — records the exact current tree and gives every item a final disposition before moves begin.
3. [TKT-208](../now/TKT-208-evidence-catalog-workingspace-relocation/TKT-208-evidence-catalog-workingspace-relocation.md) — protects evidence identity and relocates workingspace without changing a byte.
4. [TKT-209](../now/TKT-209-monorepo-path-migration-generated-output-removal/TKT-209-monorepo-path-migration-generated-output-removal.md) — moves repository roots into the locked structure and removes non-source output.
5. [TKT-210](../now/TKT-210-source-decomposition-no-mock-invariant/TKT-210-source-decomposition-no-mock-invariant.md) — decomposes source by feature while preserving runtime contracts and enforcing production-data boundaries.
6. [TKT-211](../now/TKT-211-retired-platform-compatibility-purge/TKT-211-retired-platform-compatibility-purge.md) — removes every retired-platform remnant from paths and content.
7. [TKT-212](../now/TKT-212-canonical-agent-skill-generation/TKT-212-canonical-agent-skill-generation.md) — establishes one agent/skill authority and reproducible adapters.
8. [TKT-213](../now/TKT-213-ticket-index-research-link-reconciliation/TKT-213-ticket-index-research-link-reconciliation.md) — reconciles ticket locations, indexes, plans, evidence and research links after the move.
9. [TKT-214](../now/TKT-214-repository-gates-ci-closeout/TKT-214-repository-gates-ci-closeout.md) — installs complete local and CI gates and performs final ledger close-out.
10. [TKT-215](../backlog/TKT-215-eva-validation-live-use-audit/TKT-215-eva-validation-live-use-audit.md) — performs a read-only live-use audit before deciding the EVA validation service's final disposition.

## Verification / close-out
- TKT-207's final inventory is exact: every file and directory is represented once, every move/delete is reconciled, every final path is owned, and there are zero unexplained additions, omissions or duplicate authorities.
- Deterministic scans report zero retired-platform references in text, paths, filenames, metadata and rendered binary material, including technology names, implementation names, tenant/resource identifiers, URLs, commands and old cr-prefixed logical names.
- No archive directory, compatibility stub, application build output, dependency output or unowned generated output remains in the tracked tree.
- The four workingspace files exist only under /workingspace with their original names and exact pre-move SHA-256 hashes; no content edit is present.
- Content-addressed evidence manifests preserve the byte hash and every logical occurrence of each retained email, image, document and evaluation artifact.
- Clean dependency installation, build and test pass in all four npm package scopes. Retained Python, schema, vendored-source and evaluation checks also pass from a clean checkout.
- Runtime routes, DTOs, authentication behavior, Azure resource names, Postgres columns and numeric codes are unchanged, except work explicitly owned by a separate non-cleanup ticket.
- Static dependency checks and tests prove production code imports no mock, sample, demo, seed, fixture or evaluation source.
- Documentation has one discoverable authority per subject; all internal links resolve with zero hidden known-absent exceptions; ticket, board, plan and index membership is exact.
- Required agent and skill adapters reproduce deterministically from .agents, and parity checks reject hand-maintained drift.
- CI runs the complete inventory, structure, forbidden-reference, evidence-hash, production-import, docs, ticket, skill, package, Python, schema, vendored-source and evaluation gates on a clean checkout.
- No plan member performs a live write or deployment. Read-only live evidence is permitted only where a ticket explicitly requires it.

## Deferred
- TKT-216 owns the EVA Sentry route/body mismatch under PLAN-004 and is not a cleanup member.
- TKT-215 remains backlog until its read-only live-use audit is intentionally run. No assumption about service use is a valid removal decision.
- Live deployment, cloud reconfiguration, database migration and production evidence manufacture are outside PLAN-006.

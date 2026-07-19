---
id: PLAN-006
title: Repository structure and documentation reset
status: done
tickets: [TKT-020, TKT-207, TKT-208, TKT-209, TKT-210, TKT-211, TKT-212, TKT-213, TKT-214, TKT-215]
depends-on: []
---

# PLAN-006 — Repository structure and documentation reset

## Outcome

Leave one current, navigable monorepo in which a new agent can find every deployable, contract, test,
operating procedure and unit of work without consulting Git history.

## Locked structure

- `apps/web`
- `services/data-api`, `services/orchestration` and focused services under `services/functions`
- `packages/domain` and `contracts`
- `database/{baseline,migrations,seeds,tests,operations}`
- `infrastructure`
- `tests/fixtures` and `tests/evaluation`
- a current-only `docs` organized by product, architecture, decisions, operations, design, governance,
  reference, reviews and tickets
- `scripts/{build,checks,database,evaluation,hooks,maintenance}` and `tools`
- user-owned, content-immutable `workingspace`

## Locked decisions

- Ticket specs are the work authority; generated board, index and progress views cannot drift from them.
- `LIVE_FACTS.json` and `docs/operations/live-environment.md` are the environment-state authorities.
- Git history is the recovery path. The checked-out tree contains no archive or pointer stubs.
- Evidence bytes are content-addressed by SHA-256 while manifests preserve every logical use and original
  filename.
- The four `workingspace` files may move only as a directory and must retain their exact names and hashes.
- Runtime routes, request/response shapes, authentication, resource names, database identifiers and
  stable numeric codes remain unchanged by cleanup.
- Production code imports no fabricated records or test/evaluation fixtures.
- `.agents` is canonical; tool-specific instructions are generated.
- This plan performs no deployment, cloud write, mailbox mutation or database mutation.
- TKT-205 is preserved for rework on the final paths. Its branch is not imported wholesale.
- TKT-206 is advisory and remains separately reviewable; its runtime and schema changes are not part of
  this plan.

## Sequence

1. TKT-020 and TKT-207 establish the documentation contract and full disposition ledger.
2. TKT-208 preserves evidence and relocates `workingspace` without byte changes.
3. TKT-209 performs mechanical path moves and removes generated output.
4. TKT-210 decomposes owned source and enforces the production-data boundary.
5. TKT-211 enforces the forbidden-reference zero state.
6. TKT-212 makes agent and skill adapters reproducible.
7. TKT-213 reconciles tickets, plans, links and evaluation ownership.
8. TKT-214 installs full local/CI gates and closes the inventory.
9. TKT-215 records the read-only use audit that determines validation-service source disposition.

## Close-out

The final inventory, evidence resolution, zero-reference scan, clean installs, builds, tests, contract
snapshots, ticket parity, documentation links and adapter parity all pass from a clean checkout. No plan
member performs a live write.

<!-- GENERATED:PROGRESS -->
## Computed progress

**10/10 done (100%).**

| Status | Count |
|---|---:|
| Now | 0 |
| Verify | 0 |
| Done | 10 |
| Next | 0 |
| Backlog | 0 |
| Blocked | 0 |

| Ticket | Status | Title |
|---|---|---|
| [TKT-020](../done/TKT-020-docs-cleanup/TKT-020-docs-cleanup.md) | done | Repository structure and documentation reset |
| [TKT-207](../done/TKT-207-repository-inventory-disposition-ledger/TKT-207-repository-inventory-disposition-ledger.md) | done | Build the complete repository inventory and disposition ledger |
| [TKT-208](../done/TKT-208-evidence-catalog-workingspace-relocation/TKT-208-evidence-catalog-workingspace-relocation.md) | done | Catalog evidence and relocate workingspace without content changes |
| [TKT-209](../done/TKT-209-monorepo-path-migration-generated-output-removal/TKT-209-monorepo-path-migration-generated-output-removal.md) | done | Migrate repository paths and remove generated output |
| [TKT-210](../done/TKT-210-source-decomposition-no-mock-invariant/TKT-210-source-decomposition-no-mock-invariant.md) | done | Decompose source by feature and enforce the production-data boundary |
| [TKT-211](../done/TKT-211-forbidden-reference-gate/TKT-211-forbidden-reference-gate.md) | done | Enforce the forbidden-reference zero state |
| [TKT-212](../done/TKT-212-canonical-agent-skill-generation/TKT-212-canonical-agent-skill-generation.md) | done | Establish one agent and skill source with generated adapters |
| [TKT-213](../done/TKT-213-ticket-index-research-link-reconciliation/TKT-213-ticket-index-research-link-reconciliation.md) | done | Reconcile tickets, indexes, plans and research links |
| [TKT-214](../done/TKT-214-repository-gates-ci-closeout/TKT-214-repository-gates-ci-closeout.md) | done | Enforce repository structure in local checks and CI |
| [TKT-215](../done/TKT-215-eva-validation-live-use-audit/TKT-215-eva-validation-live-use-audit.md) | done | Audit live use and disposition of the EVA validation service |
<!-- /GENERATED:PROGRESS -->

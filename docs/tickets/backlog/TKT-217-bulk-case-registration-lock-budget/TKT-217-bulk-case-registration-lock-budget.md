---
id: TKT-217
title: Batch bulk case_ mutations under the registration advisory-lock budget
status: backlog
priority: P2
area: platform
tickets-it-relates-to: [TKT-154]
research-link: docs/tickets/backlog/TKT-217-bulk-case-registration-lock-budget/evidence/operator-note.md
plan: PLAN-004
---

# Batch bulk case_ mutations under the registration advisory-lock budget

## Problem

TKT-154 added a `BEFORE INSERT OR DELETE` trigger (`lock_case_registration_eligibility` /
`tr_case_registration_*` in `database/baseline/900_constraints.sql`) that takes a
transaction-scoped `pg_advisory_xact_lock` per `case_` row, keyed on the canonical registration. This
is **required** for the phantom-case protection that makes the MCP registration→case binding race-free,
and it must not be removed.

Its side effect: the lock applies to **every** `case_` INSERT/DELETE, not just the MCP lane. A single
transaction that inserts or deletes a large number of `case_` rows (e.g. an ADR-0017 disposition /
retention purge, or a bulk intake replay) accumulates one advisory lock per distinct registration held
until commit, and a large enough batch approaches the shared lock-table budget
(`max_locks_per_transaction × (max_connections + max_prepared_transactions)`), aborting with
`out of shared memory / You might need to increase max_locks_per_transaction`.

It fails safe (the transaction aborts, nothing is corrupted), and no code in the current tree performs
a bulk `case_` mutation of that size — so this is a forward-looking guard, deferred from the PR #73
review, not a live defect.

## Acceptance

- Bulk `case_` writers (the disposition / retention-purge tooling and any bulk intake replay) chunk
  their INSERT/DELETE work into modest per-transaction batches that stay comfortably under the advisory
  lock-table budget, or explicitly raise the budget for that operation.
- The chunking is proven against a representative large batch without the trigger being weakened or
  bypassed (phantom-case protection intact).
- The lock-budget note already added beside the trigger and in `docs/architecture/mcp-image-ingestion.md`
  is kept in sync with the implemented batching.

## References

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
- Source: the PR #73 / TKT-154 review (PLAN-004 production-readiness programme).

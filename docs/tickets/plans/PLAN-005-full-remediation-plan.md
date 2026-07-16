---
id: PLAN-005
title: Claimant remediation and repository reconciliation
status: active
tickets: [TKT-150]
depends-on: []
---

# PLAN-005 — Claimant remediation and repository reconciliation

## Outcome

Recover claimant information only where immutable source evidence supports the value, retain a complete
per-case outcome ledger, and leave uncertain or conflicting cases untouched.

## Binding safety sequence

1. Work from the current default branch and record exact source revisions.
2. Produce a fresh read-only candidate plan; never reuse a superseded plan or approval.
3. Audit source binding, conflicts, omissions and deterministic output before requesting approval.
4. Take a plan-bound backup and require before-value checks plus fill-only writes.
5. Apply only the exact approved plan in an independently authorized window.
6. Reconcile every case to repaired, source absent, conflicting, intentionally held or failed with a
   named follow-up.

## Current constraint

TKT-150 remains the sole member and source of detailed evidence. No production apply is permitted until
its current read-only plan passes audit and receives new named approval.

## Close-out

The plan closes only after TKT-150 has immutable plan, backup, approval, apply and independent
reconciliation evidence for every in-scope case.

<!-- GENERATED:PROGRESS -->
## Computed progress

**0/1 done (0%).**

| Status | Count |
|---|---:|
| Now | 1 |
| Verify | 0 |
| Done | 0 |
| Next | 0 |
| Backlog | 0 |
| Blocked | 0 |

| Ticket | Status | Title |
|---|---|---|
| [TKT-150](../now/TKT-150-claimant-extraction-held-audit/TKT-150-claimant-extraction-held-audit.md) | now | Restore claimant-name extraction and remediate affected held cases |
<!-- /GENERATED:PROGRESS -->

# PLAN-005 repository reconciliation evidence

This directory holds the non-sensitive reconciliation record preserved by the 2026-07-14 handoff. It does not
authorise TKT-150 remediation or the final operational cutover.

- [Initial inventory](./initial-inventory.json) — frozen pre-reconciliation machine snapshot.
- [Phase-C inventory](./phase-c-inventory-2026-07-14.json) — the exact `2026-07-14T01:03:54.191Z`
  post-cleanup snapshot originally named `current-inventory.json` in the plan-authoring worktree.
- [Current inventory](./current-inventory.json) — latest timestamped machine snapshot at the documented
  checkpoint.
- [Archival tip dispositions](./archival-tip-dispositions.md) — semantic audit of archived maximal tips.
- [Canonical main gate](./canonical-main-gate.md) — clean-main and offline-base-gate evidence.
- [Disposition ledger](./disposition-ledger.md) — append-only object/action record and sign-off gates.
- [History retention](./history-retention.md) — bundle/tag replacement for removed temporary history.
- [Protected retention](./protected-retention.md) — why active sources survived the first cleanup.
- [Safe deletion matrix](./safe-deletion-matrix.md) — exact first-pass deletions and exclusions.
- [TKT-009 cutover boundary](./tkt009-cutover-boundary-2026-07-13.md) — rollback/restoration record and the
  still-blocked production-cutover prerequisites.

The current operator/agent continuation is
[`docs/handoff/05-plan-005-tkt-150-remediation.md`](../../handoff/05-plan-005-tkt-150-remediation.md).

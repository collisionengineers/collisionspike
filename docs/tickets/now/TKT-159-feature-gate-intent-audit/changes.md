# Changes — TKT-159: Reconcile every live feature gate with intended production behavior

## Status
started by the PLAN-005 verification sweep; full inventory and behavioral matrix remain

## 2026-07-14 first reconciliation

- A fresh read-only API setting check found `ASSISTANT_WRITE_TIER_ENABLED=true` while
  `LIVE_FACTS.json`, `live-environment.md`, and `gated.md` still described the 2026-07-09 dark state.
- The validated 2026-07-11 deployment record resolves the intent conflict: it records operator-attested
  approvals and the successful activation. No setting was changed during this reconciliation.
- The registry and runbook were corrected to the current readback. TKT-111 remains PENDING until the
  real signed-in propose/confirm route and stale-version 409 are independently witnessed.
- This is one drift item, not the required complete gate inventory. The remaining acceptance lines stay
  open under TKT-159.

# Distillation note — TKT-273

**Source:** PLAN-009 `LIVE_FACTS` refresh (TKT-257) + PLAN-010 byte-preserving ledgers (TKT-258) +
`LIVE_FACTS.json` authority rule. **Plan:** PLAN-012.

**Why:** the series was partly triggered by stale live-state (the registry said "Free Trial" and carried an
over-counted API function count while the live estate was PAYG). PLAN-009 fixes the current values; this
ticket keeps them honest going forward.

**Two standing assertions:**
1. `LIVE_FACTS.json` reconciled to a fresh read-only inventory within a defined window; tracked-doc live claims
   agree with it (reuse the `check:docs` leakage/authority machinery).
2. Governance ledgers (`repository-inventory.json` + reconciliation) regenerate byte-identical
   (`check:inventory` / `check:reconciliation` already exist — assert non-drift as a gate).

**Rule honoured:** `LIVE_FACTS.json` is replaced only from dated read-only evidence, never inferred from
source; this check never mutates live state. Generalises the estate reconciliation from PLAN-009.

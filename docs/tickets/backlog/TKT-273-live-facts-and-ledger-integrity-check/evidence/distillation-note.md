# Distillation note — TKT-273

**Source:** PLAN-009 `LIVE_FACTS` refresh (TKT-257) + PLAN-010 byte-preserving ledgers (TKT-258) +
`LIVE_FACTS.json` authority rule. **Plan:** PLAN-012.

**Why:** the series was partly triggered by stale live-state. A current read-only Azure comparison confirmed
that some governed subscription and function-registration fields are stale while another registration field
still matches. Exact state and the verification timestamp remain in `LIVE_FACTS.json`. PLAN-009 owns the
current refresh; this ticket keeps governed fields honest afterward.

**Required evidence contract:**
1. A committed secret-free snapshot plus field map connects each machine-governed `LIVE_FACTS.json` path to
   its evidence path, source/probe, capture time, and comparison rule.
2. The registry references the snapshot path and digest.
3. An offline command checks snapshot freshness/digest, full mapped-field parity, and tracked-doc authority.
4. A separate credential-gated command queries Azure read-only, compares an ephemeral sanitised snapshot with
   the committed evidence and registry, and fails closed when credentials are present.

**False-green found in current code:** the workflow job named `Verify live registry drift (gated)` runs
`VERIFY_LIVE=1 node verify-all.mjs`; `verify-all.mjs` states that it never contacts the live environment and
does not consume that variable. The future workflow must invoke the real comparator directly and must not
claim an explicit no-credential skip is live proof.

**Ledgers:** `check:inventory` and `check:reconciliation` already own deterministic ledger comparison. Reuse
them; do not reimplement hashing, generation, or comparison in the live-facts guard.

# Lane D — Runtime public-surface invariance (#7)

**Scope:** locked decision #7 (routes/DTOs/auth/resource-names/db-ids/numeric-codes unchanged) + no
fixtures-in-production (#8). **Verdict:** the reset's "public runtime surface unchanged" claim is
**substantively true** — independently baseline-diffed clean modulo two disclosed deltas — **but the passing
`check:runtime-contract` gate is not what proves it** (it is self-referential). 4 issues + the real proof.

### D1 — [MEDIUM · CONFIRMED] The gate proves self-consistency, not pre-reset invariance
`scripts/checks/check-runtime-contract.mjs:26,32-34`: `current = buildRuntimeContractSnapshot(ROOT)` vs
`expected = readJson(SNAPSHOT)` where `contracts/runtime-contract.snapshot.json` was **first committed in the
reset commit `1302a003`** and every route/DTO embeds its new `services/…` source path (`--write` rebuilds it
from current ROOT). The pre-reset baseline is **never read**. So "158 routes unchanged" proves only that HEAD
matches its own frozen post-reset output; the only baseline-anchored assertions are the 2 hardcoded
`approved-deltas.json` entries. *Scenario:* a route silently dropped **during** the reset would still PASS as
long as the snapshot was regenerated to match. (Mitigated by D5.)

### D2 — [LOW · disclosed] Route removed: `POST /api/validate-case`
`validate_case_endpoint` (evavalidation) — a genuine route deletion vs #7, disclosed as approved delta
`TKT-215`. **Confirmed intentional:** TKT-215 dispositions the EVA validation service for retirement (read-only
audit found no repo caller / config / 90-day telemetry); the live resource stays Running as deferred production
work. Accept given the TKT-215 audit.

### D3 — [LOW · disclosed] DTO field dropped: `RemoveCaseInput.acknowledgeBoxFolderHandled?`
Baseline carried both `acknowledgeArchiveFolderHandled?` and the deprecated alias; only the alias was dropped,
authoritative field remains. Grep across the worktree: the old name appears **only** in `approved-deltas.json:37`
— no source/SPA client still sends it. Low-risk.

### D4 — [LOW · CONFIRMED] Gate headline numbers aren't on the baseline's measurement basis
The new lib reports 7 JSON schemas (baseline capture: 5) and 158 routes (baseline: 159) under different scan
scopes; the new schema scope even folds `tests/fixtures/manifests/evidence.schema.json` into the contract
hash-set (`runtime-contract-lib.mjs:490`) — a mild #8 scope smell (catalogued for drift-hashing, not imported)
and further proof the passing figures aren't comparable to pre-reset.

### D5 — [INFO · CONFIRMED] The real invariance proof (independent baseline diff vs `70a3bb57`)
- **Routes:** wire surface (runtime+method+path) identical except `validate-case`; **all 135 TS routes identical**
  incl. `functionName`+`authLevel`. The 23 Python `authLevel` "diffs" are a capture-normalisation artifact
  (baseline stored unresolved `null`; new lib resolves the FunctionApp `FUNCTION` default).
- **DTOs:** **49/49 present**; only `RemoveCaseInput` changed (the approved alias drop). Zero added/removed/renamed.
- **Numeric codes:** 22 tables / 171 options; **0 value→name pairs changed** despite the option-set source
  files relocating to `code-tables/*.json`.
→ Surface byte-equivalent modulo the 2 disclosed deltas.
- **#8 fixtures:** `check-production-dependencies.mjs` is a **real AST import-graph BFS** from entrypoints (not
  grep); empirical grep confirms 0 production imports of tests/fixtures/evaluation under `services/**` /
  `apps/web/src`. PASS is trustworthy.
- **Decomposition:** `api/src/functions/cases.ts` (21 routes) split into `services/data-api/src/features/cases/**`
  — all 21 public paths preserved, 0 lost, `functionName`+`authLevel` preserved.

**Caveat:** this diff is **vs the stale baseline `70a3bb57`** — it proves the reset preserved the surface *as of
the merge-base*, **not vs current main**. Routes/DTOs added by #73/#83/#87/#89 are absent from both sides here,
which is why the surface looks clean while blocker #1 (their reversion) is real. DDL/role-claim invariance rides
the same self-referential snapshot and was not independently re-confirmed (no DDL baseline snapshot provided).

**Recommend:** commit the `.plan-006-baseline/` capture (or wire the gate to diff it) so invariance stays
enforceable going forward.

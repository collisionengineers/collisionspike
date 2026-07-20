# Verification — TKT-262: Consolidate the active focused-Function clients onto one

## Verdict

PASS (behaviour-preserving) — 2026-07-20.

## Evidence

- **A1 — one owned client + both services import it.** `packages/server-runtime/src/focused-function-client/`
  is the single transport home; `functions-client.ts` (orchestration) and `service-client.ts` (data-api)
  both import `focusedFnRequest` and delegate their private transports to it. The two hand-rolled
  `callFunction`/`callFn` fetch skeletons are removed (replaced by ~12-line delegations).
- **A2 — no dead methods migrated; call-site inventory.** TKT-265's retired `callParser`/`callLocationSuggest`
  (orchestration) and `LOCATION_FN_*` were not reintroduced — `functions-client.deadexports.test.ts` still
  passes. The recon call-site inventory (workflow `wf_8589e5a7-df1`) maps every retained method to its
  caller/route/target/error contract; all retained methods keep their wrappers.
- **A3 — per-service config unchanged.** Each service keeps its own env resolution and missing-config
  message; `BOX_FN_*` (data-api) and `BOXWEBHOOK_FN_*` (orchestration) stay distinct; no `LOCATION_FN_*`
  fallback exists. `check:runtime-contract` unchanged, and config-capture bicep untouched.
- **A4 — DTO placement.** `PlateOcrResult`/`FunctionCallError`/`FN_STAGE_TIMEOUT_MS` are the only shared
  symbols moved (into the subpath, re-exported for back-compat); all other client DTOs stay co-located.
  Nothing was added to root `contracts/`.
- **A5 — contract tests + build + smoke.** `focused-function-client/index.test.ts` covers the header/body
  policy and BOTH services' opposite error contracts (body-retaining plain `Error` vs status-only
  `FunctionCallError`) and the opt-in timeout → `onTimeout`. `service-client.test.ts` (data-api abort/no-abort),
  `archive/service-client.test.ts` (file-request families + `FunctionCallError` no-body), and the
  orchestration `functions-client`/`extractImages` suites all pass. `check:runtime-contract` byte-identical
  (191 routes, 56 DTOs).
- **A6 — delta + no live write.** Net **+261** raw lines (new shared module + contract test vs ~60 collapsed
  transport lines); a single lane's positive delta is permitted by the plan's structural-delta rule (the
  plan aggregate is the gate). No live write.

## Commands

- `npm run build:server-runtime && npm run build:api && npm run build:orch` → all exit 0.
- `npm run test --workspace @cs/server-runtime` → 45 passed. `--workspace @cs/api` → 1102 passed.
  `--workspace @cs/orchestration` → 581 passed.
- `npm run check:runtime-contract` → passed, 191 routes unchanged.
- `npm run check:production-dependencies` → PASS (boundary intact). `npm run check:source-size` → PASS.

## Pending / gaps

None for this ticket. Full `node verify-all.mjs` is run at PR time (CI). The plan aggregate net-negative is
confirmed at PLAN-008 close-out once TKT-264/266 land.

## How to re-verify

Build the three packages, run their suites, and run `check:runtime-contract` + `check:production-dependencies`
from a clean checkout; confirm the two per-service client files still export the same wrappers and the
deadexports guard passes.

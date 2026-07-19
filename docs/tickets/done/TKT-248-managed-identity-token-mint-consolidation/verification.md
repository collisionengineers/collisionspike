# Verification — TKT-248: Consolidate the managed-identity token mint across the six bearer-token sites

## Verdict
PASS (implemented; uncommitted on `plan007/server-runtime`, ticket not yet moved).

## Evidence (run 2026-07-19, Windows)

| Command | Result |
|---|---|
| `npm run build --workspace @cs/server-runtime` | PASS |
| `npm run build --workspace @cs/api` | PASS |
| `npm run build --workspace @cs/orchestration` | PASS |
| `npm test --workspace @cs/server-runtime` | PASS — 8/8 tests (cache hit, near-expiry refresh, fallback-TTL, dev-token, localTokenEnv-before-MI (A2), HTTP-status-on-failure (A1)) |
| `npm run test --workspace @cs/api` | PASS — 1102/1102 (109 files) |
| `npm run test --workspace @cs/orchestration` | PASS — 573/573 (48 files) |
| `npm run check:runtime-contract` | PASS — 191 routes, 56 DTOs (unchanged) — A4 |
| `npm run check:production-dependencies` | PASS — server-runtime off the SPA graph — A4 |
| `npm run check:source-size` | PASS |

## Acceptance
- **A1** — single `getManagedIdentityToken` in `@cs/server-runtime` with a cache-boundary unit test
  (hit / near-expiry / fallback-TTL / dev-token) and HTTP status surfaced via `ManagedIdentityTokenError.status`. ✔
- **A2** — all six bearer sites import it; no local mint remains; `AbortSignal`, az dev-fallback,
  `DATA_API_TOKEN` local override and cache-TTL preserved via options; override-before-MI proven by test. ✔
- **A3** — `graph.ts` unchanged; the three storage sites untouched (TKT-250). ✔
- **A4** — `check:runtime-contract` clean (191/56); both services build. ✔
- **A5** — mechanism net −14 LOC (six sites + primitive); code source excl. new test net −8. ✔
- **A6** — no live deployment / cloud write. ✔

## Behaviour-preservation spot-checks
- box-maintenance drain test still asserts `Authorization: Bearer local-token` (DATA_API_TOKEN override) — green.
- archive-mirror / data-api adapter tests (DATA_API_TOKEN override) — green.
- aoai `callTriageModel` MSI-mint-mocked path + mint-failure→abstain — green.

## How to re-verify
Run the command table above from the repo root. Diff the six sites vs the primitive; confirm
`git grep -n "IDENTITY_ENDPOINT"` in the six migrated files shows no remaining raw mint (storage
sites in `blob.ts` / `blob-store.ts` / `outlook-queue.ts` are TKT-250's, intentionally still present).

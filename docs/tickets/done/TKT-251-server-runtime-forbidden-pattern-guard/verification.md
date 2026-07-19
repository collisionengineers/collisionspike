# Verification — TKT-251: Add the server-runtime forbidden-pattern drift guard

## Verdict
PASS (offline; uncommitted on branch plan007/server-runtime)

## Evidence
- **A1 (guard exists, AST/import-aware, both prongs):** `scripts/checks/check-managed-identity-mint.mjs`
  parses TypeScript via the `typescript` compiler and detects both the raw-endpoint mint
  (`IDENTITY_ENDPOINT` -> `fetch` taint + `X-IDENTITY-HEADER`) and the SDK mint (`@azure/identity`
  `ManagedIdentityCredential` / `DefaultAzureCredential` import/construction).
- **A2 (scoped to production TS; passes on current tree):**
  `node scripts/checks/check-managed-identity-mint.mjs` ->
  `PASS (387 production TypeScript file(s) scanned; no token-mint surface outside packages/server-runtime).`
  (exit 0). AST-awareness proven: `blob-store.ts` presence-checks `process.env.IDENTITY_ENDPOINT`,
  `outlook-queue.ts` uses a `/IDENTITY_ENDPOINT/` regex literal, and `aoai.ts`/`chat-client.ts`/
  `graph.ts` mention `@azure/identity`/`DefaultAzureCredential` in comments — none are flagged.
  Python services, `*.test.ts`, and `.md` are excluded.
- **A3 (negative fixtures fail on both forms):**
  `node scripts/checks/check-managed-identity-mint.mjs --scan scripts/checks/fixtures/managed-identity-mint`
  -> `FAIL (6 finding(s))` (exit 1): 2 `raw-endpoint-mint` (fetch-from-endpoint + X-IDENTITY-HEADER)
  and 4 `sdk-mint` (two named imports + two `new …Credential()`). The fixtures live under
  `scripts/checks/`, outside the production scan, so the normal run (A2) does not include them.
- **A4 (wired into verify-all + CI):** `verify-all.mjs` invokes `Managed-identity mint boundary`;
  `package.json` adds `check:managed-identity-mint`; the unit test is covered by the existing
  `Repository check unit tests` glob (`node --test scripts/checks/*.test.mjs`).
- **A5 (no cloud write):** guard is a pure offline AST scan; no live deployment or cloud mutation.
- **Unit test:** `node --test scripts/checks/check-managed-identity-mint.test.mjs` -> 12/12 pass.
- **No-regression:** `node --test scripts/checks/*.test.mjs` -> 42/42 pass;
  `npm run check:runtime-contract` -> passed (191 routes, unchanged);
  `node scripts/checks/check-source-size.mjs` -> passed (new files within the 800-line budget).

## Pending / gaps
None for the ticket scope. Full `node verify-all.mjs` (npm ci + builds + all Python suites) not run
end-to-end here; the guard, its test, the aggregate check-test glob, runtime-contract, and
source-size were each run individually and pass. Left uncommitted per instruction (no status move,
no push).

## How to re-verify
- `node scripts/checks/check-managed-identity-mint.mjs` (expect PASS, exit 0).
- `node scripts/checks/check-managed-identity-mint.mjs --scan scripts/checks/fixtures/managed-identity-mint`
  (expect FAIL with both `raw-endpoint-mint` and `sdk-mint`, exit 1).
- `node --test scripts/checks/check-managed-identity-mint.test.mjs` (expect 12/12 pass).

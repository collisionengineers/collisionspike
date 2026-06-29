# Handoff 03 — Data API + identity hardening (OPEN_ITEMS §A2 [BUILD])

_Author: `api-hardener` · 2026-06-28 · scope: Data API auth hardening, tests, httpsOnly, verify-all coverage._

This closes the **[BUILD]** half of OPEN_ITEMS **§A2 — API + identity hardening** ("Durable API
hardening — durable auth error-handling + token **audience-form** hardening"), plus two stack-doctor
findings (httpsOnly P2; verify-all api coverage). The remaining §A2 item ("Staff app-role assignment")
is **[OPERATOR]** and out of scope here.

## TL;DR

- The auth module (`api/src/lib/auth.ts`) was already fundamentally sound — 401/403/500 discrimination,
  **both** audience forms accepted, legacy `CollisionSpike.Admin` back-compat, no internal leakage, and
  all 30+ HTTP routes wrapped. Audit found **one real inconsistency** (internal routes mapped every auth
  failure to 401), now fixed by unifying error handling into one tested helper.
- Added the **first unit-test suite in `api/`** — 19 tests, real `jose` verification (only the JWKS
  fetch is mocked), covering valid/wrong-aud/wrong-iss/expired/tampered/missing-role/legacy-Admin paths.
  **All pass.**
- **httpsOnly** set to `true` on **both** `cespk-api-dev` and `cespk-orch-dev` (was `false`). Verified
  live: http → 301-redirects to https; SPA still loads; all internal callers already use https.
- **verify-all.mjs** now builds + tests the live Data API (gate `2b`). Full gate is **green**
  (12 passed, 0 failed, 3 skipped).
- **Committed nothing.** No API redeploy needed (see "Recommended deploy" below).

---

## 1. Auth audit — findings

**What I read:** `api/src/lib/auth.ts` (jose JWT validation + app-role authz), every `api/src/functions/*.ts`
route registration, and `orchestration/src/lib/data-api.ts` (the internal-route client) to understand how
status codes propagate to Durable activities.

### Verified-correct (no change needed)

1. **401 vs 403 vs 500 in `withRole`.** Missing/invalid/expired token → **401** (lets the SPA silently
   re-acquire a token); authenticated but lacking the required role → **403** `{error:'forbidden'}`;
   unexpected handler/server error → **500** `{error:'internal'}` (logged via `ctx.error`, never leaked).
2. **Audience-form hardening already present.** `audienceCandidates()` accepts **both** the bare client-id
   GUID (`fa2fb28c-fef6-40a4-8d3b-ae6725891d72`, what v2 tokens carry) **and** `api://<id>`. This is
   load-bearing in production: live read-back shows `cespkbox-fn-v76a47` presents
   `DATA_API_AUDIENCE = api://fa2fb28c…` — so the `api://` branch is actually exercised by a live caller.
3. **Issuer + signing-key validation correct.** `ISSUER = https://login.microsoftonline.com/<tenant>/v2.0`
   and the JWKS is the tenant v2.0 discovery keyset (`createRemoteJWKSet`), passed to `jwtVerify` which
   enforces signature + `iss` + `aud` + `exp`. Tenant is read from `ENTRA_TENANT_ID` (the live tenant
   `858cf5b3-…`).
4. **Legacy role back-compat.** `SUPERUSER_VALUES = ['CollisionSpike.Superuser', 'CollisionSpike.Admin']`
   — a token minted before the 2026-06-27 rename still authorizes, so renaming can't lock anyone out.
5. **All routes gated.** Every `app.http(...)` handler in `cases/providers/inspection/dashboard/gates/
   settings/inbound/proxy` is wrapped in `withRole`; `internal.ts` wraps every route in `withServiceAuth`.
   No unwrapped/anonymous-by-mistake route exists. (The API has **no timer/Durable triggers itself** — the
   Durable orchestration lives in `orchestration/`; the API's "durable" surface is the `/api/internal/*`
   routes that Durable activities call.)

### The one real finding — fixed

**`withServiceAuth` (internal routes) mapped _every_ authentication error to 401**, via a bare
`catch {}`. That is inconsistent with `withRole`, which lets an **unexpected** error (e.g. a transient
JWKS-fetch network failure — jose surfaces these as a non-`JOSEError` throw) become a **500**. Effect: a
transient server-side fault on an internal route would be reported to the Durable activity as a 401
("bad token") rather than a 5xx server fault. The orchestration client (`data-api.ts`) throws on any
non-OK status and relies on the Durable retry policy, so this is primarily a **diagnostic-accuracy** bug
(a transient outage masquerading as auth) — but unifying it also guarantees consistent, correct HTTP
semantics across the whole API.

---

## 2. What changed (code) — committed nothing

| File | Change |
|---|---|
| `api/src/lib/auth.ts` | Exported `HttpError`; added a shared **`toErrorResponse(e, ctx)`** helper (HttpError → its status+message; anything else → logged 500 `{error:'internal'}`). Refactored `withRole`'s catch to use it (behaviour identical). |
| `api/src/functions/internal.ts` | `withServiceAuth` now routes auth failures through `toErrorResponse` — so a missing/invalid token → 401, but an **unexpected** failure → 500 (same discrimination as `withRole`). Removed the redundant manual header pre-check (now handled by `authenticate`). |
| `api/src/lib/auth.test.ts` | **New.** 19-test vitest suite (details below). |
| `api/package.json` | Added `"test": "vitest run"` script + `vitest` devDependency. |
| `api/vitest.config.ts` | **New.** Restricts vitest to `src/**/*.test.ts` and excludes `dist/**` (tsc emits compiled `.test.js` copies into dist; without this they'd be double-run). |
| `verify-all.mjs` | Added gate `2b` (Data API tsc build + vitest); updated the header note. |

**Behaviour change is limited to**: internal routes now return 500 (not 401) on a genuinely unexpected
error. No change to the success path, the 401-on-bad-token path, the 403 path, or any audience/issuer/
role logic.

---

## 3. Tests

New suite **`api/src/lib/auth.test.ts`** — uses the **real** `jose` verifier (locally-generated RS256
keypair; only `createRemoteJWKSet` is mocked to resolve the local public key), so signature, audience,
issuer and expiry are genuinely enforced rather than stubbed. Tokens are minted with jose's `SignJWT`.

Coverage:
- **Valid**: User token on a User route; **bare-GUID** audience form; **`api://<id>`** audience form;
  Superuser token satisfies both User + Superuser routes; legacy **`CollisionSpike.Admin`** accepted as
  Superuser; `authenticate()` returns the verified payload + roles.
- **401 (authn)**: wrong audience; wrong issuer; expired; **untrusted signing key**; missing
  `Authorization` header; non-`Bearer` header; body is a plain message (no leakage).
- **403 (authz)**: no roles on a User route; plain User on a Superuser route; unknown role
  (`CollisionSpike.Engineer`) on a User route.
- **500 (server)**: handler throw → 500 `{error:'internal'}` + `ctx.error` called; `toErrorResponse`
  HttpError → its status; `toErrorResponse` unexpected error → 500.

**Result:**

```
npm run test --workspace @cs/api
  Test Files  1 passed (1)
       Tests  19 passed (19)
```

`tsc -b` (api build) is clean.

---

## 4. httpsOnly fix (stack-doctor P2)

Both Function Apps had `httpsOnly=false`. Set to `true` on both:

```
az functionapp update -g rg-collisionspike-dev -n cespk-api-dev  --set httpsOnly=true   # → true
az functionapp update -g rg-collisionspike-dev -n cespk-orch-dev --set httpsOnly=true   # → true
```

**Verification (live):**
- Read-back: `httpsOnly=true` on both (via `az resource show … properties.httpsOnly`).
- **No plain-http dependency** — every internal caller already targets https:
  - orch `DATA_API_URL = https://cespk-api-dev.azurewebsites.net`
  - box-fn `DATA_API_URL = https://cespk-api-dev.azurewebsites.net`
  - SPA → API via `rest-client.ts` over https
- **SPA still loads**: `GET https://proud-sky-04e318b03.7.azurestaticapps.net/` → **200**.
- **API serves TLS**: `GET https://…/api/dashboard/live-counts` (no token) → **401** (auth gate healthy).
- **httpsOnly enforced**: `GET http://…/api/dashboard/live-counts` → **301** redirect to the https URL.

Nothing depended on plain http, so nothing was backed out. This is a config-only change (no deploy).

---

## 5. verify-all coverage (env-bootstrap recommendation)

`verify-all.mjs` previously built/tested the SPA + `@cs/domain` + the Python Functions, but **not** the
live `api/`. Added gate **`2b`** (matching the existing `run()` style):

```
run('Data API — tsc build',     'npm run build:api', { tail: 1 });
run('Data API — vitest (auth)', 'npm run test --workspace @cs/api', { tail: 3 });
```

(`build:api` also builds the `@cs/domain` project reference, so this is the Data API's offline gate.)
The orchestration `orchestration/` TS app is still not covered by verify-all — left as a follow-up.

**Full gate re-run: GREEN** — `12 passed, 0 failed, 3 skipped` (skips = the two retired Power-Platform
gates + the superseded connector-seam gate; all Python suites pass).

> **Footnote (env hygiene, not caused by my code):** my first `npm install` (adding the `vitest` devDep)
> tripped the well-known npm optional-deps bug (npm/cli#4828) and pruned `@rollup/rollup-linux-x64-gnu`
> from the root `node_modules`, which briefly broke the Code App's vite build. Restored with
> `npm install --no-save @rollup/rollup-linux-x64-gnu@4.62.0` (no package.json/lock change). verify-all
> is green again. Worth knowing for the IaC/bootstrap workstream.

---

## 6. Recommended deploy

**No redeploy is required to satisfy this task**, but note:

- The **httpsOnly** change is **already live** (config-only; applied + verified above).
- The **auth code changes** (`auth.ts` + `internal.ts`) are **not yet deployed** — they live only in the
  working tree. They are low-risk and behaviour-preserving on every path except "internal route hits an
  unexpected error" (now 500 instead of 401). **Recommendation:** fold them into the **next** scheduled
  `cespk-api-dev` deploy (esbuild bundle `deploy/api/main.cjs`) rather than pushing a standalone deploy —
  there is no live incident these fix, only a diagnostic-accuracy + consistency improvement plus the new
  tests. Validate locally first (`npm run build:api && npm run test --workspace @cs/api`, both green here).

**Nothing was committed** (per brief).

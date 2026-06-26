---
name: azure-api-deploy-and-auth
description: How to rebuild/redeploy the Azure TS Functions API + the Entra auth model + the Postgres RLS least-priv login (cespk_app) — incl. the node_modules deploy gotcha, the v2-token audience fix, and the app.role startup-option mechanism
metadata:
  type: project
---

The live Azure data API is **cespk-api-dev** (Node 20 / TypeScript Functions v4; source `api/`,
entry `api/src/index.ts`). It is deployed as a **single esbuild bundle** `deploy/api/main.cjs`
(`pg`+`jose`+`@cs/domain` bundled in, `@azure/functions` external). Orchestration is `cespk-orch-dev`
(`orchestration/` → `deploy/orch/main.cjs`), same shape.

**Rebuild + redeploy recipe (verified 2026-06-26):**
1. `npm run build --prefix api` (tsc -b typecheck).
2. `npx esbuild api/src/index.ts --bundle --platform=node --format=cjs --target=node20 --external:@azure/functions --outfile=deploy/api/main.cjs`.
3. Smoke: `node -e "require('.../deploy/api/main.cjs')"` — it logs "test mode" + lists all 42 functions registering; that's healthy.
4. **GOTCHA (caused a live 404 outage):** the app deploys with `remotebuild = false`, so Kudu does NOT run `npm install`. The zip MUST already contain `node_modules`. Run `npm install --prefix deploy/api` (installs the lone `@azure/functions` dep) BEFORE publishing, or the worker can't load `main.cjs` → every route 404s.
5. Publish: from `deploy/api/`, `func azure functionapp publish cespk-api-dev --javascript` (needs the flag — no local.settings.json to infer the language). Success lists all 42 functions.
6. Verify: `no-auth → 401 "Missing bearer token"`; a bad token → `401 "Invalid or expired token"` (NOT 500); pick a real route. Keep `deploy/api/main.cjs.bak` for rollback.

**Auth model:** Entra workforce MSAL (SPA client `30ff23e0…`, tenant `858cf5b3-aa0a-47a6-9b40-4851fd0afa94`),
API app `fa2fb28c-fef6-40a4-8d3b-ae6725891d72` with `requestedAccessTokenVersion=2` → v2 tokens carry
**`aud` = the bare client-id GUID**, NOT `api://…` (Microsoft Learn: "in v2.0 tokens the audience is
the client ID of the API"). `api/src/lib/auth.ts` now accepts both forms (`audienceCandidates`) and maps
any `jose` error to **401** (previously a non-HttpError fell through to a generic **500** — that was the
"every page → 500 {error:internal}" outage). App roles `CollisionSpike.User`/`.Admin`; only one staff
principal is app-role-assigned so far (others 403 until assigned). Related: [[exchange-rbac-unblocks-graph-intake]].

**Postgres credential (P0 — credential leak REMEDIATED 2026-06-26):** `PGPASSWORD` is now a Key Vault
reference to `cespk-pg-kv-dev/pg-admin-password` (API system-assigned MI has Key Vault Secrets User), the
csadmin password was **rotated**, and the residential firewall rule was removed (AllowAzureServices kept —
the Flex app has no VNet and needs it).
**GOTCHA that caused a live DB outage:** a **versionless** KV reference
(`.../secrets/pg-admin-password/`) served the **STALE cached secret version** after the rotation — even
across `az functionapp restart` and a `func publish` — so the API sent the OLD password → every DB query
failed `password authentication failed for user "csadmin"` (dashboard/queues 500, auth itself fine). FIX:
pin the app-setting to the **versioned** SecretUri (`.../secrets/pg-admin-password/<versionId>`), which
forces immediate re-resolution. Trade-off: a future rotation must re-point to the new version (or revert to
versionless and tolerate the refresh lag). Verify a rotation end-to-end by loading the live dashboard
(chrome-devtools MCP) — every `/api/dashboard/*` + `/api/queues/*/cases` should be 200; App Insights
captures the pg error only because host.json sampling now excludes `Exception` from sampling.
**RLS least-priv flip (P2 — RESOLVED 2026-06-26):** the API no longer connects as csadmin. A **non-owner
login `cespk_app`** (NOSUPERUSER, NOBYPASSRLS) was minted; its password is a SECOND KV secret
`cespk-pg-kv-dev/cespk-app-password` (versioned ref). App-settings flipped: `PGUSER=cespk_app`,
`PGPASSWORD=@KV(cespk-app-password/<ver>)`, `PGAPPROLE=staff`. Grants: SELECT/INSERT/UPDATE on all tables
EXCEPT `audit_event` (INSERT/SELECT only → append-only at grant layer too); **no DELETE anywhere**. The
per-connection DB role is set via the libpq **startup option** `-c app.role=${PGAPPROLE}` in the pg.Pool
`options` (`db.ts`) — **not** `SET LOCAL` per query (no hot-path refactor; the API issues no DELETEs, and
RLS only special-cases admin for DELETE) and **not** a role-default GUC (Azure Flexible Server forbids
csadmin, a non-superuser, from persisting one → "permission denied to set parameter"). GOTCHA: csadmin
(CREATEROLE, not superuser) may NOT name `NOSUPERUSER`/`NOBYPASSRLS` in `ALTER ROLE` — but `CREATE ROLE …
LOGIN` already defaults to exactly that shape, so set only LOGIN + PASSWORD. Verified live (chrome-devtools):
all `/api/dashboard/*` + `/api/queues/*/cases` 200 as cespk_app; `DELETE case_` and `UPDATE audit_event`
denied. A future admin-delete path (ADR-0017 retention cascade) must use a SEPARATE pool with
`-c app.role=admin` gated on a verified `CollisionSpike.Admin` token. To run DDL from a workstation, add a
transient Postgres firewall rule for your IP (`az postgres flexible-server firewall-rule create -s
cespk-pg-dev -n <name> …`) then delete it — only `AllowAzureServices` (0.0.0.0) should remain.

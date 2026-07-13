# Playbook — build + deploy the API / orchestration / SPA

**When to use.** Ship a code change to `cespk-api-dev` (Data API), `cespk-orch-dev` (orchestration), or
`cespk-spa-dev` (SPA).

**Platform ([routing table](./README.md)):** BUILD on **Windows** (npm/tsc/esbuild against the native
`C:\` checkout — steps 1–4), PUBLISH from **WSL** (`func`/`az` live there, logged in; run step 5 as
`wsl -e bash -lc 'cd /mnt/c/…/deploy/api && func azure functionapp publish …'`). The Python Functions
(box-webhook/parser/…) publish the same way with `--build remote --python`.

## Invoke first
1. **`mcp__azure__get_azure_bestpractices`** (`resource=azurefunctions`, `action=deployment` — or
   `static-web-app` for the SPA) **before** generating/deploying. Mandatory per the Azure MCP rules.
2. **`azure:azure-validate`** (preflight: config, identity/RBAC, readiness) → **`azure:azure-deploy`**.
3. Agent: **azure-integration-engineer** owns the build/deploy wiring.
4. The live deploy sequence is `migration/00-MASTER-WORKFLOW.md` — **`DEPLOY-RUNBOOK.md` is superseded**
   (it deploys the decommissioned Power Platform stack; do not follow it).

## Procedure — Function Apps (api / orch)
Both are a **single esbuild bundle** (`deploy/api/main.cjs`, `deploy/orch/main.cjs`).
1. `npm run build --prefix api`  (or `--prefix orchestration`)  — tsc typecheck, builds `@cs/domain` too.
2. `node build-api.cjs`  (or `node build-orch.cjs`) — esbuild bundle **with the import.meta.url banner**.
3. Smoke the bundle against the Windows workspace dependencies:
   `node -e "require('./deploy/api/main.cjs')"` → test-mode warnings + lists all functions
   (NOT a `createRequire`/`ERR_INVALID_ARG_VALUE` crash).
4. Package runtime dependencies. API uses Sharp's native image decoder, so install its **Linux x64
   glibc** optional binary explicitly even though the bundle is built on Windows:
   `npm ci --prefix deploy/api --omit=dev --include=optional --os=linux --cpu=x64 --libc=glibc`.
   Confirm both `deploy/api/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64-*.node` and
   `deploy/api/node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.*` exist. For orchestration,
   the existing `npm ci --prefix deploy/orch --omit=dev` remains sufficient.
5. From `deploy/api/`: `func azure functionapp publish cespk-api-dev --javascript` (orch: `cespk-orch-dev`).
6. App-settings via `az functionapp config appsettings set` (gates default-off; secrets as KV refs).

## Multi-surface rollout order

For a change that alters a SPA↔API contract, publish in this order:

1. apply its additive database delta;
2. publish and smoke-check the API;
3. publish orchestration when it consumes new internal API routes;
4. deploy the SPA last, then hard-refresh and smoke-check it.

The API must remain compatible with the previously cached SPA during this window. In particular,
TKT-165's evidence route derives a stable target-bound identity for the older upload request that
does not send the new source/idempotency fields, while always returning evidence identities. The new
SPA deliberately refuses to claim completion without those identities, so it must not precede the
compatible API.

TKT-166 additionally requires
`deltas/2026-07-12-tkt166-manual-intake-case-create.sql` before the API: both staff and internal
readiness recomputes consult the new manual-intake operation row. After the delta, publish the API
before the SPA so a cached SPA continues to create cases without the optional retry headers, while
the new SPA can safely replay one case and its exact source-file batch. The same additive delta adds
the archive terminal-state columns and replaces the pending index; apply it before publishing the API
that filters dead-lettered work or exposes the Evidence retry action.

## Procedure — SPA (Static Web App)
`npm run build` in `mockup-app/` — the four public `VITE_*` values are **committed in
`mockup-app/.env.production`** (Vite loads it automatically for `build`; a build without them bakes
`undefined` into rest-client/MSAL and the deployed app **crashes blank at first paint** — the
2026-07-02 outage) → deploy `dist/` to `cespk-spa-dev`
(`swa deploy` / `az staticwebapp`). **Build before deploy, then hard-refresh** (the SWA edge caches).
**Copy `mockup-app/staticwebapp.config.json` into `dist/` before deploying** — the strict CSP + SPA
navigation fallback live there, NOT in the Vite output; a bare-`dist/` upload silently ships the app
**without its CSP** (verified 2026-07-01 — the SWA CLI only picks the config up when it sits in/next to
the deployed folder). Smoke-check the CSP header on the live URL after every deploy.

## Gotchas (load-bearing — caused real outages)
- **esbuild ESM→CJS `import.meta.url` → 0 functions.** Omitting the `build-{api,orch}.cjs` banner
  (`define {'import.meta.url':'__importMetaUrl'}` + `banner` setting it from `pathToFileURL(__filename)`)
  leaves the host at **0 functions while `state: Running`**. Ref [azure-orch-deploy](../../memory/azure-orch-deploy.md).
- **`remotebuild=false` → must ship `node_modules`.** Kudu won't `npm install`; skip step 3 and every
  route **404s**. Ref [azure-api-deploy-and-auth](../../memory/azure-api-deploy-and-auth.md).
- **`API_AUDIENCE` must be the bare client-id GUID** (`fa2fb28c…`), not `api://<guid>` — v2 tokens carry
  `aud` = client-id. The wrong form rejected every token as a generic **500**. Ref [azure-api-deploy-and-auth](../../memory/azure-api-deploy-and-auth.md).
- **An app-setting change recycles the app** (brief restart) — expected; flip gates off-hours.
- **Counting functions:** `--query "[].name"` then count — **never `length(@)`** (Windows az.cmd parens).
- **az runs in WSL** (see the [platform routing](./README.md)) — mind the double quoting layer inside
  `wsl -e bash -lc '…'`. The old "PowerShell, not Git Bash, for resource-id/URL args" rule applies only
  to a WINDOWS az (none installed as of 2026-07-04).

## Best-practice refs (Microsoft Learn)
- Reliable Functions: <https://learn.microsoft.com/azure/azure-functions/functions-best-practices>
- Securing Functions (KV refs + identity connections): <https://learn.microsoft.com/azure/azure-functions/security-concepts>
- Static Web Apps deploy: use `mcp__azure__get_azure_bestpractices` `resource=static-web-app`.

## Anti-churn checkpoint
A failed publish? Run the **local smoke** (`node -e require(main.cjs)`) and check the **0-functions /
node_modules** gotchas above before re-publishing. Don't re-`func publish` in a loop — that's the churn
the `azure-churn-guard` will STOP.

## Verify
- API: `func` publish lists the API's function count — cross-check it against the registry
  [live-environment.md](../architecture/live-environment.md) (`0` is the registration-crash signature, not
  a healthy deploy); `no-auth → 401`; a real route 200.
- Orch: `az functionapp function list … -n cespk-orch-dev --query "[].name"` matches the orch count in the
  [same registry](../architecture/live-environment.md) (`0` = the `import.meta.url` crash, not healthy).
- SPA: load `https://proud-sky-04e318b03.7.azurestaticapps.net` (chrome-devtools MCP) — assets 200, the
  API calls 200/401 (not CORS-blocked).

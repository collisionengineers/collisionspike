# Playbook — build + deploy the API / orchestration / SPA

**When to use.** Ship a code change to `cespk-api-dev` (Data API), `cespk-orch-dev` (orchestration), or
`cespk-spa-dev` (SPA).

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
3. **`npm install --prefix deploy/api --omit=dev`** (orch: `deploy/orch`) — ship `node_modules`.
4. Smoke: `node -e "require('./deploy/api/main.cjs')"` → test-mode warnings + lists all functions
   (NOT a `createRequire`/`ERR_INVALID_ARG_VALUE` crash).
5. From `deploy/api/`: `func azure functionapp publish cespk-api-dev --javascript` (orch: `cespk-orch-dev`).
6. App-settings via `az functionapp config appsettings set` (gates default-off; secrets as KV refs).

## Procedure — SPA (Static Web App)
`npm run build` in `mockup-app/` (with the `VITE_*` env baked in) → deploy `dist/` to `cespk-spa-dev`
(`swa deploy` / `az staticwebapp`). **Build before deploy, then hard-refresh** (the SWA edge caches).

## Gotchas (load-bearing — caused real outages)
- **esbuild ESM→CJS `import.meta.url` → 0 functions.** Omitting the `build-{api,orch}.cjs` banner
  (`define {'import.meta.url':'__importMetaUrl'}` + `banner` setting it from `pathToFileURL(__filename)`)
  leaves the host at **0 functions while `state: Running`**. Ref [[azure-orch-deploy]].
- **`remotebuild=false` → must ship `node_modules`.** Kudu won't `npm install`; skip step 3 and every
  route **404s**. Ref [[azure-api-deploy-and-auth]].
- **`API_AUDIENCE` must be the bare client-id GUID** (`fa2fb28c…`), not `api://<guid>` — v2 tokens carry
  `aud` = client-id. The wrong form rejected every token as a generic **500**. Ref [[azure-api-deploy-and-auth]].
- **An app-setting change recycles the app** (brief restart) — expected; flip gates off-hours.
- **Counting functions:** `--query "[].name"` then count — **never `length(@)`** (Windows az.cmd parens).
- Use **PowerShell, not Git Bash**, for `az` with resource-id/URL args.

## Best-practice refs (Microsoft Learn)
- Reliable Functions: <https://learn.microsoft.com/azure/azure-functions/functions-best-practices>
- Securing Functions (KV refs + identity connections): <https://learn.microsoft.com/azure/azure-functions/security-concepts>
- Static Web Apps deploy: use `mcp__azure__get_azure_bestpractices` `resource=static-web-app`.

## Anti-churn checkpoint
A failed publish? Run the **local smoke** (`node -e require(main.cjs)`) and check the **0-functions /
node_modules** gotchas above before re-publishing. Don't re-`func publish` in a loop — that's the churn
the `azure-churn-guard` will STOP.

## Verify
- API: publish lists **42** functions; `no-auth → 401`; a real route 200.
- Orch: `az functionapp function list … -n cespk-orch-dev --query "[].name"` → **41**.
- SPA: load `https://proud-sky-04e318b03.7.azurestaticapps.net` (chrome-devtools MCP) — assets 200, the
  API calls 200/401 (not CORS-blocked).

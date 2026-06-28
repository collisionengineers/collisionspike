# Playbook — diagnose a live Function/API/orch error or outage

**When to use.** A live Azure thing is misbehaving: `cespk-api-dev` 500s, `cespk-orch-dev` registered
0 functions / isn't processing, a retained Python Function 4xx/5xx, an outage, cold-start, or "it worked
yesterday." This is the **highest-churn** area — route here instead of looping `az`.

## Invoke first
1. **`azure:azure-diagnostics`** skill — the structured triage flow (AppLens, Azure Monitor, resource
   health, safe checks).
2. **`mcp__azure__applens`** / **`mcp__azure__resourcehealth`** — Microsoft's own "Diagnose and solve
   problems" detectors (Function Configuration Checks, "Function App Down or Reporting Errors").
3. **Dispatch the read-only `azure-diagnostician` agent** for anything multi-step — let it pull
   logs/KQL/health and return a **root-cause + fix**, so the main loop doesn't thrash.
4. Logs/KQL detail → [logs-kql.md](./logs-kql.md).

## Procedure
1. Scope it: which app (`cespk-api-dev` / `cespk-orch-dev` / a `cespk*`/`cespike-parser-dev` Python fn),
   what changed (recent deploy? app-setting flip? secret rotation?).
2. Run the Function App diagnostics (AppLens via `mcp__azure__applens`, or portal **Diagnose and solve
   problems**) — it checks runtime version, **Key Vault & managed-identity config**, startup events,
   recent deployments, execution health.
3. Pull the canonical error window from App Insights (`cespike-parser-ai-dev`) — see [logs-kql.md](./logs-kql.md):
   `requests`, `traces | where customDimensions.LogLevel == "Error"`, `exceptions` over `ago(30m)`.
4. Map the symptom (see Gotchas) → the owning playbook for the fix.

## Gotchas (this project — verify, don't relearn)
- **Host registered 0 functions but `state: Running`** → the esbuild **ESM→CJS `import.meta.url`** crash
  (entry module threw before any registration). Confirm: `node -e "require('./deploy/orch/main.cjs')"`
  crashes with `ERR_INVALID_ARG_VALUE`. Fix lives in [deploy.md](./deploy.md) (the `build-orch.cjs`
  banner). Healthy = 41 functions (orch) / 42 (api). Ref [[azure-orch-deploy]].
- **Every route 404** after a deploy → the deploy zip shipped **without `node_modules`** (`remotebuild=false`
  → Kudu won't `npm install`). Fix in [deploy.md](./deploy.md). Ref [[azure-api-deploy-and-auth]].
- **Every page 500 `{error:internal}`** (auth itself fine) → either the **versionless KV ref** serving a
  stale Postgres password ([secrets-keyvault.md](./secrets-keyvault.md)), or a `jose` error mapped to 500
  instead of 401 (token-audience). Ref [[azure-api-deploy-and-auth]].
- **Orch deployed but processing no mail** → it is **deployed + wired, NOT live** by design (no Graph
  subscriptions / no Exchange-RBAC scope). That's not a bug — see
  [`live-environment.md`](../architecture/live-environment.md) §gaps + [entra-graph.md](./entra-graph.md).
- **App Insights "missing logs"** is usually **sampling**, not a real gap — see [logs-kql.md](./logs-kql.md).

## Best-practice refs (Microsoft Learn)
- Functions troubleshooting workflow + diagnostic checks: <https://learn.microsoft.com/troubleshoot/azure/azure-functions/availability/functions-troubleshoot-issues>
- App Insights logs missing/incorrect (Function Configuration Checks): <https://learn.microsoft.com/troubleshoot/azure/azure-functions/monitoring/functions-monitoring-appinsightslogs>
- Reliable Functions / monitor effectively: <https://learn.microsoft.com/azure/azure-functions/functions-best-practices#monitor-effectively>

## Anti-churn checkpoint
If your first probe didn't reveal the cause, **do not start guessing-and-restarting.** Invoke
`azure:azure-diagnostics` (or hand it to `azure-diagnostician`) and read `microsoft-docs` for the exact
error string. A repeated failing `az` will trip the `azure-churn-guard` STOP.

## Verify the fix
- API: `no-auth → 401`, bad token → 401 (not 500); a real route 200 (load the live dashboard with the
  chrome-devtools MCP — every `/api/dashboard/*` + `/api/queues/*/cases` should be 200).
- Orch: `az functionapp function list -g rg-collisionspike-dev -n cespk-orch-dev --query "[].name"` → 41.

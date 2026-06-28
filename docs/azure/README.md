# Azure operations playbooks — router + anti-churn doctrine

**Why this folder exists.** The live stack is pure Azure PaaS and we have a large purpose-built
toolbox — **28 `azure:*` skills**, the **`mcp__azure__*`** MCP toolset, `az`/`func`/`psql` CLIs, the
`microsoft-docs:*` Learn lookups, and two Azure agents. The failure mode this folder kills: hitting an
Azure problem and **hand-rolling `az`/KQL in a loop instead of invoking the skill that exists for it**.
Each playbook says *which skill/tool/agent to reach for first*, the procedure, and the load-bearing
gotchas (it **references** [`live-environment.md`](../architecture/live-environment.md),
[`AGENTS.md`](../../AGENTS.md), and `memory/azure-*` — it does not duplicate them).

Routing is also summarised in [CLAUDE.md](../../CLAUDE.md) (always in context) and enforced by two guard
hooks (`.claude/hooks/azure-route-guard.mjs` PreToolUse + `azure-churn-guard.mjs` PostToolUse).

## Anti-churn doctrine (read this first)

1. **Two strikes → stop.** If the same Azure op fails twice, do **not** run it a third time. Invoke the
   matching skill or `microsoft-docs:microsoft-docs` to learn *why* first. (The `azure-churn-guard` hook
   injects a STOP on the 2nd identical failure — heed it.)
2. **Skill before CLI.** For any non-trivial op, invoke the named `azure:*` skill or `mcp__azure__*` tool
   first — they encode the procedure + footguns. Raw `az` is the fallback, not the reflex.
3. **Docs before retry.** When a Microsoft behavior / limit / error is unclear, look it up
   (`microsoft-docs`, or the per-playbook Learn links) before guessing-and-retrying.
4. **Dispatch, don't thrash.** For a live investigation, hand it to the read-only **azure-diagnostician**
   agent and act on its root-cause — don't debug inline in a hot loop.
5. **Verify against reality.** Docs can lag; confirm with the live resource (see each playbook's *Verify*).

## Routing table — task → invoke first → playbook

| Task | Invoke first → | Playbook |
|---|---|---|
| Diagnose a live Function/API/orch error or outage | `azure:azure-diagnostics` → `mcp__azure__applens` / `resourcehealth`; dispatch **azure-diagnostician** | [diagnose.md](./diagnose.md) |
| Read App Insights / Log Analytics (KQL) | `azure:azure-kusto` / `mcp__azure__monitor` + `applicationinsights` | [logs-kql.md](./logs-kql.md) |
| Build + deploy API / orch / SWA | `azure:azure-validate` → `azure:azure-deploy`; `mcp__azure__get_azure_bestpractices` | [deploy.md](./deploy.md) |
| Grant RBAC / managed identity | `azure:azure-rbac` → `mcp__azure__role` | [identity-rbac.md](./identity-rbac.md) |
| Secrets / Key Vault / rotation | `azure:azure-compliance` + KV-ref pattern → `mcp__azure__keyvault` | [secrets-keyvault.md](./secrets-keyvault.md) |
| Entra app-reg / token audience / Graph subs / Exchange-RBAC | `azure:entra-app-registration`; `microsoft-docs` | [entra-graph.md](./entra-graph.md) |
| **Activate Box** (wire the JWT creds into KV, reconcile gates, smoke-test) | `azure:azure-compliance` / `mcp__azure__keyvault` | [box-activation.md](./box-activation.md) |
| Postgres ops (RLS, app.role, audit) | `mcp__azure__postgres` / `psql` | [postgres.md](./postgres.md) |
| Understand any Microsoft behavior/limit/error | `microsoft-docs:microsoft-docs` **before** retrying | — |
| What's deployed / inventory | `azure:azure-resource-lookup` → `mcp__azure__group_resource_list` | — |

## Toolbox map (the full palette)

- **Skills (`azure:*`, 28):** diagnose `azure-diagnostics`; logs `azure-kusto`; deploy `azure-prepare`
  /`azure-validate`/`azure-deploy`; identity `azure-rbac`/`entra-app-registration`; secrets/compliance
  `azure-compliance`; AI/DocIntel `azure-ai`; storage `azure-storage`; reliability `azure-reliability`;
  inventory `azure-resource-lookup`/`azure-resource-visualizer`; cost/quota `azure-cost`/`azure-quotas`;
  upgrade `azure-upgrade`. Plus `microsoft-docs:*` (Learn) and `microsoft-docs:microsoft-code-reference`
  (verify SDK signatures).
- **MCP tools (`mcp__azure__*`):** `functionapp`, `functions`, `postgres`, `keyvault`, `role`, `applens`,
  `resourcehealth`, `monitor`, `applicationinsights`, `kusto`, `storage`, `group_resource_list`, `arm`,
  `get_azure_bestpractices` (`resource=general|azurefunctions|static-web-app` × `action=all|code-generation|deployment`),
  `documentation`. **Call `get_azure_bestpractices` before generating Azure code or deploying.**
- **CLIs:** `az`, `func`, `psql`, `swa`. **Use PowerShell, not Git Bash, for `az` with URL/resource-id
  args** (MSYS mangles leading-slash args) — see [AGENTS.md](../../AGENTS.md) §Stack-specific tooling.
- **Agents:** `azure-integration-engineer` (build/deploy/wire the live Azure stack),
  `azure-diagnostician` (read-only triage — dispatch live investigations here).

## How to use a playbook

Open the row's playbook, **invoke its "Invoke-first" skill/tool**, follow the short procedure, and check
the *Gotchas* before you run anything. If you're tempted to skip the skill and just `az` it — that's the
exact reflex this folder exists to stop.

## Live resources

The canonical, re-verified registry of resource names, IDs, app roles, and the live gaps is
[`architecture/live-environment.md`](../architecture/live-environment.md). Each playbook cites only the
few names it needs; that doc is the source of truth.

> Double-bracket wikilinks are reserved for `memory/`-internal cross-refs only. Docs link to memory
> via relative paths — e.g. [azure-orch-deploy](../../memory/azure-orch-deploy.md) →
> `memory/azure-orch-deploy.md`.

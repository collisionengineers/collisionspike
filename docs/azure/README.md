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
| Diagnose or reconcile `/api/inbound/counts` | `azure:azure-kusto` + `mcp__azure__postgres` | [postgres.md#inbound-dashboard-count-health-probe](./postgres.md#inbound-dashboard-count-health-probe) |
| Understand any Microsoft behavior/limit/error | `microsoft-docs:microsoft-docs` **before** retrying | — |
| What's deployed / inventory | `azure:azure-resource-lookup` → `mcp__azure__group_resource_list` | — |

## Platform routing — Windows vs WSL/Linux (pick BEFORE you type)

This is a **dual-platform workstation**: Windows 11 (PowerShell / Git Bash) **and** WSL2
Ubuntu-24.04. The toolchains are SPLIT, so the first move on any task is choosing the platform —
an agent should **state which platform it is using and why** when the choice isn't obvious, and
every playbook below carries a *Platform* line. Verified 2026-07-04 (the retro activation session
re-installed the WSL toolchain after it was found missing):

| Task | Platform | Why / what lives there |
|---|---|---|
| `az` / `func` / `psql` — deploys, Postgres DDL, Graph subs, gate flips | **WSL** | az 2.87 + Functions Core Tools 4.12 + psql 16 are installed **only in WSL** (`wsl -e bash -lc '…'`), with az logged in as the operator. The Windows side has none of them. |
| node / npm / vitest / esbuild bundle builds / `verify-all.mjs` (offline) | **Windows** | The checkout, Node, and node_modules are Windows-native on `C:\` — build here, then publish the built artefact from WSL via `/mnt/c/...`. Don't run npm installs through `/mnt/c` (slow, and WSL's `npm` resolves to the WINDOWS binary anyway). |
| Exchange Online admin — RBAC-for-Applications (`New-ManagementScope`, `Test-ServicePrincipalAuthorization`, Mail.Read/ReadWrite scoping) | **Windows PowerShell** | The `ExchangeOnlineManagement` module is PowerShell-only; WSL/bash cannot run these cmdlets. See [entra-graph.md](./entra-graph.md). |
| Docker / anything needing a Linux daemon or Linux-only binaries | **WSL/Linux** | No Windows-side docker; Linux tooling belongs in WSL. |
| `VERIFY_LIVE=1 node verify-all.mjs` (live drift diff) | ⚠️ split | Node is Windows-side but the script shells out to `az`, which is WSL-only — the live diff can't run as-is. Until az is installed on Windows (or the script learns to call `wsl az`), run the offline gate on Windows and verify live facts from WSL by hand (the registry's `sourceCommand`s). Known gap, noted 2026-07-04. |
| Git / file edits / doc gates (`check-doc-links`, `check-tickets`) | **Windows** | Windows-native checkout; Git Bash or PowerShell both fine. |

Cross-platform gotchas: WSL sees the repo at `/mnt/c/Users/PC/Documents/GitHub/…` (slower I/O — fine
for `func publish`, wrong for npm installs); commands inside `wsl -e bash -lc '…'` carry **two quoting
layers** — build az `--query` strings carefully; `wsl -u root` is passwordless here (how the toolchain
was reinstalled). The older "use PowerShell, not Git Bash, for az URL args" note applies only to a
WINDOWS az (MSYS path-mangling) — with az in WSL, normal bash quoting rules apply instead.

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
- **CLIs:** `az`, `func`, `psql`, `swa` — **all WSL-side** (see §Platform routing above). The
  legacy "use PowerShell, not Git Bash, for `az` URL/resource-id args" rule (MSYS mangling — see
  [AGENTS.md](../../AGENTS.md) §Stack-specific tooling) applies only if a Windows az is ever installed.
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

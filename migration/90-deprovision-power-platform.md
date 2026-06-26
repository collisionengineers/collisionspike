# 90 — Deprovision Power Platform

Tear down the Power Platform footprint completely (D3). **Phase P8 — runs only after P7 cutover is
green and observed healthy.** Order avoids orphaned dependencies and keeps the audit trail until the
new pipeline is proven.

> **The one fact that makes this whole phase simple.** Deleting the **environment** (the Dev sandbox,
> `b3090c42-…`) destroys *everything* inside it — solutions, the Code App, custom connectors,
> connections, the 12 tables, the 17 choicesets, the 28 env-vars, the flows, all rows — in one
> irreversible operation (`pac admin delete`, verified on Learn topic **pac admin**). So the granular
> steps below (disable flows, delete the Code App / connectors / solutions / connections) are **not**
> what erases the data — the environment delete is. They exist for two reasons only: (a) to **stop
> residual Dataverse writes** the moment cutover completes, and (b) to give an **orderly, auditable
> shutdown** rather than yanking the environment out from under live components. Treat steps 1–7 as a
> clean shutdown and step 8 as the actual eraser.

> **Unmanaged-solution caveat (why we don't lean on `pac solution delete` to remove tables).** Both
> solutions here are **unmanaged**. Deleting an *unmanaged* solution removes only the **solution
> container**, leaving its components (tables, choicesets, connectors, the Code App) behind in the
> environment as unmanaged customizations. So `pac solution delete` will **not** drop the 12 tables —
> only the environment delete does. Don't expect step 6 to clear the schema; it won't, and it doesn't
> need to, because step 8 follows.

## Precondition gate
- P7 done: the new Graph-webhook + Durable intake is the **sole live consumer** of the shared mailbox;
  the old Power Automate intake is OFF.
- The new stack has been observed healthy for the agreed soak period (intake → Case in Postgres,
  dedup holding, no R5 alerts).
- The `_baseline/` reference exports from P0 still exist (safety), **and** the final cold export
  (step 5 below) has been taken and archived off-repo.

## Identifiers (from the live registry / `power.config.json`)
| Thing | Value |
|---|---|
| Environment (sandbox) id | `b3090c42-51fb-ee24-9868-474da322a3ad` |
| Environment org URL | `https://collisionengineers-dev.crm11.dynamics.com` |
| Code App id | `da7ba7af-9ffc-4c70-8f75-1f053ca354da` ("Collision Engineers - Intake") |
| Schema solution | `CollisionSpike` (`fb532f91-…`) — 12 tables, 17 choicesets, 15 relationships, 28 env-vars, 2 roles |
| Flows solution | `CollisionSpikeFlows` (`41c87a85-…`) — 17 flow definitions + connection references |
| Custom connectors | `cr1bd_ceparser`, `cr1bd_evasentry`, `dvsaenrich`, `evavalidation`, `box_rest`, `ocr`, location-assist |

Authenticate once and **pin every command to this environment** so nothing runs against the wrong
tenant org:
```powershell
pac auth create --environment https://collisionengineers-dev.crm11.dynamics.com
pac auth list           # confirm the active profile points at the Dev sandbox
pac org who             # echoes the connected org — verify before any delete
```
Every `pac` verb below also accepts `--environment b3090c42-51fb-ee24-9868-474da322a3ad` explicitly;
prefer passing it on the irreversible commands.

## Teardown sequence

### 1. Disable the live flows (stop residual writes)
There is **no `pac flow`/`pac` verb to disable a cloud flow** (the `pac` command groups are admin,
solution, connection, connector, code, data, … — no flow group). Turn them off via **one** of:
- **Power Automate maker portal** → *My flows* / the `CollisionSpikeFlows` solution → toggle each flow
  **Off** (fastest for ~7 live flows).
- **PowerShell admin module** `Microsoft.PowerApps.Administration.PowerShell`:
  ```powershell
  Install-Module Microsoft.PowerApps.Administration.PowerShell -Scope CurrentUser
  Add-PowerAppsAccount
  # list cloud flows in the environment, then disable each by name/id:
  Get-AdminFlow -EnvironmentName b3090c42-51fb-ee24-9868-474da322a3ad
  Disable-AdminFlow -EnvironmentName b3090c42-51fb-ee24-9868-474da322a3ad -FlowName <flow-guid>
  ```
The old **intake** flow is already OFF from P7; this step idles the remaining post-intake flows
(classify/persist, status, enrich, finalize, chasers, dedup) so nothing writes to Dataverse during
teardown.

### 2. Delete the Code App
There is **no `pac code delete`** (the `pac code` group is init / list / push / run /
add-data-source / delete-data-source / list-* — verified on Learn topic **pac code**; no delete-app
verb). Remove it via the **Power Apps maker portal** → *Apps* → "Collision Engineers - Intake"
(`da7ba7af-…`) → **Delete**. (Belt-and-braces only — the SPA on SWA is already serving staff, and the
environment delete in step 8 would remove it regardless.)

### 3. Delete the 7 custom connectors
There is **no `pac connector delete`** either (the `pac connector` group is create / download / init /
list / update — verified on Learn topic **pac connector**). First capture their ids for the record,
then delete via the maker portal:
```powershell
pac connector list --environment b3090c42-51fb-ee24-9868-474da322a3ad --json   # record the 7 ids
```
**Power Apps maker portal** → *Custom connectors* → delete `cr1bd_ceparser`, `cr1bd_evasentry`,
`dvsaenrich`, `evavalidation`, `box_rest`, `ocr`, location-assist. They only **wrap** the Azure Functions over HTTP
— **the Functions stay** (keep-set below). No Function is touched by deleting its connector.

### 4. Delete the flows solution container
```powershell
pac solution delete --solution-name CollisionSpikeFlows \
  --environment b3090c42-51fb-ee24-9868-474da322a3ad
```
(Removes the unmanaged solution wrapper; the flows themselves are already disabled in step 1 and are
destroyed for good by step 8.)

### 5. Final cold export (insurance) → archive OFF-repo
Even though there is no production data to preserve, take a one-shot configuration-data export and
store it **outside the repo** (or on an orphan `archive` branch) before the irreversible delete. `pac
data export` is the **Configuration Migration** path — it needs a **schema file** that lists the tables
to export, produced by the **Configuration Migration Tool** (`pac tool cmt` launches it), not by hand:
```powershell
pac tool cmt        # GUI: build _archive/schema.xml selecting the cr1bd_* tables
pac data export --schemaFile ./_archive/schema.xml --dataFile ./_archive/data.zip --overwrite \
  --environment b3090c42-51fb-ee24-9868-474da322a3ad
```
- Flags verified on Learn topic **pac data**: required `--schemaFile`/`-sf`; data goes to
  `--dataFile`/`-df` (defaults to `data.zip`); `--overwrite`/`-o` allows re-running. *(The earlier
  draft's `--schema`/`--data` flags were wrong.)*
- `pac data` is **configuration-data only** (small reference volumes) and is **.NET-Full-Framework-only**
  in `pac` — fine here, since the only data is the seeded reference corpus, not transactional rows.
- The `_baseline/CollisionSpike.zip` + `CollisionSpikeFlows.zip` **solution** exports from P0 already
  preserve the *definitions*; this step adds the *data rows* for completeness. Move all of it off-repo.

### 6. Delete the schema solution container
```powershell
pac solution delete --solution-name CollisionSpike \
  --environment b3090c42-51fb-ee24-9868-474da322a3ad
```
Removes the unmanaged `CollisionSpike` container. **Per the caveat above this does NOT drop the 12
tables / 17 choicesets / 28 env-vars / 2 roles** — they persist as unmanaged customizations until the
environment is deleted in step 8. That's expected; we delete the container here only for an orderly
shutdown.

### 7. Delete connections + connection references
```powershell
pac connection list --environment b3090c42-51fb-ee24-9868-474da322a3ad      # record ids
pac connection delete --connection-id <id> --environment b3090c42-51fb-ee24-9868-474da322a3ad
# repeat for: the Outlook shared-mailbox connection, the Dataverse connection,
# and each parser/enrichment/eva/box/location connection backing a connector.
```
`pac connection delete --connection-id <id>` is verified on Learn topic **pac connection**. Connection
*references* (the solution-aware indirection rows) are removed with the solution containers in steps
4/6 and finally with the environment in step 8.

### 8. Delete the Dev environment / sandbox — the irreversible eraser
```powershell
pac admin list                                              # confirm the sandbox is still present
pac admin delete --environment b3090c42-51fb-ee24-9868-474da322a3ad
# (or by URL): pac admin delete --environment https://collisionengineers-dev.crm11.dynamics.com
```
- Verified on Learn topic **pac admin**: the verb is `pac admin delete --environment <id|url>` (the
  earlier draft's `pac admin delete-environment` does not exist). Add `--async` to return immediately;
  default wait is 60 min (`--max-async-wait-time`).
- Equivalent operator route: **Power Platform Admin Center** → *Environments* → select the Dev sandbox
  → **Delete**; or PowerShell `Remove-AdminPowerAppEnvironment -EnvironmentName b3090c42-…`.
- This is the **only** step that removes the schema, choicesets, env-vars, roles, remaining components,
  and all rows. It stops **all** Power Platform / Power Apps / Power Automate licensing and removes the
  legacy surface entirely. **Confirm the new stack is healthy first — it cannot be undone.**

## KEEP (the Azure keep-set — do NOT delete)
| Resource | Why |
|---|---|
| `rg-collisionspike-dev` (RG, UK South) | hosts everything that stays |
| 6 Functions: `cespike-parser-dev-x7xt3d5ovhi7y`, `cespkenrich-fn-gi62sd`, `cespkeva-fn-ufa3ci`, `cespkeval-fn-6c6fxd`, `cespkbox-fn-v76a47`, location-suggest + OCR ACA container | unchanged compute |
| 3 Key Vaults: `cespkenrichkvgi62sd` (populated DVSA/DVLA); `cespkevakvufa3ci`, `cespkboxkvv76a47` (gated/empty) | secrets |
| App Insights + Log Analytics (`cespike-parser-ai`/`law-dev`, `cespkocr-*`) | observability |
| Blob `cespkevidstdev01` | evidence bytes |
| ACR `cespkocracraeee76` | OCR image |
| **NEW (from P1):** Postgres B1ms, Data-API Function App, Orchestration Function App, Static Web App, the 3 Entra app registrations | the new Azure stack |

Nothing in the keep-set lives in the Power Platform environment, so step 8 cannot touch it. The
connectors deleted in step 3 are Dataverse rows, not the Functions they wrap.

## Verify (feeds [`99`](./99-verification-and-cutover.md))
```powershell
pac admin list                                       # the Dev sandbox no longer appears
pac env list                                          # no active org for that environment
az resource list -g rg-collisionspike-dev -o table    # the keep-set is intact; nothing PP-related remains
```
After this, delete the P0 `_baseline/` snapshot (its job is done) and proceed to P9 docs finalize.

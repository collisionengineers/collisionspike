# `migration/` — Power Platform → Azure PaaS

This folder is the **self-contained, executable plan** for moving `collisionspike` off Microsoft
Power Platform (Power Apps Code App + Dataverse + Power Automate + custom connectors) onto **pure
Azure PaaS**, while keeping the 6 already-deployed Azure Functions and all external integrations.

It is **temporary by design.** When [`99-verification-and-cutover.md`](./99-verification-and-cutover.md)
is green and the working tree no longer references Power Platform outside this folder, **delete
`migration/` wholesale.** It must not become part of the permanent docs.

## Two principles that govern every file here

1. **Hard cutover, not strangler.** The project is **not live as a service** — there is no
   production traffic or data to protect. So the migration is one clean switch, not a parallel-run
   with bridging scaffolding. The only "migration of data" is a **reseed of the reference corpus**
   from the offline seed sources (not a copy of live Dataverse rows).
2. **No legacy bloat.** Power-Platform-specific docs and ADRs are **archived off-repo, then deleted**
   from the working tree (see [`91`](./91-documentation-rewrite-delete.md)). We never leave in-repo
   "legacy/superseded" stubs — they would pollute the context every future AI agent loads. Domain
   *knowledge* survives (rewritten in place); platform *mechanism* dies.

## How to use this folder

Start at [`00-MASTER-WORKFLOW.md`](./00-MASTER-WORKFLOW.md) — the ordered runbook (phases P0–P9) that
sequences everything else and tells you, at each step, which plan file to open and which CLI to use.

| Read when you need… | File |
|---|---|
| The ordered runbook + phase gates + parallelism | [`00-MASTER-WORKFLOW.md`](./00-MASTER-WORKFLOW.md) |
| What exists today → its Azure analogue (mslearn-verified) | [`01-inventory-and-analogue-map.md`](./01-inventory-and-analogue-map.md) |
| Why each fork was decided the way it was | [`02-decisions-and-open-questions.md`](./02-decisions-and-open-questions.md) |
| The end-state Azure topology + component contracts | [`03-target-architecture.md`](./03-target-architecture.md) |
| Migrating the 28 env-vars (20 gates + 6 config + 2 secret), 17 choicesets, roles, relationships | [`10-settings-migration.md`](./10-settings-migration.md) |
| Key Vault reuse + the "no secret in the bundle" invariant | [`11-secrets-and-keyvault.md`](./11-secrets-and-keyvault.md) |
| Dataverse schema → Postgres DDL + corpus reseed | [`20-data-and-schema-migration.md`](./20-data-and-schema-migration.md) |
| The NEW data API (BFF) the SPA + orchestration call | [`21-backend-api-build.md`](./21-backend-api-build.md) |
| The 17 flow definitions → Durable Functions + Graph intake | [`22-orchestration-migration.md`](./22-orchestration-migration.md) |
| Preserving the React app, swapping only the data seam | [`30-frontend-preservation.md`](./30-frontend-preservation.md) |
| PowerProvider → Entra/MSAL auth | [`31-auth-migration.md`](./31-auth-migration.md) |
| The cheapest-service costing + servicing runbook | [`40-costing-and-servicing.md`](./40-costing-and-servicing.md) |
| Tearing down Power Platform (keep-list included) | [`90-deprovision-power-platform.md`](./90-deprovision-power-platform.md) |
| Which docs/ADRs die, which get rewritten | [`91-documentation-rewrite-delete.md`](./91-documentation-rewrite-delete.md) |
| The hard-cutover go/no-go gate | [`99-verification-and-cutover.md`](./99-verification-and-cutover.md) |

`assets/` holds the machine-readable `analogue-map.csv`, the Postgres DDL set (`assets/schema/*.sql`,
authored in P2 — 22 choiceset lookup tables, 12 tables + 2 N:N junctions, FKs/cascade/RLS, plus
`seed/`), and the idempotent P1 provisioning script (`assets/iac/provision.sh`).

## Resolved decisions (operator-confirmed)

| Decision | Choice |
|---|---|
| System-of-record DB | **Azure Database for PostgreSQL Flexible Server, B1ms** |
| Orchestration | **Durable / queue Functions** (+ Microsoft Graph change-notification intake) |
| Power Platform teardown | **Delete the Dev sandbox entirely** after cutover green |
| Old docs/ADRs | **Archive off-repo, then delete** from the working tree |
| Data API tier | **Standalone Flex Consumption Function App** (SWA managed API too constrained) |
| SPA host | **Azure Static Web Apps, Free tier** |
| Feature flags | **Plain Function app-settings** (not App Configuration) |
| Auth | **Entra workforce via MSAL, staff-only** (no External ID) |
| New backend language | **TypeScript** for the new API + orchestration (share the frontend's domain/contract rules as one package); the existing 6 Functions stay **Python** |
| Subscription | **Provision in-place** — the sub holding `rg-collisionspike-dev` is itself a Free Trial (12-mo-free Postgres B1ms); upgrade to PAYG before the 30-day window (~4 weeks runway) |

Full rationale (D1–D10 + Q1) + the live forks log live in [`02`](./02-decisions-and-open-questions.md).

## Tooling used throughout

- **`az`** (Azure CLI) — provision Postgres, the API + orchestration Function Apps, Static Web Apps,
  managed identities, Key Vault grants; tear down nothing on the Azure side (the RG is kept).
- **`pac`** (Power Platform CLI) — export-for-reference, then delete the Code App, connectors,
  solutions, and the environment.
- **`func`** (Azure Functions Core Tools) — local run + deploy of the API and orchestration apps.
- **`swa`** / `az staticwebapp` — deploy the SPA.
- **`psql`** — apply the Postgres DDL + seed.
- **Microsoft Learn (mslearn MCP)** — every Azure analogue in [`01`](./01-inventory-and-analogue-map.md)
  carries the Learn topic used to verify it; re-verify before relying on any command in a new month.

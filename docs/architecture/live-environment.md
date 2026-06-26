# Live environment reference — collisionspike (Azure PaaS)

> **Canonical registry of what is actually deployed.** Re-verified live on **2026-06-26**.
> **The LIVE system is the Azure PaaS stack** (Static Web App + two Node/TypeScript Function Apps +
> Postgres Flexible Server, alongside the 6 retained Python Functions). The earlier **Power Platform
> implementation** (Power Apps Code App, Dataverse, ~16 Power Automate flows, the `cr1bd_*` custom
> connectors) **has been migrated and decommissioned** — the cutover was executed. It survives in this
> document **only as a clearly-banded historical appendix**; do **not** treat any Power Platform row as
> live. The migration plan + reversible build live in [`migration/`](../../migration/).
> Pairs with [AGENTS.md](../../AGENTS.md) (rules/gotchas) and [CURRENT_STATUS.md](../../CURRENT_STATUS.md).
> Re-verify IDs with the toolkit at the bottom before relying on them.

> ## ⚠️ Whole-stack hard deadline — Free-Trial expiry
> The subscription `e6076573-23a5-46a8-acef-7e22d264e5db` is an **Azure Free Trial**
> (quotaId `FreeTrial_2014-09-01`). **The entire stack is disabled at the ~30-day mark unless it is
> upgraded to Pay-As-You-Go.** The **12-month free PostgreSQL Flexible Server allowance survives** the
> PAYG upgrade, but every other resource (Static Web App, both Function Apps, Key Vaults, Blob, the OCR
> ACA host) stops when the trial lapses. **Upgrading to PAYG is the top operational blocker.**

## Subscription & region
| Thing | Value |
|---|---|
| **Subscription** | `e6076573-23a5-46a8-acef-7e22d264e5db` — **Azure Free Trial** (`FreeTrial_2014-09-01`) |
| **Resource group** | `rg-collisionspike-dev` |
| **Primary region** | **UK South** (`uksouth`) — except the Static Web App control plane (`westeurope`, the one Free SWA region) |
| Intake mailbox (Graph target) | `digital@collisionengineers.co.uk` (M365 shared mailbox; polled, not yet live — see Orchestration) |
| Tenant id | read with `az account show --query tenantId -o tsv` |

## Azure — live components (resource group `rg-collisionspike-dev`)

| Resource | Name / detail | Status |
|---|---|---|
| **SPA** — Static Web App (Free) | **`cespk-spa-dev`** (control plane `westeurope`) → **`https://proud-sky-04e318b03.7.azurestaticapps.net`**. The **preserved React/Vite app** built from `mockup-app/`. Sign-in is **MSAL / Microsoft Entra workforce** (staff-only). It carries **no secret and no Power SDK** — it calls the Data API over **REST + Bearer token** via `mockup-app/src/data/rest-client.ts`. | **LIVE** |
| **Data API** — Function App (BFF) | **`cespk-api-dev`** — **Node 20 / TypeScript Azure Functions v4** (source `api/`, deployed as an **esbuild bundle** `deploy/api/main.cjs`). Validates the **Entra JWT** (`jose`) and authorizes by **app role** `CollisionSpike.User` / `CollisionSpike.Admin`. v2 access tokens carry `aud` = the **API client-id GUID** (`fa2fb28c…`). Owns the status state-machine, dedup, audit writes, and gate reads. **Connects to Postgres** as the non-owner login `cespk_app` (RLS enforced; password a Key Vault reference). | **LIVE** |
| **Orchestration** — Function App | **`cespk-orch-dev`** (source `orchestration/`) — **BUILT but ZERO functions are currently deployed.** Intended design: Microsoft **Graph delta-POLL** intake over **Exchange-RBAC-scoped** mailboxes (no Global-Admin consent, no push subscription) feeding a Durable intake pipeline. **Consequence: there is no live automated email intake yet** — the running system is **read-only + manual case-create only**. | **BUILT, NOT DEPLOYED** |
| **Postgres** — Flexible Server (system of record) | **`cespk-pg-dev`** (**PostgreSQL v16**), database **`collisionspike`** — **36 tables** (14 business + 22 `choice_*` lookups). Seeded corpus: `work_provider` **390**, `repairer` **32**, `image_source` **19**, `inspection_address` **2209** (174 confirmed + 2035 suggested); `case_` **0**. Schema is `migration/assets/schema/*.sql`. Free Postgres allowance survives the PAYG upgrade. | **LIVE** |
| **Retained Python Functions (UNCHANGED, 6)** | `cespike-parser-dev` (parser, `POST /api/parse`) · `cespkenrich-fn-gi62sd` (enrichment — DVSA + DVLA direct via Entra `client_credentials` + X-API-Key) · `evavalidation` · `evasentry` (gated) · `cespkocr-fn-dev-glju3v` (OCR on Azure Container Apps, scale-to-zero, gated) · `cespkbox-fn-v76a47` (`box-webhook`, gated). Called **directly by the Data API / orchestration** (function key / managed identity), not via any connector. | **LIVE (gated where noted)** |
| **Key Vaults** | `cespkenrichkvgi62sd` (enrichment DVSA/DVLA secrets — populated, KV references resolve) · `cespkboxkvv76a47` (Box — empty, gated) · EVA vault (gated). | **LIVE** |
| **Evidence Blob** | `cespkevidstdev01` — evidence bytes (off-row; cases reference by `storage_path`). | **LIVE** |
| **Observability** | Shared **App Insights** `cespike-parser-ai-dev` + **Log Analytics** `cespike-parser-law-dev`; OCR keeps its own `cespkocr-ai-dev` / `cespkocr-law-dev` pair. | **LIVE** |
| **Container Registry** | `cespkocracraeee76` (Basic) — holds `ce-ocr:latest`, pulled by the OCR ACA host via UAMI AcrPull. | **LIVE** |

## Auth & identity (Entra workforce)
- **Sign-in:** Microsoft **Entra ID workforce** via **MSAL** in the SPA (`mockup-app/src/auth/`). The SPA
  acquires an access token for the API scope and sends it as a Bearer token; the **Data API validates the
  JWT with `jose`** and authorizes by app role.
- **App roles:** **`CollisionSpike.User`** and **`CollisionSpike.Admin`** — the two roles that **map the old
  two Dataverse security roles** 1:1.
- **Token audience:** v2 access tokens carry `aud` = the **API app-registration client-id GUID**
  (`fa2fb28c…`); the API validates against this. Audience-form hardening is in progress (see gaps).
- **Assignment state:** **only ONE staff principal is app-role-assigned so far.** Any other signed-in user
  will reach the API and **403** until an admin assigns them a role.

## Intake auth model — Exchange RBAC for Applications (delta-POLL)
The intake app reads the shared mailbox(es) under **Exchange RBAC for Applications**, **not** a tenant-wide
Graph grant: an **Exchange Administrator** grants the intake service principal a **resource-scoped** Graph
mailbox role with `New-ServicePrincipal` / `New-ManagementScope` / `New-ManagementRoleAssignment` — **no
Global Administrator and no tenant-wide admin consent**. Intake then **polls** the mailbox with a Graph
**delta query** (no push/webhook subscription).

> This **supersedes** any earlier statement that "Graph `Mail.Read` needs Global-Admin / admin consent."
> Mailbox access is granted by an **Exchange Administrator at mailbox scope**, and the read pattern is a
> **delta poll**, not a change-notification subscription. Correct that wherever it still appears.

## Known live gaps (state honestly — do not paper over)
1. **No automated email intake is live.** `cespk-orch-dev` is built but has **zero deployed functions**, so
   the Graph delta-poll pipeline does not run. The system is **read-only + manual case-create** today.
2. **Postgres connection security — RESOLVED (2026-06-26).** The Data API connects as the **non-owner**
   login **`cespk_app`** (`rolsuper=false`, `rolbypassrls=false`) with its password held as a **Key Vault
   reference** (no cleartext), and sets the DB app-role per connection via `-c app.role=staff` (the
   `PGAPPROLE` app-setting). The authored **RLS by app role is now enforced** — the prior server-admin
   `csadmin` connection bypassed it. Grants are least-privilege (no DELETE on any table; `audit_event`
   INSERT/SELECT only — append-only).
3. **Free-Trial → PAYG deadline** (the whole-stack expiry above).
4. **Staff app-role assignment incomplete** — only one principal assigned; others 403.
5. **Durable auth error-handling + audience-form hardening in progress** (token-validation robustness).

## System of record — Postgres (was Dataverse)
The authoritative store is now **PostgreSQL Flexible Server `cespk-pg-dev` / db `collisionspike`**. The
domain model, the 12-field EVA contract, the `choice_*` lookup tables (which **preserve the EVA integer
codes verbatim**), and the seeded provider/repairer/inspection-address corpus are documented in
[data-model.md](./data-model.md). The DDL is `migration/assets/schema/*.sql`.

## Current vs intended (M1 pipeline)
Intended chain: **intake → classify-persist → parse → provider-match → case-resolve → status-evaluate →
enrich → finalize (EVA + Box) → chasers**, driven by the **orchestration** app's Durable pipeline.
**Live today (Azure):** the SPA + Data API + Postgres are up and serve **read + manual case-create**; the
6 Python Functions are reachable (parser/enrichment live, EVA/Box/OCR gated). **Not yet live:** the
**automated intake pipeline** (orchestration undeployed), finalize (EVA + Box — gated), chasers. So a staff
member can sign in, browse, and create a case manually, but **email does not yet auto-create cases**.

**EVA path (domain — unchanged):** the active EVA path is **JSON drag-drop, not REST — by a vendor
constraint.** Minotaur Software's Sentry API currently routes only **one principal code** per API
submission (it cannot handle the multiple work-provider codes), so the EVA-REST gate stays **OFF** pending
Minotaur's patch + a parity test. The EVA **test** environment exists (test creds held in Key Vault /
Infisical). See [eva-sentry-api.md](./eva-sentry-api.md).

**Enrichment (domain — unchanged):** the enrichment Function calls **DVSA + DVLA directly** via Entra
`client_credentials` + X-API-Key (no Google-Cloud gateway). DVSA/DVLA secrets are Key Vault references in
`cespkenrichkvgi62sd`. Mileage = MOT-odometer estimate only (near-new vehicles return none, by design).

---

## Live-verification toolkit (Azure)
```pwsh
# Resource inventory in the dev RG
az resource list -g rg-collisionspike-dev -o table

# Static Web App (SPA) hostname + status
az staticwebapp show -g rg-collisionspike-dev -n cespk-spa-dev --query "defaultHostname" -o tsv

# Function Apps — which functions are actually deployed (orch should currently be EMPTY)
az functionapp function list -g rg-collisionspike-dev -n cespk-api-dev  -o table
az functionapp function list -g rg-collisionspike-dev -n cespk-orch-dev -o table   # expect: none yet

# Postgres — table count + seeded corpus counts (psql via the admin connection string)
#   SELECT count(*) FROM information_schema.tables WHERE table_schema='public';      -- expect 36
#   SELECT count(*) FROM work_provider; SELECT count(*) FROM inspection_address;     -- 390 / 2209
#   SELECT count(*) FROM case_;                                                       -- 0

# Subscription quota class (confirms Free Trial vs PAYG)
az account show --query "{name:name, id:id}" -o json
#   az rest --method get --url "https://management.azure.com/subscriptions/<id>?api-version=2020-01-01" \
#     --query "subscriptionPolicies.quotaId"   # FreeTrial_2014-09-01 until upgraded

# Retained Python Functions reachability (parser shown)
curl.exe -i -X OPTIONS "https://cespike-parser-dev.azurewebsites.net/api/parse" -H "Origin: https://proud-sky-04e318b03.7.azurestaticapps.net" -H "Access-Control-Request-Method: POST"
```

---

# Appendix — HISTORICAL: the decommissioned Power Platform environment

> **NOT LIVE.** Everything below describes the **prior Power Platform implementation**, which was
> **migrated to the Azure stack above and decommissioned**. It is retained for provenance and for the
> migration's deprovision step ([`migration/90-deprovision-power-platform.md`](../../migration/90-deprovision-power-platform.md)).
> Do not rely on these resources or treat any of them as current.

## (historical) Environment & identity
| Thing | Value |
|---|---|
| Work env | `Collision Engineers - Dev` — id `b3090c42-51fb-ee24-9868-474da322a3ad` |
| Org (Dataverse) URL | `https://collisionengineers-dev.crm11.dynamics.com` |
| Default env (was not used) | `Collision Engineers (default)` — id `858cf5b3-aa0a-47a6-9b40-4851fd0afa94` |
| Maker / intake mailbox | `digital@collisionengineers.co.uk` |

## (historical) Code App
| Thing | Value |
|---|---|
| App id | `da7ba7af-9ffc-4c70-8f75-1f053ca354da` |
| Display name | `Collision Engineers - Intake` |
| Source | `mockup-app/` (React + Vite) — **the same source now built into the live Static Web App** (the React app was preserved; only its data seam changed from the Power SDK/Dataverse to the REST client). |

## (historical) Dataverse solution
`CollisionSpike` (schema, prefix `cr1bd`, id `fb532f91-f26a-f111-ab0c-0022481b614c`) +
`CollisionSpikeFlows` (flows). All `cr1bd_*` tables/choicesets were the source the **Postgres schema was
translated from** (every `cr1bd_*` global choiceset → a `choice_*` lookup table; EVA integer codes
preserved). The Dataverse org is slated for deprovisioning.

## (historical) Power Automate flows
~16 cloud flows (`category eq 5`) — CS Intake (shared mailbox), CS Provider Match, CS Case Resolve, CS
Classify + Persist, CS Parse, CS Status Evaluate, CS Enrich, CS Finalize EVA + Box, CS Chaser Draft, CS
Job Sheet Import, plus the Phase-7 Box flows. **Their orchestration logic was re-expressed in the
TypeScript `cespk-orch-dev` Durable pipeline** (the build target; not yet deployed). The flows themselves
are decommissioned.

## (historical) Power Platform custom connectors
`cr1bd_ceparser`, `cr1bd_dvsaenrich`, `cr1bd_evasentry`, `cr1bd_evavalidation`, `cr1bd_box_rest`,
`cr1bd_box`, `cr1bd_dataverse`, `cr1bd_sharedmailbox_office365`, … — the Power Platform delivery vehicle
that let the Code App / flows reach the Azure Functions and external systems under `connect-src 'none'`.
**Obsolete in the Azure stack:** the SPA reaches the Data API directly over REST, and the Data API /
orchestration call the Python Functions directly (function key / MI) — **no connector layer**.

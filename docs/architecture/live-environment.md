# Live environment reference — collisionspike (Azure PaaS)

> **Canonical registry of what is actually deployed.** This file + [`LIVE_FACTS.json`](../../LIVE_FACTS.json)
> (root) are the **single source for literal live numbers** — every other doc links here rather than
> re-embedding a count. Last live change: **2026-06-29T15:39Z** — Graph intake mailbox cutover finished
> (subscriptions + RBAC + `GRAPH_INTAKE_MAILBOXES` now the production set info@ + engineers@ + desk@; digital@
> removed). Prior snapshot **2026-06-28** verified function counts, feature gates, `httpsOnly`; Postgres corpus
> counts **not** re-verified (PG firewall blocked the verifier) — banded as last-known below.
> **The LIVE system is the Azure PaaS stack** (Static Web App + two Node/TypeScript Function Apps +
> Postgres Flexible Server, alongside the 6 retained Python Functions). The earlier **Power Platform
> implementation** (Power Apps Code App, Dataverse, ~16 Power Automate flows, the `cr1bd_*` custom
> connectors) **has been migrated to Azure (deployed)** and its Power Platform footprint **deprovisioned
> 2026-06-27** (the Dev sandbox, Code App, both solutions, custom connectors and the remaining
> `case-resolve` flow were deleted via `pac admin delete`; `CollisionSpike.zip` cold-exported off-repo). It
> survives in this document **only as a clearly-banded historical appendix**; do **not** treat any Power
> Platform row as live. The migration plan + reversible build live in [`migration/`](../../migration/).
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
| Intake mailboxes (Graph target) | **Configured = the production target: `info@` + `engineers@` + `desk@`** — all three Exchange-RBAC app-read scoped with live Graph push subscriptions (cutover finished 2026-06-29; the test/dev mailbox `digital@` was de-scoped from config and its subscription deleted). Subscription ids/expiry: see the Orchestration row + [`LIVE_FACTS.json`](../../LIVE_FACTS.json) `graphSubscriptions`. See also the Intake auth model section. |
| Tenant id | read with `az account show --query tenantId -o tsv` |

## Azure — live components (resource group `rg-collisionspike-dev`)

| Resource | Name / detail | Status |
|---|---|---|
| **SPA** — Static Web App (Free) | **`cespk-spa-dev`** (control plane `westeurope`) → **`https://proud-sky-04e318b03.7.azurestaticapps.net`**. The **preserved React/Vite app** built from `mockup-app/`. Sign-in is **MSAL / Microsoft Entra workforce** (staff-only). It carries **no secret and no Power SDK** — it calls the Data API over **REST + Bearer token** via `mockup-app/src/data/rest-client.ts`. | **LIVE** |
| **Data API** — Function App (BFF) | **`cespk-api-dev`** — **Node 20 / TypeScript Azure Functions v4** (source `api/`, deployed as an **esbuild bundle** `deploy/api/main.cjs`); **61 functions** registered (verified 2026-06-30T09:40Z; the corrective deploy [feat/work-todo-spike-impl @ 1d8708d] added the **3 Box case routes** `caseBoxSharedLink` (GET `cases/{id}/box/shared-link`) / `caseBoxCopyFileRequest` (POST `.../copy-file-request`) / `caseBoxFinalize` (POST `.../finalize`) — commit d5e2d4b, each anon-probed → **401 not 404** = route exists; the prior 2026-06-30T07:45Z work-todo-spike pass added the 9 `ai-suggestions.ts` (`caseAiSuggestions`/`generateAiSuggestions`/`reviewAiSuggestion`/`inspectionAddressSuggestions`) + cases/inbound/internal/providers/gates routes); **`httpsOnly` = true**. Validates the **Entra JWT** (`jose`) and authorizes by **app role** `CollisionSpike.User` / `CollisionSpike.Superuser` (Superuser formerly `CollisionSpike.Admin`, legacy name still accepted). v2 access tokens carry `aud` = the **API client-id GUID** (`fa2fb28c…`). Owns the status state-machine, dedup, audit writes, and gate reads. **Connects to Postgres** as the non-owner login `cespk_app` (RLS enforced; password a Key Vault reference). Feature gates set: **`ENRICHMENT_ENABLED=true`** / **`PDF_MAPPER_ENABLED=true`**, **`BOX_API_ENABLED`/`BOX_FOLDER_AT_INTAKE_ENABLED`/`BOX_FILEREQUEST_ENABLED`=true** (`BOX_FOLDER_ROOT_ID=392761581105`); plus the work-todo-spike Case/PO-allocator Box-fallback wiring **`BOX_FN_URL`** (plain host `cespkbox-fn-v76a47`) + **`BOX_FN_KEY`** (KV ref `cespk-pg-kv-dev/boxwebhook-fn-key`); `EVA_API_ENABLED`/`VALUATION_ENABLED`/`BOX_EMBED_ENABLED`/`BOX_METADATA_ENABLED` absent (off/reserved). | **LIVE** |
| **Orchestration** — Function App | **`cespk-orch-dev`** (source `orchestration/`) — **48 functions** registered (verified 2026-06-30T09:40Z; **UNCHANGED** by the 2026-06-30 corrective deploy [feat/work-todo-spike-impl @ 1d8708d] — it carries LOGIC fixes 20b114f (parser-EVA-field-forwarding) + 1d8708d (Box-decouple-from-automation-mode), no new functions, and `intakeOrchestrator` ran 35× clean post-deploy; the prior work-todo-spike pass added the +2 durable activities `extractImages` + `boxArchiveEvidence`; NOT 0 — the esbuild `import.meta.url` banner held); **`httpsOnly` = true**. **Email intake is LIVE IN TESTING.** The intake chain is wired (PARSER/ENRICH/BOXWEBHOOK/EVASENTRY/**OCR** `_FN_URL` + KV-referenced function keys — OCR added 2026-06-30 (`OCR_FN_URL` plain host + `OCR_FN_KEY` → KV `cespk-pg-kv-dev/ocr-fn-key`) for registration-visible plate OCR, `EVIDENCE_BLOB_CONTAINER`; orch→Data API via **managed identity**; identity-based storage), and transport is **PUSH — Microsoft Graph change-notification subscriptions**, NOT delta-poll. **3 live push subscriptions exist** (the production set **info@ + engineers@ + desk@** Inbox `…/messages`, `changeType=created`, → `https://cespk-orch-dev.azurewebsites.net/api/graph-webhook`), expiry **~2026-07-06T14:38Z** (durable monitor — below; ids in [`LIVE_FACTS.json`](../../LIVE_FACTS.json) `graphSubscriptions`). `GRAPH_INTAKE_MAILBOXES` = info@ + engineers@ + desk@ (info@/desk@ `minIntakeDate` 2026-06-29, engineers@ 2026-06-27; the test mailbox digital@ was removed in the 2026-06-29 mailbox cutover and its subscription deleted). Same gates as the API (`ENRICHMENT`/`PDF_MAPPER`/`BOX_*` on). ✅ **Renewal RESOLVED (2026-06-29):** the plain `graph-renew` timer never fired on Flex scale-to-zero; renewal now runs via the durable `subscriptionMonitorOrchestrator` (eternal — durable timers wake a scaled-to-zero app) + a function-keyed `graph-renew` HTTP lever (see the renewal note below). ⚠️ **Reconcile note:** `runSubscriptionMaintenance` auto-CREATES missing intake mailboxes + renews, but does NOT prune subscriptions for mailboxes removed from `GRAPH_INTAKE_MAILBOXES` — a mailbox removal must be deleted by hand until a prune step is added (see gap 1 + `LIVE_FACTS.json` `subscriptionRenewalRisk.note`). | **LIVE IN TESTING (push subs; durable renewal)** |
| **Postgres** — Flexible Server (system of record) | **`cespk-pg-dev`** (**PostgreSQL v16**), database **`collisionspike`** — **38 base tables** (live `information_schema` count; was 37 pre-migration — the prior "36" undercounted). **work-todo-spike LIVE migration applied 2026-06-30** (idempotent, via Entra `digital@`→`SET ROLE csadmin`): NEW `ai_suggestion` table (RLS ENABLE+FORCE; `INSERT/SELECT/UPDATE` grant to `cespk_app`; case/evidence CASCADE + inbound_email SET NULL FKs), `inbound_email.suggested_category_code`/`suggested_subtype_code`, `choice_audit_action` 100000027–100000034, `choice_case_status` 100000011 `removed`, case-insensitive `uq_case_case_po` on `upper(case_po)`. Seeded corpus (**last-known, 2026-06-18 corpus load — NOT re-verified this snapshot**; the 2026-06-28 verifier was blocked by the PG firewall): `work_provider` **390**, `repairer` **32**, `image_source` **19**, `inspection_address` **2209** (174 confirmed + 2035 suggested); `case_` **20** (`work_provider` + `case_` **VERIFIED 2026-06-30T09:35Z** via Entra `azure_pg_admin` → `SET ROLE csadmin`, the owner read that BYPASSES RLS — the prior `case_` **0** was a non-owner/stale RLS read artifact; **174 of 390** providers are active, and the active set was flipped `provider_automation_mode_code` **manual → review_auto** (`100000001`), the user-approved 'Both' box-sync fix — the 216 inactive remain manual). `repairer`/`image_source`/`inspection_address` remain last-known (not re-counted this pass). Schema is `migration/assets/schema/*.sql`. Free Postgres allowance survives the PAYG upgrade. | **LIVE** |
| **Retained Python Functions (UNCHANGED, 6)** | `cespike-parser-dev` (parser, `POST /api/parse` + `extract_images`; **3 functions** — redeployed 2026-06-30 via config-zip `--build-remote true` (FC1 remote Oryx build), **first redeploy since 2026-06-28**, carrying **TKT-001 multi-format extraction** (94902ce); live `/api/parse` on a `.docx` fixture now returns a **FULL 12-field EVA extraction** (8/12 populated, vrm `HK19WTN`), no longer sparse) · `cespkenrich-fn-gi62sd` (enrichment — DVSA + DVLA direct via Entra `client_credentials` + X-API-Key) · `evavalidation` · `evasentry` (gated) · `cespkocr-fn-dev-glju3v` (OCR on Azure Container Apps, scale-to-zero, gated) · `cespkbox-fn-v76a47` (`box-webhook`, **10 routes** — work-todo-spike added `upload_file` `POST /api/box/folders/{id}/files`, the Blob→Box archive mirror scope-locked to `BOX_ALLOWED_ROOT_ID`) — **Box is LIVE (JWT Server Auth, 2026-06-28):** authed smoke `GET …/folders/392761581105/items` → **200** (re-verified 2026-06-30 post-redeploy; 7 case folders, read-only — no write performed). Called **directly by the Data API / orchestration** (function key / managed identity), not via any connector. | **LIVE (Box live; others gated where noted)** |
| **Key Vaults** | `cespkenrichkvgi62sd` (enrichment DVSA/DVLA secrets — populated, KV references resolve) · `cespkboxkvv76a47` (Box — holds **`box-config-json`** (the JWT `Config.JSON`, load-bearing) + webhook keys) · EVA vault (gated) · **`cespk-pg-kv-dev`** (the Postgres `cespk_app` password; the rotated **`graph-client-secret`**; and the retained **`parser-fn-key` / `enrich-fn-key` / `boxwebhook-fn-key` / `ocr-fn-key`** function keys (`ocr-fn-key` added 2026-06-30 for the orch `OCR_FN_KEY` ref) — all KV-referenced, no plaintext). | **LIVE** |
| **Evidence Blob** | `cespkevidstdev01` — evidence bytes (off-row; cases reference by `storage_path`). | **LIVE** |
| **Observability** | **App Insights is per-app, NOT shared:** **`cespk-api-dev`** (Data API, appId `95e70d0f…`) and **`cespk-orch-dev`** (orchestration, appId `7c7ea68a…`) EACH have their OWN component; the **parser + retained Python fns** log to `cespike-parser-ai-dev` (appId `da68d9aa…`) + **Log Analytics** `cespike-parser-law-dev`; **OCR** keeps its own `cespkocr-ai-dev` / `cespkocr-law-dev` pair. | **LIVE** |
| **Container Registry** | `cespkocracraeee76` (Basic) — holds `ce-ocr:latest`, pulled by the OCR ACA host via UAMI AcrPull. | **LIVE** |

### Orphans & deprovisioned (cost / cleanup tracking)
- **`valuationbot-mcp`** (Container App) — **DEPROVISIONED 2026-06-27** (was public-internet; deleted, its image kept in ACR). It belongs to a **separate suite project**, not this stack.
- **`digital-3339-resource`** (an AI Foundry account + project with its own App Insights / Log Analytics) — **ORPHAN: present, undocumented, with no model deployments** (≈no cost). **Flagged for an operator keep/delete decision.**

## Auth & identity (Entra workforce)
- **Sign-in:** Microsoft **Entra ID workforce** via **MSAL** in the SPA (`mockup-app/src/auth/`). The SPA
  acquires an access token for the API scope and sends it as a Bearer token; the **Data API validates the
  JWT with `jose`** and authorizes by app role.
- **App roles:** **`CollisionSpike.User`** and **`CollisionSpike.Superuser`** — the full-privilege role
  **`CollisionSpike.Superuser`** was **renamed from `CollisionSpike.Admin`** (same app-role id, so the
  existing assignment carried over; `auth.ts` still accepts the legacy `CollisionSpike.Admin` for
  back-compat, and the settings route is Superuser-gated). These map the old two Dataverse security roles
  1:1. A third role **`CollisionSpike.Engineer`** is **defined but NOT yet enforced** — a placeholder for
  future assessment/engineer functionality.
- **Token audience:** v2 access tokens carry `aud` = the **API app-registration client-id GUID**
  (`fa2fb28c…`); the API validates against this. Audience-form hardening is in progress (see gaps).
- **Assignment state:** **only ONE staff principal is app-role-assigned so far.** Any other signed-in user
  will reach the API and **403** until an admin assigns them a role.

## Intake auth model — Exchange RBAC for Applications + Graph PUSH subscriptions
The intake app reads the shared mailboxes under **Exchange RBAC for Applications**, **not** a tenant-wide
Graph grant: an **Exchange Administrator** grants the intake service principal a **resource-scoped** Graph
mailbox role with `New-ServicePrincipal` / `New-ManagementScope` / `New-ManagementRoleAssignment` — **no
Global Administrator and no tenant-wide admin consent**. On top of that RBAC grant, intake uses **Graph
change-notification (PUSH) subscriptions** — one per Inbox, `changeType=created`, pushing to
`…/api/graph-webhook` — bootstrapped/renewed by the durable `subscriptionMonitorOrchestrator` (+ `graph-renew` timer backstop / HTTP lever). **This is PUSH, not delta-poll.**

**Live state (verified 2026-06-29 — see the registry table above for the authoritative values):** the
**production set info@ + engineers@ + desk@** are ALL Exchange-RBAC app-read scoped (scope
`CollisionSpike-Intake-Prod`, `Application Mail.Read`) and each has a **live push subscription** (expiry
~2026-07-06T14:38Z; durable monitor). The 2026-06-29 cutover added info@ + desk@ (their subscription creates
succeeded once the ~30min–2h Exchange-RBAC permission cache cleared — the earlier 403s were the cache, not a
wrong grant) and **removed the test/dev mailbox digital@** (de-scoped from config + subscription deleted).
engineers@ is a real production mailbox; digital@ remains RBAC-scoped but is no longer an intake target.

> This **supersedes** any earlier statement that "Graph `Mail.Read` needs Global-Admin / admin consent" **and**
> any earlier "delta-poll, no push subscription" wording. Mailbox access is granted by an **Exchange
> Administrator at mailbox scope**, and the read pattern is a **change-notification PUSH subscription**.
> Correct both wherever they still appear.

## Known live gaps (state honestly — do not paper over)
1. **Email intake is LIVE IN TESTING — now on the production mailbox set.** `cespk-orch-dev` is live with
   **3 Graph PUSH subscriptions** over the production set **info@ + engineers@ + desk@** (all Exchange-RBAC-scoped;
   mailbox cutover finished 2026-06-29, test mailbox digital@ removed). Remaining for **production**:
   set `EVIDENCE_BLOB_CONNECTION` (prefer MI), assign the orch MI an app-role on the Data API, and wire the
   Azure Monitor heartbeat alerts.
   - ⚠️ **Subscription-reconcile durability gap (recommended small code fix).** `runSubscriptionMaintenance`
     (`orchestration/src/lib/subscriptions.ts`) auto-CREATES missing intake mailboxes and renews all existing
     subs, but it **never prunes** — a mailbox REMOVED from `GRAPH_INTAKE_MAILBOXES` keeps its subscription
     (and gets renewed forever). That is why the de-scoped digital@ sub had to be deleted by hand in this
     cutover. Recommend adding a prune pass (delete any of OUR subs whose `mailboxOfResource(resource)` is not
     in `intakeMailboxes()`) so a mailbox-set change self-reconciles add+remove on the next maintenance tick.
   - ✅ **Renewal RESOLVED (2026-06-29, AIE Wave A).** Root cause: a plain timer trigger isn't woken on Flex
     scale-to-zero, so `graph-renew` logged 0 executions and the 2 subscriptions were heading for a silent
     lapse. Fix: the durable **`subscriptionMonitorOrchestrator`** (eternal — renew → durable timer →
     continueAsNew; a durable timer message wakes a scaled-to-zero app) plus a function-keyed **`graph-renew`
     HTTP** lever and an intake-starter bootstrap; the `graph-renew` timer is kept as a backstop. Subscriptions
     renewed to 2026-07-06T10:19Z. **Operator watch:** confirm an unattended renew at the next ~6h durable-timer
     wake (a `graph-renewal-success` trace with no manual trigger).
2. **Connection & secret security — RESOLVED (2026-06-26 / 2026-06-27).** The Data API connects as the
   **non-owner** login **`cespk_app`** (`rolsuper=false`, `rolbypassrls=false`) with its password held as a
   **Key Vault reference** (no cleartext), and sets the DB app-role per connection via `-c app.role=staff` (the
   `PGAPPROLE` app-setting). The authored **RLS by app role is now enforced** — the prior server-admin
   `csadmin` connection bypassed it. Grants are least-privilege (no DELETE on any table; `audit_event`
   INSERT/SELECT only — append-only). **On 2026-06-27 the remaining plaintext exposures were also remediated:**
   `GRAPH_CLIENT_SECRET` rotated into `cespk-pg-kv-dev/graph-client-secret` (orch MI granted Key Vault Secrets
   User — it previously had zero role assignments); both Function Apps' storage moved to **identity-based**
   (`allowSharedKeyAccess=false`, MIs granted Storage Blob Data Owner; orch also Queue/Table Data Contributor
   for Durable); `DOCINTEL_KEY` neutralized (Document Intelligence local-auth disabled, ocr MI keyless via
   Cognitive Services User); the parser/enrich/box function keys moved to KV references (the parser host key
   rotated). Only `APPLICATIONINSIGHTS_CONNECTION_STRING` (not a secret) and the platform-managed
   `WEBSITE_AUTH_ENCRYPTION_KEY` remain plaintext — acceptable, no action.
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
**Live today (Azure):** the SPA + Data API + Postgres are up and serve read + manual case-create; the
6 Python Functions are reachable (parser/enrichment live, **Box live**, EVA/OCR gated). **Live in testing:**
the **automated intake pipeline** — orchestration runs with **3 Graph PUSH subscriptions** over the production
mailbox set **info@ + engineers@ + desk@** (mailbox cutover finished 2026-06-29; test mailbox digital@ removed).
Still gated: finalize EVA (gated), chasers. So a staff member can sign in, browse, and create a case manually,
**and** email to the three scoped production mailboxes can auto-create cases (subscription renewal is now
durable — see the renewal note above).

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

# Function Apps — which functions are actually deployed (verified 2026-06-30T09:40Z: orch 48, api 61, parser 3)
az functionapp function list -g rg-collisionspike-dev -n cespk-api-dev  -o table   # expect: 61 functions
az functionapp function list -g rg-collisionspike-dev -n cespk-orch-dev -o table   # expect: 48 functions (live in testing — 3 push subs)

# Postgres — table count + seeded corpus counts (psql via the admin connection string)
#   SELECT count(*) FROM information_schema.tables WHERE table_schema='public';      -- expect 36
#   SELECT count(*) FROM work_provider; SELECT count(*) FROM inspection_address;     -- 390 / 2209
#   SELECT count(*) FROM case_;                                                       -- 20 (read as csadmin/owner; bypasses RLS)

# Subscription quota class (confirms Free Trial vs PAYG)
az account show --query "{name:name, id:id}" -o json
#   az rest --method get --url "https://management.azure.com/subscriptions/<id>?api-version=2020-01-01" \
#     --query "subscriptionPolicies.quotaId"   # FreeTrial_2014-09-01 until upgraded

# Retained Python Functions reachability (parser shown)
curl.exe -i -X OPTIONS "https://cespike-parser-dev.azurewebsites.net/api/parse" -H "Origin: https://proud-sky-04e318b03.7.azurestaticapps.net" -H "Access-Control-Request-Method: POST"
```

---

# Appendix — HISTORICAL: the prior Power Platform environment

> **NOT LIVE.** Everything below describes the **prior Power Platform implementation**, which was
> **migrated to the Azure stack above** and then **deprovisioned 2026-06-27** (the migration's deprovision
> step [`migration/90-deprovision-power-platform.md`](../HISTORICAL/migration/90-deprovision-power-platform.md) was
> executed — the Dev sandbox deleted via `pac admin delete`). It is **no longer the live system** and the
> resources below no longer exist. Retained for provenance. Do not rely on these resources or treat any of
> them as current.

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
preserved). The Dataverse org was **deprovisioned 2026-06-27** with the rest of the Power Platform footprint.

## (historical) Power Automate flows
~16 cloud flows (`category eq 5`) — CS Intake (shared mailbox), CS Provider Match, CS Case Resolve, CS
Classify + Persist, CS Parse, CS Status Evaluate, CS Enrich, CS Finalize EVA + Box, CS Chaser Draft, CS
Job Sheet Import, plus the Phase-7 Box flows. **Their orchestration logic was re-expressed in the
TypeScript `cespk-orch-dev` Durable pipeline** (now deployed + wired, not yet live). The flows themselves
were **deprovisioned 2026-06-27** (deleted with the Dev sandbox via `pac admin delete`; their definition
JSON was removed in the migration purge — the cutover narrative survives in [docs/HISTORICAL/migration/](../HISTORICAL/migration/)).

## (historical) Power Platform custom connectors
`cr1bd_ceparser`, `cr1bd_dvsaenrich`, `cr1bd_evasentry`, `cr1bd_evavalidation`, `cr1bd_box_rest`,
`cr1bd_box`, `cr1bd_dataverse`, `cr1bd_sharedmailbox_office365`, … — the Power Platform delivery vehicle
that let the Code App / flows reach the Azure Functions and external systems under `connect-src 'none'`.
**Obsolete in the Azure stack:** the SPA reaches the Data API directly over REST, and the Data API /
orchestration call the Python Functions directly (function key / MI) — **no connector layer**.

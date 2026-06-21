# Live environment reference — collisionspike (Sandbox)

> Canonical registry of **what is actually deployed** and its IDs, verified live on **2026-06-19** (parser connector wired/bound; corpus incorporation verified).
> Pairs with [AGENTS.md](../../AGENTS.md) (rules/gotchas) and [CURRENT_STATUS.md](../../CURRENT_STATUS.md)
> (status). For the **intended** end-state see [PLAN.md](../../PLAN.md) and
> [microsoft-stack.md](./microsoft-stack.md). Re-verify IDs with the toolkit at the bottom before relying on them.

## Environment & identity
| Thing | Value |
|---|---|
| **Work env (use this)** | `Collision Engineers - Dev` — id **`b3090c42-51fb-ee24-9868-474da322a3ad`** |
| Org (Dataverse) URL | `https://collisionengineers-dev.crm11.dynamics.com` |
| **Default env (do NOT use)** | `Collision Engineers (default)` — id `858cf5b3-aa0a-47a6-9b40-4851fd0afa94` |
| Maker / signed-in identity / **intake mailbox** | `digital@collisionengineers.co.uk` |
| Code App player host (iframe content) | `https://b3090c4251fbee249868474da322a3.ad.environment.api.powerplatformusercontent.com` |
| Tenant id | read with `az account show --query tenantId -o tsv` |

## Azure (resource group `rg-collisionspike-dev`, UK South)
| Resource | Name / detail |
|---|---|
| **Parser Function** (Flex Consumption FC1, Linux) | `cespike-parser-dev-x7xt3d5ovhi7y` → `https://cespike-parser-dev-x7xt3d5ovhi7y.azurewebsites.net`, route `POST /api/parse`, body `{document(base64), filename}`, `authLevel=function`. Platform CORS allows `https://apps.powerapps.com`. The function key now lives **only on the parser connection** (`01b43be8…`, see below) — the old raw-fetch path (`mockup-app/src/data/parser-config.ts`) was **deleted 2026-06-19**, so the key is no longer in the client bundle. **REDEPLOYED 2026-06-19**: B2 claimant telephone/email extraction live; EVA schema now vendored in-package (`functions/parser/contracts/`) so `/api/parse` no longer emits a spurious `schema_unavailable` issue. |
| **Enrichment Function** (**ACTIVATED 2026-06-20**) | `cespkenrich-fn-gi62sd` — calls DVSA + DVLA **directly** (Entra `client_credentials` + `X-API-Key`); **no Google Cloud gateway** (B1 obviated). KV `cespkenrichkv…`. **`ENRICHMENT_ENABLED=true`** (Dataverse gate flipped 2026-06-20). Live-verified: `BC23JZE`→`REXTON`/SSANGYONG, `L333FGN`→`220I M SPORT AUTO`/BMW. DVSA/DVLA creds present as **plain app settings** (bicep intends KV refs — hygiene deviation). Mileage = MOT-odometer estimate only (near-new vehicles return none, by design). |
| **Address-match Function** (FC1, Linux) — **deployed 2026-06-19** | `cespkaddr-fn-i7m4re` → route `POST /api/match-address`, `authLevel=function`. Part-postcode `Loc` → inspection address via **postcode.io** (`AZURE_MAPS_ENABLED=false`). Live-verified (district match + postcode.io reachable). No secrets, no Key Vault. ROADMAP 4a. |
| **OCR host** (Azure Container Apps) — **image ready, host deploy PENDING** (2026-06-19) | Image `ce-ocr:latest` is **built + pushed** to ACR (the hard part — see ACR row). The ACA host deploy (`ocr/infra/main.bicep`, routes `/api/ocr-pdf` + `/api/plate-ocr`, `minReplicas=0`) **failed 3×** — `ContainerAppOperationError: Failed to provision revision … Operation expired` (~20 min each), so the platform rolled back the site (no `cespkocr-fn-…` exists). Adapters already lazy-import the heavy libs, so it is **not** a startup crash — most likely the AcrPull RBAC-propagation race (system-assigned MI granted AcrPull in the same deploy) or an ingress health-probe mismatch. **Next:** use a pre-granted **user-assigned MI** for AcrPull, or inspect ACA revision logs. NOT live. ROADMAP 5a / B-full. |
| **Container Registry** (Basic) — **created 2026-06-19** | `cespkocracraeee76` (`cespkocracraeee76.azurecr.io`), admin user **off** (identity-based AcrPull). Holds **`ce-ocr:latest`** (digest `sha256:9f1b26…`) — the built OCR image, ready for the host once its revision provisions. |

## Code App
| Thing | Value |
|---|---|
| App id | **`da7ba7af-9ffc-4c70-8f75-1f053ca354da`** |
| Display name | `Collision Engineers - Intake` |
| Play URL | `https://apps.powerapps.com/play/e/b3090c42-51fb-ee24-9868-474da322a3ad/app/da7ba7af-9ffc-4c70-8f75-1f053ca354da` |
| Source | `mockup-app/` (React + Vite). `power.config.json` → `buildPath: dist`, `buildEntryPoint: index.html`. Deploy: `npm run build` → `pac code push`. **Hard-refresh after push** (player caches). |
| Dataverse data sources (power.config.json) | `cr1bd_cases`, `cr1bd_evidences`, `cr1bd_workproviders`, `cr1bd_auditevents`, `cr1bd_fieldlevelprovenances`, `cr1bd_notes`, `cr1bd_chasers` |

## Dataverse
| Thing | Value |
|---|---|
| Solution **CollisionSpike** (schema) | id `fb532f91-f26a-f111-ab0c-0022481b614c`, unmanaged, prefix **`cr1bd`** |
| Solution **CollisionSpikeFlows** (flows) | id `41c87a85-f191-409e-af50-7d1d972c881a`, unmanaged |
| Data loaded | WorkProvider 392 (176 active / 216 archived), Repairer 61, ImageSource 23, InspectionAddress 871 (refreshed S14), 98 N:N links. `cr1bd_cases` **0 — all test cases + evidence + audit events cleared 2026-06-20** for a clean re-test (corpus tables untouched). |

## Connection references (logical name → connector → connection id)
Bound = has a connection; **empty = NOT yet connected** (operator must create the connection).
| Logical name | Display | Connector (apiId suffix) | Connection | Status |
|---|---|---|---|---|
| `cr1bd_sharedmailbox_office365` | CollisionSpike Shared Mailbox (Outlook) | `shared_office365` | `bd752b83172a4e99b3db595942f1b30f` | **Bound** (digital@, Connected) |
| `cr1bd_dataverse` | CollisionSpike Dataverse | `shared_commondataserviceforapps` | `c1c7d4e6c3ad40ab9ac7ac63dcfd02c0` | **Bound** |
| `cr1bd_ceparser` | CollisionSpike CE Parser | **`new_collision-20engineers-20parser`** | `01b43be8542148efbcd1284b8ca64013` | **Bound** ("Collision Engineers Parser", Connected). Connector updated to expose the `api_key` parameter (the `x-functions-key` was previously undefined); `pac code add-data-source` generated `CollisionEngineersParserService`. **⚠️ `document` MUST stay plain `{type:string}` — never add `format:byte`/`x-ms-media-kind` (the gateway then re-encodes the base64 → parser 422 `document_unreadable`); the flow passes the **RAW base64 string** (NOT `base64ToBinary` — that feeds the gateway binary → **HTTP 400**, proven live 2026-06-20 `test34`) and the **tolerant** parser decode is the load-bearing safeguard. Memory `powerplatform-connector-base64-double-encode`.** |
| `cr1bd_evidenceblob` | CollisionSpike Evidence Blob | `shared_azureblob` | _(none)_ | Unbound (later phase) |
| `cr1bd_box` | CollisionSpike Box Archive | `shared_box` | _(none)_ | Unbound (later phase) |
| `cr1bd_dvsaenrich` | CollisionSpike DVSA Enrichment | `shared_dvsaenrich` | `ce0d69449a88437699c27dcaad721c56` | **Bound** (Connected → `cespkenrich-fn-gi62sd`; gate `ENRICHMENT_ENABLED=true` 2026-06-20) |
| `cr1bd_evavalidation` | CollisionSpike EVA Validation | `shared_evavalidation` | _(none)_ | Unbound (gated) |
| `cr1bd_evasentry` | CollisionSpike EVA Sentry | `shared_evasentry` | _(none)_ | Unbound (gated) |
| `cr1bd_jobsheet_excel` | CollisionSpike Job Sheet (Excel) | `shared_excelonlinebusiness` | _(none)_ | Unbound (later phase) |

## Cloud flow inventory (`category eq 5`)
| workflowid | Name | State | Role |
|---|---|---|---|
| `92131f3d-9cd5-4e88-aa9e-a5705a5850a0` | **CS Intake (shared mailbox)** | **ON** ✅ | Email→Case. Trigger rebuilt to `OnNewEmailV3` (own mailbox, Inbox, concurrency=1). Internal workflow guid `8d534fc9-9058-a6f4-4dfd-245b350703b5`. |
| `0f610d7c-e928-440a-bd6e-69420637446e` | CS Provider Match | **ON** | Sender-domain → WorkProvider (needs `knownemaildomains` seeded). |
| `1ddb50a5-1036-40b2-a3aa-e071071e7021` | CS Case Resolve (merge-by-registration) | **ON** ✅ | Instructions↔images same-VRM auto-merge; >1 candidate → Held. Wired into live CS Intake (`Run_case_resolve` after parse, verified 2026-06-21). Repo `intake.definition.json` trails live. |
| `2a6236f9-f0d2-473d-953d-ac5c27320522` | CS Classify + Persist | **ON** ✅ | Attachments → Blob + Evidence rows. |
| `468ffd29-6e62-42c2-8e2d-9500f51147fc` | CS Parse (PDF mapper) | **ON** ✅ | Calls the parser connector. Inspection: AX default + (2026-06-20) parser emits canonical "Image Based Assessment" for image-based/desktop docs. |
| `4d963ff7-7f14-40e5-aa3c-07b741b0cba5` | CS Status Evaluate | **ON** ✅ | Image-rules / status machine. |
| `4e0f301f-8b21-48cc-8f4f-00b062fc7463` | CS Enrich (DVSA MOT) | **ON** ✅ | Mileage/MOT + vehicle-model enrichment. `ENRICHMENT_ENABLED=true` (2026-06-20); writes into empty fields only. |
| `8d70ba4c-3a5b-49bb-a499-4198bb4e9067` | CS Finalize EVA + Box | OFF | EVA submit + Box archive (gated). |
| `1f048996-843c-40fc-9aed-1a9854e6922b` | CS Chaser Draft (draft-only) | OFF | Chaser reminders. |
| `43552b6f-e362-432c-bc88-59c786903e27` | CS Job Sheet Import | OFF | Excel job-sheet import. |

(Three non-project system flows also exist: `Integrated Search API trigger flow`, `Search Dynamics 365 knowledge article flow`, `SLAInstanceMonitoringWarningAndExpiryFlow` — all OFF, leave alone.)

## Runtime gotchas (the rules — full detail in AGENTS.md + memory)
1. Code App CSP `connect-src 'none'` → use **connectors**, never raw `fetch()` to an external host.
2. Connection-webhook flow triggers are **not** armed by the Dataverse `clientdata` API — rebuild/save in the designer.
3. `OnNewEmailV3` = connected mailbox; shared-mailbox V2 needs a real shared mailbox.
4. Azure Functions CORS is a **platform** setting, not `host.json`.
5. Build before push; hard-refresh. No mock case data, ever. Sandbox not Default.

## Current vs intended (M1 pipeline)
Intended chain: **intake → classify-persist → parse → provider-match → case-resolve → status-evaluate →
enrich → finalize (EVA+Box) → chasers**. **Live today (2026-06-20):** intake ✅, classify-persist ✅,
parse ✅, provider-match ✅, case-resolve ✅, status-evaluate ✅, enrich ✅ (`ENRICHMENT_ENABLED=true`).
**Not yet on:** finalize (EVA+Box — gated, no EVA creds), chasers, job-sheet import. So an email now
creates a Case, persists evidence, parses, matches the provider, dedups/merges, evaluates status, and
enriches vehicle/mileage — but EVA submit + Box archive do **not** advance until finalize is wired.
Manual-intake parse in the Code App is **no longer CSP-blocked** — it is now routed
via the CE Parser connector (`cr1bd_ceparser` / `new_collision-20engineers-20parser`, bridged by
`src/data/parser-connector-transport.ts`); the old raw-fetch transport was removed (2026-06-19).

## Live-verification toolkit
```pwsh
# Dataverse (flows on/off, cases):  resource = <org>/
$tok = az account get-access-token --resource "https://collisionengineers-dev.crm11.dynamics.com/" --query accessToken -o tsv
#   GET <org>/api/data/v9.2/workflows?$filter=category eq 5&$select=name,statecode
#   GET <org>/api/data/v9.2/cr1bd_cases?$select=cr1bd_name,createdon&$orderby=createdon desc
#   GET <org>/api/data/v9.2/connectionreferences?$select=connectionreferencelogicalname,connectionid,connectorid

# Flow Management API (runs + trigger health):  resource = https://service.flow.microsoft.com/
#   base = https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/<envId>/flows/<workflowid>
#   GET  {base}/runs?api-version=2016-11-01           # runs (or "no runs" = trigger not firing)
#   GET  {base}/triggers?api-version=2016-11-01       # healthy webhook trigger = 200; 500 = unprovisioned

# Azure Function CORS + reachability
az functionapp cors show -g rg-collisionspike-dev -n cespike-parser-dev-x7xt3d5ovhi7y -o json
curl.exe -i -X OPTIONS "https://cespike-parser-dev-x7xt3d5ovhi7y.azurewebsites.net/api/parse" -H "Origin: https://apps.powerapps.com" -H "Access-Control-Request-Method: POST"
```

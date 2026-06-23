# Azure + Power Platform cost model — collisionspike

> **Canonical cost model** for the live `rg-collisionspike-dev` resource group (UK South) plus the
> Power Platform app layer. Prices captured **2026-06-22** from the **Azure Retail Prices API**
> _(topology refreshed **2026-06-23**: observability consolidated to a **shared App Insights/LAW pair**
> + the OCR pair — the per-function workspace sprawl was deleted; enrichment secrets moved into Key Vault.)_
> (`https://prices.azure.com/api/retail/prices`, UK South), the **Azure pricing pages**, and
> **Microsoft Learn**. Currency is **GBP** for everything the UK South retail feed prices in GBP;
> where the retail feed returns **£0.00 for a meter that is genuinely chargeable** (Flex Consumption
> GB-s/executions, Container Apps per-second active/idle, Document Intelligence pages, Azure Maps
> Gen2) the **USD list price from the pricing page** is used and flagged. USD→GBP conversions use
> **≈0.78 GBP/USD** and are marked _(est.)_.
>
> Pairs with [live-environment.md](./live-environment.md) (the live registry this costs),
> [microsoft-stack.md](./microsoft-stack.md) (intended stack), and the earlier narrative forecast
> [docs/research/azure-cost-prediction-2026-06-22.md](../research/azure-cost-prediction-2026-06-22.md).
> When this doc and the older forecast disagree on a unit price, **this doc is the reconciled
> figure** — see §5.

---

## 1. Summary

**Current live Azure-only footprint (`rg-collisionspike-dev`): ≈ £8–15 / month.**
At spike volume (~500 cases/month, all of OCR / EVA-REST / Box / Azure Maps **gated off**), almost
the entire Azure resource group is **free**: the serverless compute (5 Flex Function Apps + the ACA
OCR host) sits inside the **per-subscription monthly free grants**, Key Vault is per-operation and
trivial, and observability ingestion stays under the pooled **5 GB/month free** Log Analytics grant.
_(Observability was **consolidated 2026-06-23**: the 5 non-parser FC1 apps now report into the
**shared** `cespike-parser-ai-dev` / `cespike-parser-law-dev` pair, leaving just that pair + the OCR
pair — the per-function App Insights/LAW sprawl and the orphaned managed enrich workspace were deleted.
£-impact ≈ £0 either way at this volume, but the surprise-bill surface and resource count both shrank.)_
The only **standing, unavoidable** Azure charge is the **ACR Basic registry (~£3.77/month)** holding
the dormant OCR image.

**The single biggest cost lever is NOT Azure — it is Power Platform licensing.** Power Apps Premium
seats + Power Automate flow licensing dwarf the Azure RG (the realistic platform pilot is
**~£100–340/month ex VAT**, almost all of it Power Platform). Within the Azure RG, the biggest
_standing_ lever is the **ACR Basic £3.77/mo** (deletable while OCR is dormant); the biggest
_scaling_ lever as volume/page-counts grow is **Document Intelligence** (S0 Read £1.1178/1,000 pages;
Layout/prebuilt ~6.7× that), with **observability ingestion** (£2.1461/GB above the free 5 GB) the
sleeper risk if logging is left verbose.

| Bucket | Today (gated-off dev) | Notes |
|---|---:|---|
| **Azure RG total** | **≈ £8–15 / mo** | ~£3.77 is ACR Basic; the rest rounds to ~£0 under free grants |
| Power Platform (separate) | ~£100–340 / mo ex VAT | the real recurring spend — see §3 / §5 |
| Box (separate vendor) | £0 today; ~$45/mo when live | Business tier, 3-seat minimum, billed by Box |

**Estimate confidence:** unit prices are sourced and current; _usage_ volumes (cases/month, pages,
telemetry GB) are **assumptions** — flagged _(est. workload)_ throughout. The live Document
Intelligence SKU is **F0 (free)**, az-verified.

---

## 2. Line-item cost table

All prices UK South. **GBP** unless `USD` shown. "Free grant" = per-**subscription**/month unless
stated. Workload columns are illustrative _(est. workload)_ at ~500 cases/month.

### Class A — Azure Functions (compute)

| Resource | SKU / Meter | Unit price | Source | Example workload _(est.)_ | Est. monthly |
|---|---|---|---|---|---:|
| 5× Flex Function Apps — parser, enrich, eva-sentry, evavalidation, box-webhook (compute) | Flex Consumption (FC1), Linux, On-Demand (no Always-Ready) | Exec time **$0.000026/GB-s** (USD); Executions **$0.40/1M** (USD). Free grant **100,000 GB-s + 250,000 exec/mo per subscription** (shared across all apps). Always-Ready baseline $0.000004/GB-s — **not incurred**. _UK South GBP retail rows return £0.00 — list rate is USD-only._ | [Functions pricing](https://azure.microsoft.com/en-us/pricing/details/functions/) · [consumption costs (worked example)](https://learn.microsoft.com/azure/azure-functions/functions-consumption-costs#consumption-based-costs) · [retail feed](https://prices.azure.com/api/retail/prices) (Functions, uksouth) | ~500 parses + light enrich, fan-out ~5 fn-calls/case ≈ **~4,050 GB-s + ~1,700–3,000 exec/mo** across all 5 apps. box-webhook gated off (~0). | **£0.00** (≈4% of GB-s grant, <1% of exec grant) |
| _Reference: Consumption (Y1) — NOT used_ | Consumption Y1 (Dynamic) | Exec time **$0.000016/GB-s**; Executions **$0.20/1M** (USD). Free grant **400,000 GB-s + 1,000,000 exec/mo per subscription**. | [Functions pricing](https://azure.microsoft.com/en-us/pricing/details/functions/) | Same workload if these apps were Y1. | **£0.00** _(cheaper/unit but Flex chosen for VNet/instance-sizing; Linux Consumption EOL 2028-09-30)_ |

> **Key finding:** the Flex free grant is **per-subscription, shared across all 5 apps** — so at
> spike volume Functions **compute is effectively £0**. First chargeable GB-s only past 100,000:
> e.g. a 50,000 GB-s overage = 50,000 × $0.000026 ≈ **$1.30/mo**. Cost only appears at ~25–50× the
> current volume, or if Always-Ready instances are ever configured (none are).

### Class B — Container Apps + ACR (OCR host)

| Resource | SKU / Meter | Unit price | Source | Example workload _(est.)_ | Est. monthly |
|---|---|---|---|---|---:|
| OCR host — Azure Container Apps (`cespkocr-fn-dev-glju3v`, env `cespkocr-env-dev`), `minReplicas=0`, gated off | Container Apps Consumption (Standard) | Active **$0.000034/vCPU-s** + **$0.000004/GiB-s**; Idle vCPU **$0.000004/vCPU-s**; Requests **$0.40/1M** (USD). Free grant **180,000 vCPU-s + 360,000 GiB-s + 2M req/mo per subscription**. _GBP Standard Requests meter = £0.2981/1M; per-second active/idle meters return £0.00 in feed._ | [Container Apps pricing](https://azure.microsoft.com/en-us/pricing/details/container-apps/) · [billing](https://learn.microsoft.com/azure/container-apps/billing) · [retail feed](https://prices.azure.com/api/retail/prices) (Azure Container Apps, uksouth) | Gated off → scale-to-zero → **~0**. If enabled: 500 jobs × ~10s × 1 vCPU/2 GiB ≈ **5,000 vCPU-s + 10,000 GiB-s + 500 req** (~3% of grant). | **£0.00** |
| Container Apps managed environment (`cespkocr-env-dev`) + user-assigned MI (`cespkocr-acrpull-id`) | Consumption workload profile; UAMI | **No fixed fee** on the Consumption profile (charges flow through the app's vCPU-s/GiB-s). Managed Identity is **free**. (Dedicated profile would add ~$0.075/hr — _not used_.) | [Container Apps pricing](https://azure.microsoft.com/en-us/pricing/details/container-apps/) | One Consumption-only env hosting the single gated app. | **£0.00** |
| Azure Container Registry (`cespkocracraeee76`) — holds `ce-ocr:latest` | **Basic**, UK South | **£0.1241 / registry / day** (≈ **£3.77/mo**); includes 10 GB storage; overage **£0.0745/GB/mo**. (Standard £0.4967/day; Premium £1.2419/day — _not used_.) | [retail feed](https://prices.azure.com/api/retail/prices) (Container Registry, uksouth, Basic) · [ACR pricing](https://azure.microsoft.com/en-gb/pricing/details/container-registry/) | One Basic registry, single ~0.5–1.5 GB image, well under 10 GB included. | **£3.77** _(FIXED — billed even while OCR gated off)_ |

> **Key finding:** ACR Basic **£3.77/mo is the only always-on Azure charge in the RG** and serves a
> **dormant** image. It is the clearest teardown/deferral candidate while OCR stays gated (the image
> can be rebuilt/repushed on demand). ACA compute is £0 purely because of `minReplicas=0`.

### Class C — Document Intelligence

| Resource | SKU / Meter | Unit price | Source | Example workload _(est.)_ | Est. monthly |
|---|---|---|---|---|---:|
| **Document Intelligence — `cespkdocintel-dev` TODAY** (az-verified `sku=F0`) | **F0 (Free)** | **£0.00**. Hard caps: **500 pages/mo**, **first 2 pages only** of any PDF/TIFF, **4 MB** max file. | az `cognitiveservices account show` (sku=F0) · [Read input limits](https://learn.microsoft.com/azure/ai-services/document-intelligence/prebuilt/read?view=doc-intel-4.0.0#input-requirements-v4) · [free-pages note](https://learn.microsoft.com/azure/ai-services/document-intelligence/how-to-guides/use-sdk-rest-api?view=doc-intel-4.0.0) | Near-idle today — PyMuPDF text-layer parser is primary; DI is the scanned-PDF fallback. | **£0.00** _(live SKU; functionally capped)_ |
| Document Intelligence — **production S0 path** (`prebuilt-read`) | S0 PAYG — **S0 Read Pages** meter | **£1.1178 / 1,000 pages** (£0.0011178/page). _Equivalent USD list $1.50/1,000._ Layout/prebuilt **£7.4518/1,000** (6.7×); Custom **£22.3555/1,000** (20×) — _not used_. No account/idle fee. | [retail feed](https://prices.azure.com/api/retail/prices) (productName `Azure Document Intelligence`, uksouth, meter `S0 Read Pages`) · [DI pricing](https://azure.microsoft.com/en-gb/pricing/details/ai-document-intelligence/) | ~500 scanned docs × ~3 pages = ~1,500 pages (conservative upper bound; only the scanned subset hits DI). | **£0.50–£1.68** _(£1.68 if all 1,500 pages scanned; ~£0.50 if ~30% scanned)_ |

> **Key finding:** the F0→S0 move is **forced by function, not cost** — F0 silently processes only
> the **first 2 pages** and caps at **500 pages/mo**, which breaks 3+-page instructions and is
> exhausted at ~250 docs. Cost is trivial either way (~£1–2/mo on S0). The parser calls
> **`prebuilt-read` only** (`ocr/ocr_pdf_adapter.py`, `ocr/plate_adapter.py`) — Layout/Custom are
> not used and must stay unused (6.7×/20× the price). **Do not** buy a commitment tier (smallest
> Read commitment ≈ £279/mo flat covers 500k pages — vastly over-provisioned).

### Class D — Observability (Log Analytics + Application Insights)

| Resource | SKU / Meter | Unit price | Source | Example workload _(est.)_ | Est. monthly |
|---|---|---|---|---|---:|
| **2 Log Analytics workspaces** — `cespike-parser-law-dev` (shared: parser + the 5 repointed FC1 apps) + `cespkocr-law-dev` (OCR) | Pay-as-you-go (Analytics Logs) | Ingestion **£2.1461 / GB**; retention **£0.0969/GB/mo** beyond the included 31 days. **Free 5 GB/month** ingestion (see note on grant scope). | [retail feed](https://prices.azure.com/api/retail/prices) (Log Analytics, uksouth — `Analytics Logs Data Ingestion` £2.1461/GB, `…Data Retention` £0.0969/GB) · [Monitor pricing](https://azure.microsoft.com/en-gb/pricing/details/monitor/) · [cost-logs](https://learn.microsoft.com/azure/azure-monitor/logs/cost-logs) | Low-traffic dev telemetry; **~2–4 GB/mo total** across both workspaces. **Consolidated 2026-06-23** (was ~6–7 per-function workspaces + an orphaned managed enrich workspace, all now deleted). | **£0.00** _(under free grant)_ |
| **2 Application Insights** — `cespike-parser-ai-dev` (shared) + `cespkocr-ai-dev` (OCR) | Workspace-based (bills **through** its Log Analytics workspace) | **No separate AI meter** — ingestion bills at the LA rate **£2.1461/GB**. (Avoid multi-step web tests — £7.45/test/mo standing.) | [Monitor pricing](https://azure.microsoft.com/en-gb/pricing/details/monitor/) · LA ingestion meter above | Request/dependency/trace telemetry, folded into the LA workspaces above. The 5 non-parser FC1 apps' `APPLICATIONINSIGHTS_CONNECTION_STRING` was **repointed to the shared AI** 2026-06-23 (per-app components deleted). | **£0.00 incremental** _(do NOT double-count — it IS the LA ingestion)_ |

> **Key finding (grant scope — the one nuance the older docs split on):** the free **5 GB/month**
> ingestion is a **per-billing-account** allocation that is **NOT multiplied by adding workspaces**.
> So even the former ~6–7-workspace + ~6–7-App-Insights sprawl did not multiply free headroom or £ at
> this volume — but it _was_ free-but-fragile: one mis-scoped diagnostic ingesting >5 GB bills the
> excess at **£2.1461/GB**, and cross-service tracing was painful across ~13 resources. **DONE
> 2026-06-23:** consolidated to the **shared `cespike-parser-*` pair + the OCR pair** (the 5 non-parser
> FC1 apps repointed to the shared App Insights; per-app components + the orphaned managed enrich
> workspace deleted). The OCR pair stays separate (scale-to-zero ACA — surgical repoint unsupported;
> shared-workspace bicep staged on main for OCR's next deploy). £0 saving as predicted, ~10 resources
> and a surprise-bill vector removed. Still pair the shared workspace with sampling + a daily cap. See §4.

### Class E — Storage + Key Vault

| Resource | SKU / Meter | Unit price | Source | Example workload _(est.)_ | Est. monthly |
|---|---|---|---|---|---:|
| 5× Function host storage accounts (`cespikestx…`, `cespkenrichst…`, `cespkevast…`, `cespkevalst…`, `cespkocrst…`) | Storage v2, Hot LRS | Data **£0.0143/GB/mo**; Write **£0.044/10K**; Read/other **£0.0035/10K** | [retail feed](https://prices.azure.com/api/retail/prices) (Storage, Hot LRS, `General Block Blob v2`, uksouth) · [Blob pricing](https://azure.microsoft.com/en-gb/pricing/details/storage/blobs/) | Each app's deployment package + WebJobs control containers ≈ <1 GB + housekeeping txns. **Each Flex app mandates its own storage account.** | **~£0.10–0.50 total** _(txn-dominated)_ |
| Shared evidence storage (`cespkevidstdev01`) — case images/PDFs | Storage v2, Hot LRS | Same meters as above | [retail feed](https://prices.azure.com/api/retail/prices) (Storage, Hot LRS, uksouth) | ~500 cases × ~10 files × ~2 MB ≈ 10 GB/mo ingested; ~20–30 GB resident; ~200K ops. ADR-0012 image-only purge keeps it bounded. | **~£0.70–1.30** |
| 3× Key Vault — `cespkenrichkv…`, `cespkevakv…`, `cespkboxkvv76a47` (eva + box empty/dormant) | Standard | Operations **£0.0224/10,000**; **no per-vault fixed fee**. Cert renewal £2.2356 each; key rotation £0.7452 each — _not used_. | [retail feed](https://prices.azure.com/api/retail/prices) (Key Vault, uksouth, Standard) · [KV pricing](https://azure.microsoft.com/en-gb/pricing/details/key-vault/) | A few thousand secret-gets/mo across vaults; eva + box KVs empty (~0). Note: enrich creds are now **Key Vault references** (DVSA/DVLA secrets populated 2026-06-23 — the earlier plain-app-settings hygiene deviation is closed); adds a handful more secret-gets, still trivial. | **~£0.05 total** |

### Class F — Power Platform (NOT in the Azure RG)

| Resource | SKU | Unit price | Source | Example workload _(est.)_ | Est. monthly |
|---|---|---|---|---|---:|
| Power Apps Code App — end-user run license | Power Apps Premium, per user/mo (annual) | **£15.40/user/mo** ex VAT (£GB list) / **$20/user/mo** (US list; $12 at 2,000+ seats). PAYG per-app alt **$10/active user/app/mo**. | [Power Apps pricing](https://www.microsoft.com/en-gb/power-platform/products/power-apps/pricing) · [PAYG meters](https://learn.microsoft.com/power-platform/admin/pay-as-you-go-meters) · [Code App license discussion](https://github.com/microsoft/PowerAppsCodeApps/discussions/283) | 5–10 staff on the Intake Code App; app calls **premium/custom connectors** (CE Parser, DVSA, Box REST) → Premium required (M365-seeded won't cover it). | **£77–£154** (5–10 × £15.40) |
| Power Automate cloud flows (~10–15) | Premium per user/mo OR PAYG flow-run | Premium **£11.50/user/mo** (£GB) / **$15** (US). PAYG **$0.60/premium cloud-flow run** (standard-connector flows excluded). Process **£115.30/bot/mo**. | [Power Automate pricing](https://www.microsoft.com/en-gb/power-platform/products/power-automate/pricing) · [PAYG meters](https://learn.microsoft.com/power-platform/admin/pay-as-you-go-meters) | Custom-connector flows are **premium**. Cheapest = run all flows under 1–2 premium owner/service accounts. | **£11.50–£30** (owner-licensed) _— see §3 Process risk_ |
| Dataverse capacity (cases/evidence/providers/audit) | DB/File/Log capacity | Each Premium user adds **250 MB DB + 2 GB file** to the pool; overage DB **£30.80/GB/mo** (£GB) / $40 (US), File ~$2/GB, Log ~$10/GB. | [Power Apps pricing](https://www.microsoft.com/en-gb/power-platform/products/power-apps/pricing) | Metadata-only footprint (bytes live in Blob + Box, **not** Dataverse). 5–10 seats pool ≥1.25–2.5 GB DB + ≥10–20 GB file. | **£0 overage** _(watch DB GB if audit rows balloon)_ |

> **Key finding:** the **largest recurring cost of the whole solution is Power Platform seats**, not
> Azure. Architecture deliberately keeps bytes **out** of Dataverse (Blob + one-way Box mirror) so
> Dataverse stays metadata-only → ~£0 capacity overage. Code Apps still surface as **"(Preview)"** in
> `pac` — confirm GA + that Premium is the supported run license before committing seats.

### Class G — External / Maps

| Resource | SKU | Unit price | Source | Example workload _(est.)_ | Est. monthly |
|---|---|---|---|---|---:|
| Azure Maps — geocoding (**gated off**, `AZURE_MAPS_ENABLED=false`) | Gen2 (Gen1 S0 retiring) | **Gen2 ~$4.50/1,000** transactions (USD). Legacy **Gen1 S0 $0.50/1,000** retires **2026-09-15**. UK South GBP feed surfaces only legacy S1 (£3.7259/1,000) for reference. | [Azure Maps pricing](https://azure.microsoft.com/en-gb/pricing/details/azure-maps/) · [retail feed](https://prices.azure.com/api/retail/prices) (Azure Maps, uksouth) | Address-match uses **postcode.io (free)**; Maps not called. If enabled: ~500 geocodes/mo. | **£0.00** today (~£1.80/mo if enabled at 500/mo on Gen2) |
| postcode.io (UK postcode normalisation) | Public free API | **£0.00** | [postcodes.io](https://postcodes.io/) | Active address path today (~500 cases/mo). | **£0.00** |
| DVSA MOT History API + DVLA VES (enrichment) | UK gov keyed REST | **£0.00** (free, key/quota-gated; Entra `client_credentials` + X-API-Key) | [DVSA MOT History](https://documentation.history.mot.api.gov.uk/) · [DVLA VES](https://developer-portal.driver-vehicle-licensing.api.gov.uk/) | ~500 DVSA + ~500 DVLA lookups/mo (enrichment LIVE). | **£0.00** _(API fees; Function compute is the Flex row)_ |
| Box (Phase-7 mirror — **separate vendor**, dormant) | Business tier | **~$15/user/mo** (Business floor; CCG/folders/File-Requests/webhooks). **3-seat minimum ≈ $540/yr.** Business Plus ~$33/user/mo only for the deferred metadata field. | [Box pricing](https://www.box.com/pricing) · `box-integration-pivot/02-plans-and-cost.md` | Free throwaway test account today (all `BOX_*` gates off). | **£0 today**; **~$45/mo** when live (billed by Box, not Azure) |

### Roll-up

| Class | Today (gated-off dev) |
|---|---:|
| A — Functions compute | £0.00 |
| B — Container Apps + ACR | **£3.77** (all ACR Basic; ACA £0) |
| C — Document Intelligence | £0.00 (F0) → £0.50–1.68 on S0 |
| D — Observability | £0.00 (under 5 GB free) |
| E — Storage + Key Vault | ~£0.85–1.85 |
| **Azure RG subtotal** | **≈ £5–11 (working range £8–15 with telemetry/storage drift)** |
| F — Power Platform _(separate budget)_ | ~£90–£190+ ex VAT (or +£115.30 Process — §3) |
| G — Box _(separate vendor)_ | £0 today; ~$45/mo live |

---

## 3. Current vs all-planned-features

What changes when the gated features flip on. **Azure-side deltas are small; the licensing and
vendor deltas are the real movement.**

| Feature flip | Gate | Azure-side delta | Licensing / vendor delta | Net comment |
|---|---|---|---|---|
| **OCR activation** | `OCR_PROVIDER`/`PLATE_PROVIDER` enabled, `minReplicas=0` kept | ACA compute still ~£0 under the 180k vCPU-s grant (~3% used at 500 jobs); ACR Basic **already** billed (£3.77). DI may move F0→S0 (+£0.50–1.68). | none | The ACR floor is **already paid today** — activation adds ~£0–2/mo. Keep `minReplicas=0`. |
| **Document Intelligence → S0** | promote SKU + KV `docintel-read-key` | **+£0.50–£1.68/mo** at ~1,500 pages (Read). Layout/Custom would be 6.7×/20× — avoid. | none | Forced by F0's 2-page/500-page caps, not cost. |
| **EVA-REST (Sentry)** | `EVA_API_ENABLED` | eva-sentry + evavalidation Functions wake — still inside the **shared** Flex free grant (~£0). Their KV ops + telemetry remain negligible. | EVA is an external system (no Azure meter). | ~£0 Azure delta; the work is integration, not cost. |
| **Box (Phase-7)** | `BOX_API_ENABLED` etc. | box-webhook Function wakes (Flex, ~£0); box KV gets a couple of secrets (~£0); **one-way mirror keeps the authoritative blob copy** so evidence storage persists (image-only purge bounds it). | **Box Business ~$15/user/mo, 3-seat min ≈ $540/yr** (separate Box invoice). | The only material new recurring cost — and it is **Box's bill, not Azure's**. |
| **Azure Maps** | `AZURE_MAPS_ENABLED` | **+~£1.80/mo** at 500 geocodes/mo on **Gen2 ($4.50/1k)**; ~£0 if covered by the Gen2 free grant. | none | Stay on postcode.io (free) unless richer geocoding/non-UK is needed. Note Gen1 retires 2026-09-15. |
| **Multi-inbox** (3 Outlook shared inboxes) | flow trigger expansion | ~3× the case volume → ~3× Functions GB-s (still ~12% of the 100k grant) and ~3× telemetry GB (watch the 5 GB free band) and ~3× DI pages (S0 ~£1.50–5/mo). | more Power Automate runs — **license the owner/service account**, do not use the $0.60/run PAYG meter. | Azure scales sub-linearly into the grants; the watch items are **telemetry GB** and **Power Automate run licensing**. |

**All-features-on, ~500–1,000 cases/mo (Azure RG only):** still **~£6–20/mo** — ACR £3.77 + DI S0
~£1–5 + evidence storage ~£1–3 + observability £0–10 (sampling-dependent). The platform total is
dominated by Power Platform seats and the Box vendor line, **not** the Azure RG.

**Power Automate Process risk (carried from the narrative forecast):** if the shared-mailbox /
background flow chain cannot be covered by a per-user/owner Power Automate Premium licence, Microsoft
may require a **Power Automate Process licence at £115.30/bot/month**, pushing the platform pilot to
**~£230–340/month ex VAT**. Budget Scenario B until tenant licensing confirms otherwise. See
[azure-cost-prediction-2026-06-22.md](../research/azure-cost-prediction-2026-06-22.md) §Scenario B.

---

## 4. Cost-reduction opportunities

Ordered by clarity, not £ (most of these are governance wins at this volume, not savings).

1. **Tear down / defer the ACR Basic registry while OCR is dormant — saves ~£3.77/mo (~£45/yr).**
   This is the **only standing Azure charge** and serves a gated image. The image (`ce-ocr:latest`)
   can be rebuilt and repushed on demand when OCR is activated. This is the single largest concrete
   Azure saving available today.

2. **Consolidate the observability sprawl — DONE 2026-06-23.** Cross-ref Class D. The former ~6–7 Log
   Analytics + ~6–7 App Insights were collapsed to the **shared `cespike-parser-*` pair + the OCR pair**
   (5 non-parser FC1 apps repointed; per-app components + the orphaned managed enrich workspace deleted;
   OCR deferred to its next deploy, bicep staged on main). **£0 saving** as predicted (already under the
   pooled 5 GB free grant) but it removed ~10 resources, makes the free grant easy to reason about, gives
   one place for end-to-end traces, and removed the **surprise-bill vector** (one mis-scoped diagnostic
   >5 GB bills the excess at **£2.1461/GB**). Remaining: pair the shared workspace with **adaptive/fixed
   sampling + a daily cap** so a noisy parser can't push it past the free band.

3. **Keep evidence storage lean (Class E).** ADR-0012's **image-only blob purge** after Box archival
   is the right pattern — it caps the one storage account that scales with case volume. Keep bytes in
   **Blob + Box, out of Dataverse** (preserves the ~£0 Dataverse overage). Prune old Flex deployment
   packages so the 5 host storage accounts stay near-zero GB (they're transaction-dominated anyway).

4. **Stay on `prebuilt-read` (Class C) and postcode.io (Class G).** Read is 6.7× cheaper than Layout
   and 20× cheaper than Custom; postcode.io is free vs Azure Maps Gen2 ($4.50/1k). Both are deliberate
   cost wins — don't regress them.

5. **Keep scale-to-zero discipline:** `minReplicas=0` on ACA and **no Always-Ready** on the Flex
   apps. Both are what make the compute layer £0; either one flipped converts free idle into a
   standing charge with **no free grant** (Always-Ready baseline $0.000004/GB-s).

6. **License Power Automate flows via an owner/service account, not the PAYG run meter.** At ~200
   cases × ~4 premium runs the **$0.60/run meter ≈ $480/mo**, vs **£11.50–£30/mo** for 1–2 premium
   owner seats — a 10×+ difference. This is a Power-Platform-side saving but the largest single £
   lever in the whole footprint after seat count.

---

## 5. Doc amendments (reconciliation)

Stale or missing cost claims to fix elsewhere in the repo. **This doc is the reconciled source.**

| # | Doc · location | Existing claim | Status | Amendment |
|---|---|---|---|---|
| 1 | _every cost doc_ | (no standalone Azure-RG total — Azure is folded into the Power-Platform scenarios) | **MISSING** | Add the explicit **Azure-only RG subtotal ≈ £8–15/mo today**, of which **~£3.77 is ACR Basic**; everything else ≈£0 under per-subscription free grants. |
| 2 | `docs/research/azure-cost-prediction-2026-06-22.md` lines 101, 130 | ACR Basic "~£3-£6/month" | **CORRECT but loose** | Tighten to **~£3.77/mo flat** (£0.1241/day; 10 GB included; the only standing Azure charge). |
| 3 | `docs/research/azure-cost-prediction-2026-06-22.md` lines 41, 103 + `microsoft-stack.md` line 155 | DI treated as a **cost** decision (F0 £0 vs S0 paid) | **INCOMPLETE** | Add the F0 **functional** caveat: F0 processes only the **first 2 pages** + caps at **500 pages/mo** + 4 MB. The F0→S0 move is forced by **function, not cost** (S0 Read ≈ £0.50–1.68/mo). |
| 4 | `microsoft-stack.md` line 155 | DI "Read ~$1.50/1,000 pages … **$8–150**" | **STALE/over-stated** | Today **£0 (F0, az-verified)**; production **S0 Read ~£0.50–£1.68/mo** at ~1,500 pages. The $150 ceiling = custom-neural ($30/1k) which is **NOT used** (parser is `prebuilt-read` only). |
| 5 | `microsoft-stack.md` line 128 + research line basis | Azure Maps "~$5/1,000 geocodes" / "$0.50/1k" | **BASIS CHANGED** | **Gen1 S0 ($0.50/1k) retires 2026-09-15 → Gen2 ~$4.50/1k applies.** ~£0 today (`AZURE_MAPS_ENABLED=false`). The old "~$5" is now coincidentally near the Gen2 rate but the SKU changed. |
| 6 | `microsoft-stack.md` line 157 | AI Builder "credits included … ~$0" | **STALE** | AI Builder credits **retire 2026-11-01**; moot — the live deterministic parser replaces AI Builder doc processing. Strike the "~$0" basis. |
| 7 | `microsoft-stack.md` line 156 | "Azure AI Vision (Phase 4) ~$8" | **OUT OF LIVE SCOPE** | Mark Phase-4/not-deployed — the live image path is the ACA OCR (Tesseract) + DI-Read fallback, not Azure AI Vision. Don't read as a current cost. |
| 8 | `microsoft-stack.md` line 153 | "Power Automate (per-user) ~$15/user … $15–30" | **CORRECT but incomplete** | Cross-reference the **Power Automate Process (£115.30/bot) licensing risk** and the **PAYG-run trap** ($0.60/premium run ≈ $480/mo at volume; license the owner account instead). |
| 9 | `docs/architecture/live-environment.md` line 30 (ACR) | Registry listed Basic, admin off — **no cost annotation** | **ADD (additive)** | Annotate: "**~£3.77/mo standing (£0.1241/day) — the only always-on Azure charge in the RG; teardown candidate while OCR is gated.**" |
| 10 | `CURRENT_STATUS.md` line 322 | "All deployed compute is FC1 (~£0 idle) or ACA scale-to-zero" | **CORRECT** | Optional: append "the only standing Azure charge is the ACR Basic registry ~£3.77/mo." |
| 11 | `box-integration-pivot/02-plans-and-cost.md` (Blob Hot $0.0208/GB USD) | Blob priced in USD list only | **CONSISTENT** | Optional: add the GBP UK South retail figure **£0.0143/GB** alongside the USD for UK-South precision (same meter, two currencies). |

**Net:** no doc is badly wrong — the repo's cost story is accurate and current. The amendments are
(a) adding the **explicit ~£8–15/mo Azure-RG total** (currently implicit), (b) tightening **ACR to
£3.77/mo**, (c) re-basing the DI "$8–150" figure to **£0 (F0) / ~£0.50–1.68 (S0)** plus the F0
functional caveat, and (d) two already-half-flagged staleness fixes (AI Builder retiring 2026-11-01;
Azure Maps Gen1→Gen2).

---

### Methodology & honesty notes

- **Prices** are list/retail, captured 2026-06-22 (UK South). Microsoft states retail prices are
  estimates that vary by agreement/date/currency. Confirm in Azure Cost Management / the Pricing
  Calculator before widening production traffic.
- **Workloads** marked _(est.)_ are assumptions (~500 cases/mo at dev volume). **Actual usage is
  unknown** — no billing export was read; these are forward estimates, not a bill.
- **Currency:** GBP where the UK South retail feed prices in GBP; USD list where the feed returns
  £0.00 for a genuinely chargeable meter (Flex GB-s/exec, ACA per-second, DI pages, Maps Gen2).
  USD→GBP at ≈0.78 GBP/USD, marked _(est.)_.
- **Live SKU verification:** Document Intelligence is **F0** (az-verified); the 5 Function Apps are
  **FC1/Flex** and the OCR host is **ACA Consumption** `minReplicas=0` (per `live-environment.md`,
  re-verified 2026-06-22). ACR is **Basic**.
- **Scope:** this models the Azure RG + Power Platform layer. EVA, Audatex, WhatsApp, Microsoft 365
  base seats, and VAT are out of scope.

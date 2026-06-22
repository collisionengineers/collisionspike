# Azure cost prediction — collisionspike

_Last updated: 2026-06-22_

_Rechecked against official Microsoft pricing pages on 2026-06-22. This version amends the first draft by adding a separate Power Automate **Process** licensing-risk scenario, because the live project uses background/shared-mailbox cloud flows and Microsoft prices Process separately from per-user Power Automate Premium._

This document predicts the likely monthly Microsoft/Azure cost of the `collisionspike` repository from the services currently described in the repo and the live sandbox notes.

It is an estimate, not a bill. Azure prices vary by subscription agreement, region, tax, currency conversion, reserved capacity, and exact SKU. Microsoft also states on its Azure pricing pages that prices are estimates, may vary by agreement/date/currency, and are calculated from USD using exchange rates for the coming month. Treat this as a working forecast, then confirm the exact subscription price in Azure Cost Management / Pricing Calculator before widening production traffic.

## Plain-English summary

`collisionspike` is not an expensive Azure architecture in its current shape. Most custom compute is serverless: it sits idle at near-zero cost and only charges when it runs. The cost risk is not the parser/enrichment/address functions; it is Power Platform licensing, Dataverse capacity growth, evidence/file storage, monitoring/logging, and any future always-on AI/search/copilot feature.

There are now **two realistic cost scenarios**:

| Scenario | What it assumes | Likely current sandbox/pilot cost | Likely 1,000-case/month production pilot |
|---|---|---:|---:|
| **A — lowest plausible licensing** | 5 x Power Apps Premium + 1 x Power Automate Premium flow owner/service user | **~£100-£150/month ex VAT** | **~£120-£220/month ex VAT** |
| **B — safer licensing-risk budget** | 5 x Power Apps Premium + 1 x Power Automate **Process** licence for the background process | **~£210-£270/month ex VAT** | **~£230-£340/month ex VAT** |

**Recommendation:** budget internally for **Scenario B** until Microsoft/tenant licensing confirms that the email-triggered/shared-mailbox cloud flows are covered by a cheaper Power Automate Premium/user-owned-flow arrangement. If Scenario A is valid, the project stays close to the original ~£110-£200/month forecast.

**Future optional Copilot Studio:** add at least **£153.80/month ex VAT** for the 25,000-credit plan, before any additional AI/model usage.

## Source basis from this repo

The repo describes the project as a Power Apps Code App + Dataverse + Power Automate + Azure Functions spike for the intake -> parse -> review -> enrich -> EVA + Box workflow.

Current live/sandbox evidence in the repo points to these Microsoft services:

| Area | Service/resource | Current cost posture |
|---|---|---|
| UI | Power Apps Code App | Per-user licensing cost. Main fixed cost. |
| Data | Dataverse | Included capacity from Power Platform licences initially; add-on risk if evidence/files/logs grow. |
| Workflow | Power Automate cloud flows | Licensing is the main uncertainty: Power Automate Premium may be enough if a licensed owner/service user covers the flows; Power Automate Process may be the safer budget for unattended/core background automation. |
| Parser | Azure Functions Flex Consumption FC1 | Near-zero idle if no Always Ready. Uses storage and monitoring. |
| Enrichment | Azure Function + DVLA/DVSA calls | Near-zero idle. External DVLA/DVSA API costs not estimated here. |
| Address matching | Azure Function + postcode.io | Near-zero idle; postcode.io is free. |
| OCR | Azure Container Apps + ACR image | Scale-to-zero compute if `minReplicas=0`; ACR Basic has a standing daily charge. |
| Document OCR fallback | Azure AI Document Intelligence F0/S0 | F0 gives 0-500 pages/month free; paid usage only if fallback exceeds free tier or moves to paid SKU. |
| Secrets | Key Vault | Very low at current transaction volume. |
| Evidence/blob storage | Azure Storage / Dataverse file storage | Low at small volume, but grows with photos, `.eml`, PDFs, and audit evidence. |
| Optional assistant | Copilot Studio / Copilot Credits | OFF; material fixed cost if enabled. |
| Optional heavier AI | Azure OpenAI / Foundry models | OFF or gated; usage-based, not forecast without prompts/tokens/images. |

## Official Microsoft pricing facts used

Checked against public Microsoft pricing pages on 2026-06-22:

| Item | Official fact used | Source URL |
|---|---|---|
| Power Apps Premium | **£15.40/user/month**, paid yearly, ex VAT. Includes Dataverse entitlement of **250 MB database + 2 GB file** per licensed user. | https://www.microsoft.com/en-gb/power-platform/products/power-apps/pricing |
| Power Apps flow context | Power Apps Premium supports unlimited workflows **within the app context**. This may not cover all background/shared-mailbox flows. | https://www.microsoft.com/en-gb/power-platform/products/power-apps/pricing |
| Dataverse database add-on | **£30.80/GB/month**, paid yearly, ex VAT. Microsoft lists Dataverse database/file/log capacity add-ons per GB at tenant level. | https://www.microsoft.com/en-gb/power-platform/products/power-apps/pricing |
| Power Automate Premium | **£11.50/user/month**, paid yearly, ex VAT. Includes cloud flows and Dataverse entitlement of **250 MB database + 2 GB file**. | https://www.microsoft.com/en-gb/power-platform/products/power-automate/pricing |
| Power Automate Process | **£115.30/bot/month**, paid yearly, ex VAT. Microsoft describes it for core enterprise processes and unattended automation. | https://www.microsoft.com/en-gb/power-platform/products/power-automate/pricing |
| Copilot Studio | **£153.80/month** for **25,000 Copilot Credits/month**, paid yearly, ex VAT. | https://www.microsoft.com/en-gb/power-platform/products/power-automate/pricing |
| Azure Functions Flex Consumption | Monthly free grant of **250,000 executions** and **100,000 GB-s** on-demand resource consumption per subscription. Always Ready is separately billable. | https://azure.microsoft.com/en-gb/pricing/details/functions/ |
| Azure Functions Consumption | Monthly free grant of **1 million requests** and **400,000 GB-s** per subscription. Function storage accounts are not included in the free grant. | https://azure.microsoft.com/en-gb/pricing/details/functions/ |
| Azure Container Apps Consumption | First **180,000 vCPU-seconds**, **360,000 GiB-seconds**, and **2 million requests** per subscription/month are free. Apps with zero replicas have no usage charges while scaled to zero. | https://azure.microsoft.com/en-gb/pricing/details/container-apps/ |
| Azure AI Document Intelligence | Free tier: **0-500 pages/month**. S0 is page-metered. Documents are billed by pages analysed. | https://azure.microsoft.com/en-gb/pricing/details/document-intelligence/ |
| Azure Container Registry Basic | Basic tier includes **10 GB** storage and has a per-day standing price. Additional storage is charged beyond the included limit. | https://azure.microsoft.com/en-gb/pricing/details/container-registry/ |
| Azure Blob Storage | Cost depends on data volume stored, operation quantity/type, redundancy, access tier, and transfer. Prices are per GB/month plus operations. | https://azure.microsoft.com/en-gb/pricing/details/storage/blobs/ |
| Azure Key Vault | Vault operations are metered per **10,000 transactions**; every successfully authenticated REST API call counts as one operation. No setup fee. | https://azure.microsoft.com/en-gb/pricing/details/key-vault/ |
| Azure Monitor / Log Analytics | Standard metrics/activity logs are free, but logs are billed by ingestion, retention, export, query/search scenarios. First **5 GB/month per billing account** in the relevant tier is free. | https://azure.microsoft.com/en-gb/pricing/details/monitor/ |

## Baseline assumptions

These assumptions are intentionally conservative enough for a small production pilot:

| Assumption | Value used |
|---|---:|
| Staff using the app | 5 users |
| Automation/service users | 1 user or 1 process licence, depending licensing confirmation |
| Cases/month | 1,000 |
| Documents/case | 1-2 instruction documents |
| Average document pages/case | 3-5 pages |
| Images/case | 0-10, highly variable |
| Evidence storage/case | 10-50 MB typical working range |
| Parser route | Deterministic parser first |
| Document Intelligence route | OCR fallback only |
| Functions plan | Flex Consumption FC1 / scale-to-zero posture |
| Container Apps OCR | `minReplicas=0`; no always-on replica |
| Copilot Studio | OFF |
| Azure AI Search | OFF |
| EVA/Box | External costs excluded |

## Monthly forecast — current live/sandbox posture

### Scenario A — lowest plausible licensing

| Cost item | Estimate/month ex VAT | Why |
|---|---:|---|
| Power Apps Premium x5 | **£77.00** | 5 app users at £15.40/user/month. |
| Power Automate Premium x1 | **£11.50** | One automation/service owner assumption. This is the low-cost assumption and must be licensing-checked. |
| Azure Functions compute | **£0-£5** | Parser, enrichment, address, EVA validation, EVA Sentry are low-volume and likely inside free grants if no Always Ready is configured. |
| Function storage accounts | **£1-£10** | Each Function app needs a storage account; storage is charged separately from Functions free grants. |
| Application Insights / Log Analytics | **£0-£15** | Depends on sampling and retention. First 5 GB/month per billing account is free for the relevant tier, but verbose traces can exceed this. |
| Key Vault | **£0-£2** | Low transaction volume. |
| Azure Container Registry Basic | **~£3-£6** | Basic tier has a standing daily price and includes 10 GB storage. |
| Azure Container Apps OCR host | **£0-£10** | Scale-to-zero and likely inside free grants at low volume; cost rises with OCR processing time. |
| Document Intelligence F0 | **£0** | F0 gives 500 free pages/month. If production OCR fallback exceeds F0, move this to the production forecast below. |
| Dataverse capacity add-ons | **£0 initially** | 5 Power Apps Premium licences provide roughly 1.25 GB DB + 10 GB file entitlement before any other tenant entitlements. |
| **Expected current subtotal** | **~£90-£130/month** | Main fixed cost is Power Platform licensing. |
| **Safety margin** | **+£20/month** | For storage/logging drift. |
| **Working current forecast** | **~£100-£150/month ex VAT** | Sensible low-cost sandbox/pilot budget if Power Automate Premium licensing is valid. |

### Scenario B — safer licensing-risk budget

| Cost item | Estimate/month ex VAT | Why |
|---|---:|---|
| Power Apps Premium x5 | **£77.00** | 5 app users. |
| Power Automate Process x1 | **£115.30** | Safer budget for background/core process automation if the shared-mailbox flow chain is not covered by the lower per-user model. |
| Azure variable services | **£15-£75** | Functions, storage, logging, ACR, Container Apps, Key Vault, and F0 Document Intelligence. |
| **Working current forecast** | **~£210-£270/month ex VAT** | Use this as the conservative budget until licensing is confirmed. |

## Monthly forecast — 1,000 cases/month production pilot

### Scenario A — Power Automate Premium/user-owned-flow assumption

| Cost item | Estimate/month ex VAT | Notes |
|---|---:|---|
| Power Apps Premium x5 | **£77.00** | Fixed if 5 users. |
| Power Automate Premium x1-2 | **£11.50-£23.00** | Depends whether one service account owns flows or multiple users need Premium automation rights. |
| Azure Functions compute | **£0-£15** | 1,000 cases/month is still small for Functions. A bad retry loop or Always Ready setting changes this. |
| Storage: evidence, PDFs, `.eml`, images | **£2-£30** | 10-50 GB/month active evidence is usually cheap, but retention rules matter. |
| Application Insights / Log Analytics | **£5-£35** | Use sampling and retention caps. This can quietly exceed compute cost. |
| Key Vault | **£0-£3** | Low. |
| ACR Basic | **~£3-£6** | Standing registry cost. |
| Container Apps OCR | **£0-£30** | Depends on scanned-PDF/plate-OCR volume and CPU time. If only used as fallback, likely low. |
| Document Intelligence paid fallback | **£0-£40** | If only OCR misses are sent. If every page is sent through DI, cost rises by page count and model type. |
| Dataverse add-on capacity | **£0-£60** | If evidence files stay in Blob and Dataverse stores metadata, likely low. If Dataverse stores files/images directly, capacity can become material. |
| **Working production forecast** | **~£120-£220/month ex VAT** | Original forecast still broadly valid under this licensing assumption. |

### Scenario B — Process licence budget

| Cost item | Estimate/month ex VAT | Notes |
|---|---:|---|
| Power Apps Premium x5 | **£77.00** | Fixed if 5 users. |
| Power Automate Process x1 | **£115.30** | Conservative process-level licensing budget for unattended/background flow chain. |
| Azure variable services | **£35-£145** | Storage/logging/OCR/Document Intelligence/Container Apps can drift with real evidence volume. |
| **Working production forecast** | **~£230-£340/month ex VAT** | Safer planning number until Microsoft confirms licensing posture. |

## Future/optional costs to keep gated

| Feature | Additional cost risk | Recommendation |
|---|---:|---|
| Copilot Studio | **+£153.80/month ex VAT** minimum for the 25k-credit plan | Keep OFF until the core intake/EVA/Box path is proven. |
| Azure AI Search | Material always-on monthly cost risk | Do not add until there is a real searchable corpus and a clear use case. |
| Azure OpenAI / Foundry vision calls | Token/image based; can grow with image count | Gate behind explicit per-case limits and logging. |
| Document Intelligence for every document | Page-count based | Keep deterministic parser primary; use DI only for scanned/failed documents. |
| Container Apps min replicas >0 | Converts OCR host from idle-safe to always-charged | Keep `minReplicas=0` unless cold start is proven unacceptable. |
| Function Always Ready | Converts Functions from near-zero idle to standing cost | Avoid unless latency matters more than cost. |
| Dataverse file/image storage | Can become a real cost with high image retention | Prefer Blob for bulky evidence, Dataverse for metadata/index/status. |
| Long log retention | Can exceed compute costs | Set retention, sampling, and per-service logging budgets. |

## Main cost levers

1. **Flow licensing model** — the largest correction in this re-check. Low case: +£11.50/month for one Power Automate Premium user. Conservative case: +£115.30/month for one Power Automate Process licence.
2. **Number of app users** — every extra Power Apps Premium user adds £15.40/month ex VAT.
3. **Evidence storage strategy** — Blob metadata pattern is cheaper and more controllable than storing all bulky files directly in Dataverse.
4. **OCR strategy** — Tesseract/local parser first, Document Intelligence only for misses, keeps costs low.
5. **Scale-to-zero discipline** — keep Functions and Container Apps idle-safe; avoid Always Ready/min replicas unless measured latency proves it is needed.
6. **Logging volume** — reduce verbose traces after live verification. Logs can become the accidental bill.

## Recommended budget caps

Set Azure budgets/alerts before widening live traffic:

| Scope | Suggested monthly alert |
|---|---:|
| `rg-collisionspike-dev` sandbox | **£50** Azure-only alert excluding Power Platform licences |
| Azure Functions + storage + monitoring | **£25** alert |
| OCR/Container Apps/ACR | **£25** alert |
| Document Intelligence | **£10** alert during fallback-only testing |
| Log Analytics/Application Insights | **£10** alert initially; raise only with evidence |
| Total Microsoft platform pilot — Scenario A | **£200** planning ceiling |
| Total Microsoft platform pilot — Scenario B | **£350** planning ceiling |

## Conclusion

The current Microsoft design is still cost-safe for a spike/pilot if the repo keeps its present discipline:

- Power Platform licences are the main predictable cost.
- The previous low-cost estimate remains valid **only if** the background flow chain can be licensed with Power Automate Premium/user-owned-flow assumptions.
- A safer budget must include the possible **Power Automate Process** licence.
- Azure Functions and Container Apps should remain close to zero at idle.
- Document Intelligence should stay fallback-only.
- Copilot Studio, Azure AI Search, and always-on compute should remain gated.
- Blob should hold bulky evidence; Dataverse should hold structured case metadata and audit state.

The practical planning number is now:

- **~£120-£220/month ex VAT** if the low-cost Power Automate Premium licensing assumption is confirmed.
- **~£230-£340/month ex VAT** if Microsoft/tenant licensing requires a Power Automate Process licence for the background/shared-mailbox process.

This excludes existing Microsoft 365 seats, EVA, Box, Audatex, WhatsApp, external API charges, and VAT.

## Source URLs

- `README.md`
- `CURRENT_STATUS.md`
- `docs/architecture/live-environment.md`
- `docs/architecture/microsoft-stack.md`
- Microsoft Power Apps pricing: https://www.microsoft.com/en-gb/power-platform/products/power-apps/pricing
- Microsoft Power Automate pricing: https://www.microsoft.com/en-gb/power-platform/products/power-automate/pricing
- Azure Functions pricing: https://azure.microsoft.com/en-gb/pricing/details/functions/
- Azure Container Apps pricing: https://azure.microsoft.com/en-gb/pricing/details/container-apps/
- Azure AI Document Intelligence pricing: https://azure.microsoft.com/en-gb/pricing/details/document-intelligence/
- Azure Container Registry pricing: https://azure.microsoft.com/en-gb/pricing/details/container-registry/
- Azure Blob Storage pricing: https://azure.microsoft.com/en-gb/pricing/details/storage/blobs/
- Azure Key Vault pricing: https://azure.microsoft.com/en-gb/pricing/details/key-vault/
- Azure Monitor pricing: https://azure.microsoft.com/en-gb/pricing/details/monitor/

# Azure cost prediction — collisionspike

_Last updated: 2026-06-22_

This document predicts the likely monthly Microsoft/Azure cost of the `collisionspike` repository from the services currently described in the repo and the live sandbox notes.

It is an estimate, not a bill. Azure prices vary by subscription agreement, region, tax, currency conversion, reserved capacity, and exact SKU. Treat this as a working forecast to decide whether the current architecture is still cost-safe.

## Plain-English summary

`collisionspike` is not an expensive Azure architecture in its current shape. Most custom compute is serverless: it sits idle at near-zero cost and only charges when it runs. The cost risk is not the parser/enrichment/address functions; it is Power Platform licensing, Dataverse capacity growth, evidence/file storage, and any future always-on AI/search/copilot feature.

**Likely current sandbox cost:** about **£90-£140/month ex VAT** if five staff need Power Apps Premium and one automation/service user needs Power Automate Premium, plus a small amount for Azure storage/registry/monitoring.

**Likely low-volume production cost:** about **£110-£200/month ex VAT** for roughly 1,000 cases/month, assuming the existing deterministic parser remains primary and Document Intelligence is only an OCR fallback.

**Likely future cost with optional Copilot Studio enabled:** add at least **£153.80/month ex VAT** for the 25,000-credit plan, before any additional AI/model usage.

## Source basis from this repo

The repo describes the project as a Power Apps Code App + Dataverse + Power Automate + Azure Functions spike for the intake -> parse -> review -> enrich -> EVA + Box workflow.

Current live/sandbox evidence in the repo points to these Microsoft services:

| Area | Service/resource | Current cost posture |
|---|---|---|
| UI | Power Apps Code App | Per-user licensing cost. Main fixed cost. |
| Data | Dataverse | Included capacity from Power Platform licences initially; add-on risk if evidence/files/logs grow. |
| Workflow | Power Automate cloud flows | Usually licensed through Power Apps/Power Automate Premium depending flow ownership/use. Main fixed cost after Power Apps. |
| Parser | Azure Functions Flex Consumption FC1 | Near-zero idle if no Always Ready. Uses storage and monitoring. |
| Enrichment | Azure Function + DVLA/DVSA calls | Near-zero idle. External DVLA/DVSA API costs not estimated here. |
| Address matching | Azure Function + postcode.io | Near-zero idle; postcode.io is free. |
| OCR | Azure Container Apps + ACR image | Scale-to-zero compute; ACR Basic has small standing cost. |
| Document OCR fallback | Azure AI Document Intelligence F0/S0 | F0 gives 500 pages/month free; paid usage only if fallback exceeds free tier or moves to paid SKU. |
| Secrets | Key Vault | Very low at current transaction volume. |
| Evidence/blob storage | Azure Storage / Dataverse file storage | Low at small volume, but grows with photos, `.eml`, PDFs, and audit evidence. |
| Optional assistant | Copilot Studio / Copilot Credits | OFF; material fixed cost if enabled. |
| Optional heavier AI | Azure OpenAI / Foundry models | OFF or gated; usage-based, not forecast without prompts/tokens/images. |

## Pricing facts used

Checked against public Microsoft pricing pages on 2026-06-22:

- Power Apps Premium: **£15.40 per user/month**, paid yearly, ex VAT.
- Power Automate Premium: **£11.50 per user/month**, paid yearly, ex VAT.
- Copilot Studio: **£153.80/month for 25,000 Copilot Credits**, paid yearly, ex VAT.
- Azure Functions Flex Consumption includes a monthly free grant of **250,000 executions** and **100,000 GB-s** on-demand resource consumption per subscription.
- Azure Functions Consumption includes a monthly free grant of **1 million executions** and **400,000 GB-s** per subscription.
- Azure Container Apps Consumption includes **180,000 vCPU-seconds**, **360,000 GiB-seconds**, and **2 million requests** free per subscription per month, and apps with `minReplicas=0` have no usage charges while scaled to zero.
- Azure AI Document Intelligence F0 allows **0-500 pages free per month**. Document Intelligence is billed by pages analysed.
- Azure Container Registry Basic includes **10 GB** storage, with a per-day standing price.
- Azure Blob Storage charges by GB stored and operations; exact cost depends on redundancy, access tier, transaction volume, and region.
- Key Vault charges mainly by operations at low current usage; for this workload the forecast is effectively pennies unless secrets/keys are called at high frequency.

## Baseline assumptions

These assumptions are intentionally conservative enough for a small production pilot:

| Assumption | Value used |
|---|---:|
| Staff using the app | 5 users |
| Automation/service users | 1 user |
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

| Cost item | Estimate/month ex VAT | Why |
|---|---:|---|
| Power Apps Premium x5 | **£77.00** | 5 app users at £15.40/user/month. |
| Power Automate Premium x1 | **£11.50** | One automation/service owner assumption. Could be higher if every operator needs direct Power Automate Premium outside Power Apps context. |
| Azure Functions compute | **£0-£5** | Parser, enrichment, address, EVA validation, EVA Sentry are low-volume and likely inside free grants if no Always Ready is configured. |
| Function storage accounts | **£1-£10** | Each Function app needs a storage account; repo also stores evidence/blob data. Exact cost depends on GB and operations. |
| Application Insights / Log Analytics | **£0-£10** | Depends on sampling and retention. Biggest risk is verbose traces on every flow/function call. |
| Key Vault | **£0-£2** | Low transaction volume. |
| Azure Container Registry Basic | **~£3-£5** | Small standing cost for Basic tier registry holding the OCR image. |
| Azure Container Apps OCR host | **£0-£10** | Scale-to-zero and likely inside free grants at low volume; cost rises with OCR processing time. |
| Document Intelligence F0 | **£0** | F0 gives 500 free pages/month. If production OCR fallback exceeds F0, move this to the production forecast below. |
| Dataverse capacity add-ons | **£0 initially** | Premium licences include pooled Dataverse entitlement; add-on only if DB/file/log capacity exceeds tenant entitlement. |
| **Expected current subtotal** | **~£90-£120/month** | Main fixed cost is Power Platform licensing. |
| **Safety margin** | **+£20/month** | For storage/logging drift. |
| **Working current forecast** | **~£110-£140/month ex VAT** | Sensible budget line for the sandbox/pilot. |

## Monthly forecast — 1,000 cases/month production pilot

| Cost item | Estimate/month ex VAT | Notes |
|---|---:|---|
| Power Apps Premium x5 | **£77.00** | Fixed if 5 users. |
| Power Automate Premium x1-2 | **£11.50-£23.00** | Depends whether one service account owns flows or multiple users need Premium automation rights. |
| Azure Functions compute | **£0-£15** | 1,000 cases/month is still small for Functions. A bad retry loop or Always Ready setting changes this. |
| Storage: evidence, PDFs, `.eml`, images | **£2-£25** | 10-50 GB/month active evidence is usually cheap, but retention rules matter. |
| Application Insights / Log Analytics | **£5-£25** | Use sampling and retention caps. This can quietly exceed compute cost. |
| Key Vault | **£0-£3** | Low. |
| ACR Basic | **~£3-£5** | Standing registry cost. |
| Container Apps OCR | **£0-£25** | Depends on scanned-PDF/plate-OCR volume and CPU time. If only used as fallback, likely low. |
| Document Intelligence paid fallback | **£0-£30** | If only OCR misses are sent. If every page is sent through DI, cost rises by page count and model type. |
| Dataverse add-on capacity | **£0-£40** | If evidence files stay in Blob and Dataverse stores metadata, likely low. If Dataverse stores files/images directly, capacity can become material. |
| **Expected production subtotal** | **~£110-£190/month** | Assumes no Copilot, no Azure AI Search, no always-on compute. |
| **Working production forecast** | **~£110-£200/month ex VAT** | Use this as the near-term planning number. |

## Future/optional costs to keep gated

| Feature | Additional cost risk | Recommendation |
|---|---:|---|
| Copilot Studio | **+£153.80/month ex VAT** minimum for the 25k-credit plan | Keep OFF until the core intake/EVA/Box path is proven. |
| Azure AI Search | Often a material always-on monthly cost | Do not add until there is a real searchable corpus and a clear use case. |
| Azure OpenAI / Foundry vision calls | Token/image based; can grow with image count | Gate behind explicit per-case limits and logging. |
| Document Intelligence for every document | Page-count based | Keep deterministic parser primary; use DI only for scanned/failed documents. |
| Container Apps min replicas >0 | Converts OCR host from idle-safe to always-charged | Keep `minReplicas=0` unless cold start is proven unacceptable. |
| Function Always Ready | Converts Functions from near-zero idle to standing cost | Avoid unless latency matters more than cost. |
| Dataverse file/image storage | Can become a real cost with high image retention | Prefer Blob for bulky evidence, Dataverse for metadata/index/status. |
| Long log retention | Can exceed compute costs | Set retention, sampling, and per-service logging budgets. |

## Main cost levers

1. **Number of app users** — every extra Power Apps Premium user adds £15.40/month ex VAT.
2. **Flow licensing model** — if every operator also needs Power Automate Premium separately, add £11.50/user/month ex VAT.
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
| OCR/Container Apps/ACR | **£20** alert |
| Document Intelligence | **£10** alert during fallback-only testing |
| Log Analytics/Application Insights | **£10** alert |
| Total Microsoft platform pilot including licences | **£200** planning ceiling |

## Conclusion

The current Microsoft design is cost-safe for a spike/pilot if the repo keeps its present discipline:

- Power Platform licences are the main predictable cost.
- Azure Functions and Container Apps should remain close to zero at idle.
- Document Intelligence should stay fallback-only.
- Copilot Studio, Azure AI Search, and always-on compute should remain gated.
- Blob should hold bulky evidence; Dataverse should hold structured case metadata and audit state.

The practical planning number is **~£110-£200/month ex VAT** for a small production pilot with 5 users and around 1,000 cases/month, excluding existing Microsoft 365 seats, EVA, Box, Audatex, WhatsApp, external API charges, and VAT.

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

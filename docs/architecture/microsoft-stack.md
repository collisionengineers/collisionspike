# Microsoft Stack — Recommendation

> The most suitable Microsoft stack for the Collision Engineers intake workflow, grounded in
> Microsoft Learn (researched June 2026). The mature reference build (`collisioncc`) is on **Google
> Cloud**; this spike deliberately targets **Microsoft / Power Platform** to validate the workflow
> quickly and lean on Microsoft 365 (Outlook, the org's existing tenant). Requirements: see
> [intake-workflow.md](../requirements/intake-workflow.md). Integration detail & gating:
> [integrations.md](./integrations.md).

## TL;DR recommended stack

| Layer | Service | Phase |
|---|---|---|
| App shell / UI | **Power Apps Code App** (React/Vite) | 0 |
| System of record | **Microsoft Dataverse** (mirrors the existing **SharePoint** Excel job sheet) | 0–1 |
| Email intake | **Power Automate** + **Office 365 Outlook** "new email in a shared mailbox (V2)" | 1 |
| Document parsing | **`cedocumentmapper_v2.0`** (deterministic, local) → **Azure AI Document Intelligence** fallback | 1 / 3 |
| Image AI | **AI Builder** (classify overview vs damage) → **Azure AI Vision** (people/reflection + plate OCR) | 2 / 4 |
| Enrichment | **Custom connectors** → `collisionplugin` (DVSA mileage + vehicle details; valuation) | 3 |
| General AI assist | **AI Builder prompts** / **Azure OpenAI** (Azure AI Foundry) | 3–4 |
| Conversational copilot | **Copilot Studio** agent over Dataverse | 4 (optional) |
| Address normalisation | **postcode.io** now → **Azure Maps** later | 1 / later |
| Identity | **Microsoft Entra ID** (built into Power Platform) | 0 |
| Integration/gating | **Custom connectors** + **Dataverse environment variables** | 0+ |
| ALM | **Solutions** + **Power Platform Pipelines** (Dev/Test/Prod) | 0+ |
| Parser hosting (later) | **Azure Functions** / **Container Apps** wrapping the Python CLI | 4 |

## Requirement → service mapping

| Requirement (from intake workflow) | Microsoft service |
|---|---|
| Monitor 3 Outlook shared inboxes | Power Automate + Office 365 Outlook connector |
| Parse PDF/DOC/DOCX/MSG/EML | `cedocumentmapper_v2.0`; Azure AI Document Intelligence for hard cases |
| OCR / identify image content | AI Builder; Azure AI Vision (Read OCR) |
| Categorise/tag Outlook message | Power Automate "Update email / categories" |
| Case review UI, queues, missing-info | Power Apps Code App over Dataverse |
| Mileage + vehicle details | `collisionplugin` `dvsa-mot` via custom connector |
| Valuation evidence | `collisionplugin` `valuationbot` |
| Address normalisation | postcode.io (→ Azure Maps) |
| Conversational assistant | Copilot Studio |
| Submit to EVA + Box folder | Custom connector (gated) + Box connector |
| Audit + dedup | Dataverse auditing + dedup keys (Message-ID / payload hash) |

## Detail & rationale

### 1. App shell — Power Apps Code App (React/Vite)
Lets the spike **share React/TypeScript domain code and contracts** with the wider programme
rather than re-expressing logic in Power Fx, while still getting Dataverse + 1,500+ connectors and
Entra auth. **Status caveat:** the `pac` CLI still surfaces `pac code` as **"(Preview)"** — confirm
GA status and licensing before production. Requires the environment to have *Power Apps code apps*
enabled, and each user a **Power Apps Premium** licence.
Docs: <https://learn.microsoft.com/power-apps/developer/code-apps/overview>

### 2. Data — Dataverse mirroring SharePoint
The job sheet lives in **SharePoint** today. Keep SharePoint as source of record initially; **mirror
to Dataverse** (one-time Power Automate import, then Dataverse is the working store) for relational
integrity, **built-in auditing**, file/image columns, and solution ALM. Tables: `Case`, `Evidence`,
`Provider`, `AuditEvent` (align to `ccc`/`collisioncc` contracts).
Docs: <https://learn.microsoft.com/power-apps/maker/data-platform/data-platform-intro> ·
auditing <https://learn.microsoft.com/power-platform/admin/manage-dataverse-auditing>

### 3. Email intake — Power Automate (Office 365 Outlook)
One flow per shared mailbox: **"When a new email arrives in a shared mailbox (V2)"** with
**Include Attachments = Yes**; save `.eml` + attachments, classify (image vs instruction), create a
`Case`, set status, dedup by `Message-ID`. Keep orchestration in cloud flows; reserve Dataverse
plug-ins/Custom APIs for transactional validation only.
Docs: <https://learn.microsoft.com/connectors/office365/> ·
shared-mailbox trigger <https://learn.microsoft.com/troubleshoot/power-platform/power-automate/flow-run-issues/issues-triggering-emails-with-attachments-from-shared-mailbox>

### 4. Document AI — deterministic first, Azure Document Intelligence as fallback
`cedocumentmapper_v2.0` already extracts the 13 EVA fields **deterministically and for free** —
keep it as the primary path (mirrors `collisioncc`'s "deterministic first, gate the expensive
extractor" principle). Use **Azure AI Document Intelligence** (prebuilt **Read/Layout**, or a custom
neural model) only for documents the rules miss.
Docs: <https://learn.microsoft.com/azure/ai-services/document-intelligence/overview> ·
pricing <https://azure.microsoft.com/pricing/details/ai-document-intelligence/>

### 5. Image AI — AI Builder first, Azure AI Vision later
**AI Builder** (image classification / object detection) for overview-vs-damage and
registration-visible, native to Power Platform. Add **Azure AI Vision (Image Analysis 4.0)** later
for robust **people/reflection detection** and **Read OCR** of the plate (HTTP/custom connector).
Docs: AI Builder <https://learn.microsoft.com/ai-builder/get-started-with-object-detection> ·
Vision <https://learn.microsoft.com/azure/ai-services/computer-vision/overview>

### 6. Enrichment — custom connectors to `collisionplugin`
DVSA mileage (`current_mileage_estimate`) + vehicle details (`get_vehicle_summary`), and later
valuation. The connectors are **MCP-only behind an OAuth gateway** — a thin **REST wrapper**
(Azure Function) is the cleanest way to expose them to a Power Platform custom connector. See
[integrations.md](./integrations.md#enrichment-connectors-collisionplugin).
Docs: <https://learn.microsoft.com/connectors/custom-connectors/define-openapi-definition>

### 7. General AI assist — AI Builder prompts / Azure OpenAI
**AI Builder "AI prompts"** (GPT-4o-class via Power Fx / flows) for lightweight classification,
drafting, and field suggestions; **Azure OpenAI** (Azure AI Foundry) via HTTP for heavier reasoning.
Docs: <https://learn.microsoft.com/ai-builder/prompts-overview> ·
models <https://learn.microsoft.com/azure/ai-foundry/openai/concepts/models>

### 8. Address normalisation — postcode.io now, Azure Maps later
Keep **postcode.io** (free, UK) for the spike. Move to **Azure Maps Search** only if reverse
geocoding, autocomplete, or non-UK coverage is needed (~$5 / 1,000 geocodes).
Docs: <https://learn.microsoft.com/azure/azure-maps/how-to-search-for-address>

### 9. Conversational copilot — Copilot Studio
A **Collision Engineers copilot** over Dataverse knowledge for staff Q&A / guided intake. **Not a
requirement carried from `collisioncc`** — it is a spike addition; treat as optional Phase 4 and
gate it (`COPILOT_ENABLED`). **Billing is credit-based** (Sept 2025 model): prepaid **$200/mo =
25,000 Copilot Credits**, or **pay-as-you-go $0.01/credit**; a generative message = 2 credits. Light
internal use (≈2,000 interactions/mo) ≈ **$30/mo PAYG**.
Docs: <https://learn.microsoft.com/microsoft-copilot-studio/billing-licensing>

### 10. ALM & identity
Package everything (Code App, flows, connectors, tables, env vars) in a **solution**; promote
Dev→Test→Prod with **Power Platform Pipelines**; **Entra ID** handles auth throughout.
Docs: <https://learn.microsoft.com/power-platform/alm/overview-alm> ·
pipelines <https://learn.microsoft.com/power-platform/alm/pipelines>

## Indicative monthly cost (≈1,000 cases/mo, 5 staff)

> Excludes external/contract costs (Microsoft 365 seats, Box, EVA, Audatex, WhatsApp). AI usage
> assumes deterministic parsing handles most documents, so paid AI is a fallback.

| Item | Basis | ~Cost/mo |
|---|---|---|
| Power Apps Premium × 5 | ~$20/user | $100 |
| Power Automate (per-user, if not in-app) | ~$15/user, 1–2 users | $15–30 |
| Dataverse capacity (DB/file/log add-ons) | tiered | $40–60 |
| Azure AI Document Intelligence | **Read ~$1.50 / 1,000 pages** (≈5,000 pages → ~$7.50); custom neural ~$30/1,000 if used | $8–150 |
| Azure AI Vision (Phase 4) | ~$1 / 1,000 transactions (≈8,000 images) | ~$8 |
| AI Builder | credits included with Premium (overage rare) | ~$0 |
| Azure OpenAI / AI prompts | token-based, light | $10–50 |
| Copilot Studio (optional) | PAYG light use | $0–30 |
| postcode.io | free | $0 |
| **Platform + AI subtotal** | | **≈ $190–440** |

> **Cost correction:** an earlier draft mis-stated Document Intelligence as *$0.50 per page* (→
> $1,250/mo). Azure prices it **per 1,000 pages** (Read ≈ $1.50; prebuilt ≈ $10; custom ≈ $30),
> i.e. **~1000× lower**. Always verify against the live pricing page.

**vs. the Google baseline** (`collisioncc/docs/pricing_guide/`): ~$40–95/mo infra + similar AI at
1,000 cases/mo. The Microsoft delta is dominated by **Power Platform per-user licensing**, which the
org's existing **Microsoft 365** footprint may partly offset.

## Open decisions & risks

1. **Code Apps maturity/licensing** — `pac` labels `code` "Preview"; confirm GA + Premium licensing
   and that the target environment has code apps enabled.
2. **Enrichment integration shape** — REST wrapper (recommended) vs OAuth-gateway custom connector
   (see [integrations.md](./integrations.md)).
3. **PyMuPDF AGPL** in `cedocumentmapper_v2.0` — resolve before any closed-source distribution.
4. **Copilot Studio inclusion** — confirm it's wanted for the spike vs deferred; it is not a
   `collisioncc` requirement.
5. **Environment & Azure subscription** — needs a Power Platform environment with Dataverse +
   AI Builder capacity, and an Azure subscription for Document Intelligence / Vision / Functions.

## Primary Microsoft Learn references

- Code Apps — <https://learn.microsoft.com/power-apps/developer/code-apps/overview>
- Dataverse — <https://learn.microsoft.com/power-apps/maker/data-platform/data-platform-intro>
- Office 365 Outlook connector — <https://learn.microsoft.com/connectors/office365/>
- Custom connectors — <https://learn.microsoft.com/connectors/custom-connectors/define-openapi-definition>
- Environment variables — <https://learn.microsoft.com/power-apps/maker/data-platform/environmentvariables>
- ALM / Pipelines — <https://learn.microsoft.com/power-platform/alm/overview-alm>
- AI Builder — <https://learn.microsoft.com/ai-builder/overview>
- Azure AI Vision — <https://learn.microsoft.com/azure/ai-services/computer-vision/overview>
- Azure AI Document Intelligence — <https://learn.microsoft.com/azure/ai-services/document-intelligence/overview>
- Copilot Studio billing — <https://learn.microsoft.com/microsoft-copilot-studio/billing-licensing>
- Azure Maps Search — <https://learn.microsoft.com/azure/azure-maps/how-to-search-for-address>
- Power Platform licensing FAQ — <https://learn.microsoft.com/power-platform/admin/powerapps-flow-licensing-faq>

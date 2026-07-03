# Microsoft Stack — Recommendation (SUPERSEDED — retained as historical platform-selection rationale)

> ## ⚠️ SUPERSEDED — the live stack is Azure PaaS, not Power Platform
> This document is the **original (June 2026) platform-selection rationale** that recommended a **Power
> Platform** stack (Power Apps Code App + Dataverse + Power Automate). **That stack was built, then
> migrated to an Azure PaaS stack and decommissioned.** The recommendation content below is **historical**;
> it is kept for provenance and to explain *why* the spike started on Microsoft. **For what is actually
> live, read [live-environment.md](./live-environment.md)** (canonical registry) and
> [`migration/`](../../migration/) (the migration rationale + reversible build). The **domain content**
> here — the EVA 12-field contract, photo-order / image rules, provider corpus, deterministic-parse-first
> principle — **remains valid**; only the platform mechanism changed.
>
> ### Live Azure stack (2026-06) — what replaced each Power Platform layer
> | Layer | Power Platform (was) | **Azure PaaS (LIVE)** |
> |---|---|---|
> | App shell / UI | Power Apps Code App (React/Vite) | **Static Web App `cespk-spa-dev`** — same React/Vite app from `mockup-app/`, **MSAL/Entra** sign-in, REST to the API |
> | System of record | Microsoft Dataverse | **PostgreSQL Flexible Server `cespk-pg-dev`** (v16, db `collisionspike`, 36 tables) |
> | Data / business API | Dataverse + Power Fx | **Data API Function App `cespk-api-dev`** (Node 20 / TS Functions v4; validates Entra JWT, app roles `CollisionSpike.User/.Superuser` — Superuser formerly `.Admin`) |
> | Email intake + orchestration | Power Automate cloud flows | **Orchestration Function App `cespk-orch-dev`** (Microsoft Graph **PUSH** change-notification subscriptions over Exchange-RBAC mailboxes — **NOT delta-poll**; **LIVE** on info@ + engineers@ + desk@) |
> | Identity | Entra ID (in Power Platform) | **Entra ID workforce** (MSAL in SPA, JWT-validated by the API) |
> | Integration / gating | custom connectors + Dataverse env-vars | **direct Function calls** (function key / MI) + **app-settings** gates |
> | Document parse · enrichment · OCR · EVA · Box | Azure Functions behind connectors | **same 6 Python Functions, retained**, called directly by API / orchestration |
> | Subscription | Power Platform licensing | **Azure Free Trial** `e6076573-…` — **must upgrade to PAYG within ~30 days or the whole stack is disabled** |

> **⚠️ Pricing update (2026-06-18) — see [docs/research/](../research/) for current figures.** One
> licensing fact changed since this was first costed: **AI Builder credits retire 2026-11-01**
> (seeded Premium credits removed, add-on purchase closed, usage shifts to Copilot Credits) — so
> "AI Builder ≈ $0" no longer holds. This is M2/M3+ and gated off, so it doesn't affect the
> M1 ≈£0-idle posture — but the figures below predate the change. The address-matching and OCR paths
> stay free (postcode.io; Document Intelligence Read at 500 free pages/mo).

> The most suitable Microsoft stack for the Collision Engineers intake workflow, grounded in
> Microsoft Learn (researched June 2026). The mature reference build (`collisioncc`) is on **Google
> Cloud**; this spike deliberately targets **Microsoft / Power Platform** to validate the workflow
> quickly and lean on Microsoft 365 (Outlook, the org's existing tenant). Requirements: see
> [intake-workflow.md](../requirements/intake-workflow.md). Integration detail & gating:
> [integrations.md](./integrations.md).

---

> **HISTORICAL from here down.** Everything below is the **original Power Platform recommendation and
> costing** (June 2026). It has been **superseded** by the Azure PaaS stack (see the banner at the top).
> Read it as the *why we started on Microsoft / Power Platform* record, not as current guidance. Domain
> facts (EVA contract, image rules, deterministic-parse-first, provider corpus) remain valid.

## TL;DR recommended stack *(historical — Power Platform)*

| Layer | Service | Phase |
|---|---|---|
| App shell / UI | **Power Apps Code App** (React/Vite) | 0 |
| System of record | **Microsoft Dataverse** (mirrors the existing **SharePoint** Excel job sheet) | 0–1 |
| Email intake | **Power Automate** + **Office 365 Outlook** "new email in a shared mailbox (V2)" | 1 |
| Document parsing | **`cedocumentmapper_v2.0`** (deterministic, local) → **Azure AI Document Intelligence** fallback | 1 / 3 |
| Image AI | **AI Builder** (classify overview vs damage) → **Azure AI Vision** (people/reflection + plate OCR) | 2 / 4 |
| Enrichment | **Azure Function** (`cespkenrich-fn-gi62sd`) → DVSA + DVLA directly via Entra `client_credentials` + X-API-Key → **custom connector** (no gateway; M1) | 1 |
| General AI assist | **AI Builder prompts** / **Azure OpenAI** (Azure AI Foundry) | 3–4 |
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
| Mileage + vehicle details | **Azure Function** (`cespkenrich-fn-gi62sd`) → DVSA + DVLA directly via Entra `client_credentials` + X-API-Key, exposed as a custom connector (M1; no `collisionplugin` gateway) |
| Valuation evidence | `collisionplugin` `valuationbot` (prior-art, deferred — M3 / `VALUATION_ENABLED`, gated off) |
| Address normalisation | postcode.io (→ Azure Maps) |
| Submit to EVA + Box folder | EVA custom connector (gated) + **custom Box REST connector** `cr1bd_box_rest` (CCG service identity; ADR-0012, gated off) |
| Audit + dedup | Dataverse auditing + dedup keys (Message-ID / payload hash) |

## Detail & rationale

### 1. App shell — Power Apps Code App (React/Vite)
Lets the spike **share React/TypeScript domain code and contracts** with the wider programme
rather than re-expressing logic in Power Fx, while still getting Dataverse + 1,500+ connectors and
Entra auth. **Status caveat:** the `pac` CLI still surfaces `pac code` as **"(Preview)"** — confirm
GA status and licensing before production. Requires the environment to have *Power Apps code apps*
enabled, and each user a **Power Apps Premium** licence.

> **CSP constraint:** the deployed Code App player enforces `Content-Security-Policy:
> connect-src 'none'`. All calls to external services must go through **Power Platform connectors**
> (SDK) — a raw `fetch()` to an external URL is blocked. Power Automate cloud flow HTTP actions are
> exempt (server-side).

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
`cedocumentmapper_v2.0` already extracts the 12 EVA fields **deterministically and for free** —
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

> **Learn check (important, June 2026):** **Azure Custom Vision** *and* **Image Analysis 4.0**
> (incl. its custom-model and people-detection features) are on Microsoft's **retirement path —
> supported only until 2028-09-25** (<https://learn.microsoft.com/azure/ai-services/computer-vision/overview>,
> <https://learn.microsoft.com/azure/ai-services/custom-vision-service/overview>). Do **not** build
> new work on Custom Vision. Durable choices: **AI Builder image classification** (native, current)
> for overview-vs-damage; **Azure Document Intelligence Read** (or bundled **Tesseract**) for **plate
> OCR**; an **Azure OpenAI / Foundry vision model (GPT-4o-class)** for **person/reflection detection**
> (and as a flexible one-call classifier). Treat Vision 4.0 people/Read as usable-now-but-sunsetting.

> **Decided (ADR-0009):** **M1** = **OCR for registration matching only** (Tesseract / Doc-Intelligence
> Read); **M2** = **AI Builder classification** (overview/damage) + **Foundry vision** (person/
> reflection). Custom Vision not used.

### 6. Enrichment — Azure Function → DVSA/DVLA directly (M1)
DVSA mileage (`current_mileage_estimate`) + vehicle details (`get_vehicle_summary`), and later
valuation. **M1 implementation:** Azure Function `cespkenrich-fn-gi62sd` authenticates **directly
to DVSA + DVLA via Entra `client_credentials` + X-API-Key** (no Cloud Run OAuth-gateway hop) and
exposes plain REST → custom connector for Power Automate. The prior-art Cloud Run gateway path is a
retired fallback, not in M1. See [integrations.md](./integrations.md#enrichment-connectors).
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

### 9. ALM & identity
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
2. **Enrichment integration shape** — ~~REST wrapper (recommended) vs OAuth-gateway custom connector~~
   **Resolved (M1):** Azure Function calls DVSA + DVLA directly via Entra; no gateway. See
   [integrations.md](./integrations.md#enrichment-connectors).
3. **PyMuPDF AGPL** in `cedocumentmapper_v2.0` — ~~resolve before any closed-source distribution~~
   **Resolved:** licensed (AGPL concern closed); no blocker.
4. **Environment & Azure subscription** — needs a Power Platform environment with Dataverse +
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
- Azure Maps Search — <https://learn.microsoft.com/azure/azure-maps/how-to-search-for-address>
- Power Platform licensing FAQ — <https://learn.microsoft.com/power-platform/admin/powerapps-flow-licensing-faq>

# 00 — Current Architecture Baseline & Refactor Surface

> **Purpose.** This is the grounding document for the whole `refactor-research/` set. Every
> migration-target folder (`01`–`09`) references the portability verdicts established here rather
> than re-deriving them. Findings are sourced from a direct read of this repository on
> **2026-06-25** (two read-only code scouts over `mockup-app/`, `functions/`, `flows/`, `dataverse/`).
>
> **Scope assumption (from the operator):** small team (~3–10 intake staff, low-hundreds of
> cases/month, plan for ~2–3× growth); a **full greenfield re-platform is acceptable**; drivers are
> **cost/licensing, vendor lock-in, and capability/control**.

---

## 1. What we run today

| Layer | Technology | Where in repo |
|---|---|---|
| **UI** | Power Apps **Code App** — React 18 + Vite + TypeScript, Fluent UI v9, React Router v6 | `mockup-app/` |
| **System of record** | Microsoft **Dataverse** (10 tables) | `dataverse/schema/` |
| **Orchestration** | **Power Automate** — 15 cloud flows | `flows/definitions/` |
| **Compute** | **6 Azure Functions** (Python v2): parser, enrichment, evasentry, evavalidation, box-webhook, location-suggest | `functions/` |
| **Parser engine** | Vendored `cedocumentmapper_v2` (pure Python, PyMuPDF) | `functions/*/cedocumentmapper_v2/` |
| **Secrets / identity** | Azure **Key Vault** + **Entra** app registration | (live env) |
| **Integrations** | EVA Sentry API, DVSA/DVLA, Box, postcode.io, (Azure Maps, gated) | `functions/`, custom connectors |
| **Custom connectors** | `cr1bd_*` parser / enrichment / EVA / Box-REST / OCR / location-assist | `flows/connection-references.json` |

The app is **live in the `Collision Engineers - Dev` sandbox** with most integrations
**feature-gated off** behind `*_ENABLED` Dataverse environment variables.

---

## 2. Portability verdict by component

This is the core finding: **Power Platform is a data + orchestration layer here, not woven into the
business logic.** The domain logic, contracts, and compute are already platform-neutral. Lock-in is
concentrated in two places: **Dataverse** (system of record) and the **Power Automate flows** that
read/write it.

| Component | Files | Verdict | Migration cost |
|---|---|---|---|
| **React UI — screens, components, theme** | ~30 files, ~5k LOC | ✅ **Portable as-is** | 0 — no SDK imports |
| **Domain logic** (`src/domain/`: classification, dedup, provider-match, address-policy) | 4 files | ✅ **Portable as-is** | 0 — pure functions |
| **Contracts** (`src/contracts/`: case-status, eva-export, image-rules) | 6 files | ✅ **Portable as-is** | 0 — pure |
| **Data-access seam** (`src/data/types.ts` `DataAccess` iface, `adapter.ts`, `mock-source.ts`, `hooks.ts`) | ~5 files | ✅ **Portable** (Dataverse-shaped, keep) | minor |
| **Dataverse impl** (`src/data/dataverse-source.ts`, `generated-services.ts`, `src/generated/*`) | ~20 files, ~3.6k LOC | 🔴 **Rewrite** → REST client | ~3–5 days |
| **SDK bootstrap** (`PowerProvider.tsx`, `main.tsx`, `vite.config.ts` plugin) | 3 files, ~180 LOC | 🔴 **Rewrite/remove** | ~1 day |
| **6 Azure Functions** (Python) | `functions/` | ✅ **Portable** → Lambda/Cloud Run | ~1 week (≈50-line handler adapter each) |
| **Vendored parser engine** (`cedocumentmapper_v2`) | pure Python | ✅ **Portable as-is** | 0 |
| **External-API integrations** (EVA, DVSA, DVLA, Box, postcode.io) | inside Functions | ✅ **Portable as-is** | 0 — REST + standard auth |
| **Dataverse schema** (10 tables, choice-sets, relationships, env-vars) | `dataverse/schema/*.json` | ✅ **~80% portable** → SQL DDL | ~4–6 weeks (schema easy; *logic* rewrite is the cost) |
| **15 Power Automate flows** | `flows/definitions/*.json` | 🔴 **Rewrite** → Step Functions / Logic Apps / queue-worker | ~7–10 weeks |
| **Outlook shared-mailbox intake trigger** | `intake.definition.json` | ⚠️ **Replace** → SES/Gmail/Postmark/Graph webhook | ~1–2 weeks |
| **Feature gates** (~20 `*_ENABLED` env-vars in Dataverse) | `dataverse/environment-variables.json` | ✅ **~90% portable** → config service | ~1 week |

### The two lock-in anchors

1. **Dataverse as system of record.** Every flow has 10–40 Dataverse operations
   (`CreateRecord`/`ListRecords`/`UpdateRecord`), the case **status state machine** is a choice-set,
   the **dedup** is a unique alternate-key on `cr1bd_sourcemessageid`, and the **20 feature gates**
   are env-var reads. Replacing Dataverse means re-implementing all of this in SQL/NoSQL +
   application code. **Estimated ~30–40% of total migration effort.**
2. **Power Automate flows.** 15 definitions (~375+ Dataverse operations in total) plus the
   Outlook trigger. Mechanical but tedious to re-express; this is the largest single line-item.

### What is genuinely *free* to move

- The **front-end is ~65–70% portable** with zero changes thanks to a clean `DataAccess` interface
  + selector pattern (screens import from `../data`, never touch the SDK). Only the data-layer
  implementation (~4–5 files) is rewritten.
- The **Functions are 100% portable** — none import the Dataverse SDK; all external calls use
  `httpx`. The vendored parser engine is pure Python.
- All **integration endpoints are plain REST** with standard auth (JWT / client-credentials /
  API-key), already isolated inside the Functions.

---

## 3. Headline effort estimate (full greenfield port, any non-Power-Platform target)

| Workstream | Effort |
|---|---|
| Port 6 Azure Functions | ~1 week |
| Replace Dataverse (schema + data + ORM) | ~4–6 weeks |
| Rewrite 15 flows → orchestration of choice | ~6–8 weeks |
| Replace Outlook intake | ~1–2 weeks |
| Rewrite Code App data layer | ~2–3 weeks (UI untouched) |
| Test + deploy | ~2–3 weeks |
| **Total** | **~16–23 weeks (≈4–5.5 months), one engineer** |

Critical path is the **Dataverse replacement + flow rewrite**. Function ports and the Code App data
layer can run in parallel to shave 1–2 weeks. This effort number is **roughly constant across cloud
targets** — the differentiator between targets is **run-cost, lock-in, and managed-service
ergonomics**, not the rewrite size. That is why the per-target folders focus on cost + lock-in.

---

## 4. Cross-cutting compliance note (applies to every target)

Domain is **UK vehicle-damage / insurance case intake** (vehicle regs, MOT/DVSA, valuation, claimant
PII). This makes **UK/EU data residency** a real selection constraint:

- Pick a region in **UK or EU** for any database/storage/compute that holds case PII (e.g. Azure UK
  South, AWS `eu-west-2` London, GCP `europe-west2` London, Supabase EU/London, Hetzner DE/FI).
- **UK GDPR** applies; processor agreements / DPAs and sub-processor lists matter when choosing a
  US-headquartered SaaS (Supabase, Cloudflare, Fly, Render, Railway, Retool) — confirm an EU/UK
  region option and an executable DPA.
- This consideration is **scored in each target folder**, not repeated in full.

---

## 5. How to read the rest of this folder

| Folder | Target |
|---|---|
| `01-powerapps-to-azure/` | Stay on Azure, drop Power Platform (Static Web Apps/Container Apps + Functions + Azure SQL/Postgres + Logic Apps) |
| `02-desktop-app-hosted-backend/` | Thick desktop client (Electron/Tauri/pywebview) + thin hosted backend |
| `03-migration-to-aws/` | S3/CloudFront + Lambda + RDS/Aurora + Step Functions + Cognito + SES |
| `04-migration-to-google-cloud/` | Cloud Run + Firestore/Cloud SQL + Cloud Functions + Identity Platform |
| `05-supabase/` | Managed Postgres + Auth + Storage + Edge Functions |
| `06-cloudflare/` | Workers + D1 + R2 + Pages + Queues |
| `07-vps-self-hosted/` | Single VPS (Hetzner/DigitalOcean) running Postgres + containers |
| `08-paas-fly-render-railway/` | App-platform PaaS (Fly.io / Render / Railway) |
| `09-other-setups-nocode-hybrid/` | Low-code (Retool/Budibase/Appsmith), BaaS (Appwrite/Firebase), hybrid keep-Dataverse, serverless-Postgres (Neon/PlanetScale) |
| `README.md` (this folder's parent) | Executive summary, the **cost matrix**, and the ranked recommendation |

> Cost figures and citations in folders `01`–`09` and the parent `README.md` come from the
> `deep-research` web-research pass (primary pricing sources). This baseline doc carries the
> **codebase facts only**.

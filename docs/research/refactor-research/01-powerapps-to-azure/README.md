# 01 — Power Platform → Pure Azure (PaaS)

> **One-line verdict.** The **lowest-friction, high-value** move: keeps the 6 Azure Functions
> *as-is* (zero port), drops the per-seat Power Platform licensing for a near-flat consumption bill
> (**~$21–34/mo cheapest-sane**, ~$89/mo robust), and replaces Dataverse with **standard PostgreSQL**
> (portable). Stays on Microsoft infra, but escapes Power Platform's per-user licensing, CSP/connector
> limits, and Dataverse lock-in.
>
> Pricing confidence: **Microsoft licensing + Azure SWA/Functions/Logic Apps figures are
> 3-vote-verified**; the database/auth/supporting figures are **fetched live from the Azure Retail
> Prices API (UK South, 25 Jun 2026)** — published list rates, monthly totals are arithmetic.

See [`00-current-architecture-baseline`](../00-current-architecture-baseline/README.md) for the
component portability findings this builds on.

---

## The stack

| Layer | Today (Power Platform) | Azure PaaS target |
|---|---|---|
| UI | Power Apps Code App | **Azure Static Web Apps** (React SPA, unchanged code minus the SDK seam) |
| Compute | 6 Azure Functions | **Azure Functions** — *unchanged, already deployed* |
| Data | Dataverse | **Azure Database for PostgreSQL — Flexible Server** (or Azure SQL Serverless) |
| Orchestration | 15 Power Automate flows | **Azure Logic Apps (Consumption)** or Functions/Durable Functions |
| Auth | Entra (via Power Platform) | **Entra** (workforce tenant for staff = free; External ID for any external users) |
| Secrets | Key Vault | **Key Vault** — *unchanged* |
| Files | Box | **Box** — *unchanged* |

---

## Monthly run-cost (UK South, ~3–10 staff, low-hundreds cases/mo)

| Component | Cheapest sane | Robust | Source / note |
|---|---|---|---|
| SPA hosting (Static Web Apps) | $0 (Free) – **$9** (Standard) | $9 | ✅ verified; `$9/app/mo`, 100 GB bw incl. |
| Functions (Consumption) | **~$0** | ~$5 | ✅ verified; free grant 1M exec + 400k GB-s |
| Orchestration (Logic Apps Consumption) | **~$5–15** | ~$15 | ✅ verified; Standard floor is ~$175/mo — avoid unless VNet needed |
| **Database** (Postgres Flexible **B1ms**, 32 GB, always-on) | **~$18** | B2s **~$60** | Retail API: B1ms $0.019/hr, B2s $0.076/hr, storage $0.133/GB-mo |
| *(alt: Azure SQL Serverless auto-pause if app truly idles)* | ~$5 (storage-only when paused) | ~$64 (~3 h/day) | Retail API: $0.652/vCore-hr; punishing if never idles (~$476 always-on) |
| Auth (Entra External ID) | **$0** | $0 | First 50k MAU free; staff on workforce tenant aren't billed |
| Supporting (Key Vault + App Insights + Storage acct) | ~$1–5 | ~$5 | < $1 KV, 5 GB/mo App Insights free, $0.019/GB blob |
| **TOTAL** | **~$21–34/mo** | **~$89/mo** | Flat regardless of headcount |

**Versus Power Platform today:** Power Apps Premium is **$20/user/month** and **code apps *require*
Premium for every end user** (the $12 tier needs a 2,000-seat minimum you can't meet). That's
**~$100/mo at 5 staff, ~$200/mo at 10 staff in seats alone**, before Power Automate licensing
(Premium $15/user/mo or per-flow Process capacity) and Dataverse overage ($40/GB DB, $2/GB file,
$10/GB log). **Azure replaces a headcount-scaling per-user license with a near-flat consumption
bill** — the crossover favours Azure immediately at this scale and widens with growth.

---

## Billing model

Pure **consumption / pay-as-you-go**. No per-user licensing. The only fixed monthly element is the
always-on database (~$18 B1ms) and the optional $9 Static Web Apps Standard plan. Everything else
scales from ~$0 with free grants and scale-to-zero. **The bill does not grow when you add staff.**

## What you'd rebuild

- **Functions: nothing.** All 6 already run on Azure Functions Consumption — this is the single
  biggest reason Azure PaaS is the cheapest *effort* target. The vendored parser engine is untouched.
- **UI:** rewrite the `src/data/` Dataverse implementation (~4–5 files) to call your own REST API
  instead of the Power Apps SDK; remove `PowerProvider`/`vite.config.ts` plugin. The ~65–70% of the
  React app behind the `DataAccess` seam is untouched. ~1 week.
- **Dataverse → Postgres:** translate the 10-table schema (already JSON in `dataverse/schema/`) to
  DDL; re-implement the status state-machine, dedup unique-key, audit log, and feature-gates as app
  logic + config. ~4–6 weeks (the schema is easy; the *logic* is the cost).
- **15 flows → Logic Apps Consumption** (closest 1:1; keeps a visual designer) or Durable Functions.
  **The Outlook shared-mailbox intake trigger is near lift-and-shift** — Logic Apps offers the *same*
  Office 365 Outlook connector (`When a new email arrives (V3)`) Power Automate uses today, so the
  front door of the pipeline barely changes. (Alternatively, read via Microsoft Graph from a Function
  with managed identity.) This is a genuine Azure advantage — see
  [10-outlook-m365-integration](../10-outlook-m365-integration/README.md). ~6–8 weeks.

## Vendor lock-in profile — **MEDIUM** (down from HIGH on Power Platform)

| Element | Lock-in | Why |
|---|---|---|
| PostgreSQL Flexible Server | **Low** | Stock Postgres — `pg_dump` to any host/cloud |
| Functions (Python) | Low–Medium | Handlers port; only triggers/bindings are Azure-shaped |
| React SPA | Low | Static assets, any CDN |
| Logic Apps | Medium | Workflow definitions are Azure-specific (but no per-user licensing) |
| Entra | Medium | Identity model is Microsoft, but standard OIDC/SAML |

The key win over today: **Dataverse (high lock-in) → portable Postgres**, and **no Power Platform
licensing**. You remain an Azure tenant, but on portable, industry-standard primitives.

## UK/EU data residency

✅ Strong. **UK South (London) + UK West (Cardiff)** regions; DB, Storage, Key Vault, Functions all
store data at rest in the UK. **Correction to a common claim:** Entra "Go-Local" single-country
pinning is AU/JP-only, **but** EMEA-located Entra tenants store directory data in European
datacentres by default (EU Data Boundary for EU customers). Application/case data is UK-resident;
identity directory data is EMEA/Europe-resident (not UK-pinned). Acceptable for UK GDPR with
Microsoft's DPA + UK SCCs.

## Pros / Cons

**Pros:** lowest migration effort (Functions stay **and** the Outlook intake trigger is the same
connector — the two most Microsoft-flavoured pieces both carry over); biggest cost drop vs today for
least risk; portable Postgres; keeps Microsoft tooling/identity the team knows; strong UK residency.
**Cons:** still a Microsoft tenant (only a partial answer to "reduce MS lock-in"); Logic Apps is
Azure-specific; you now own the DB/security/audit logic Dataverse gave for free.

## Sources

- Power Apps pricing (Premium $20, code apps require Premium) — https://www.microsoft.com/en-us/power-platform/products/power-apps/pricing · https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview
- Dataverse capacity/overage — https://learn.microsoft.com/en-us/power-platform/admin/capacity-storage · https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq
- Static Web Apps $9 — https://azure.microsoft.com/en-us/pricing/details/app-service/static/
- Functions free grant — https://azure.microsoft.com/en-us/pricing/details/functions/
- Logic Apps Consumption vs Standard — https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-pricing
- Postgres Flexible Server / SQL Serverless / Cosmos — Azure Retail Prices API (uksouth) · https://azure.microsoft.com/en-us/pricing/details/postgresql/flexible-server/ · https://azure.microsoft.com/en-us/pricing/details/azure-sql-database/single/
- Entra External ID (50k free MAU, $0.03/MAU) — https://azure.microsoft.com/en-us/pricing/details/microsoft-entra-external-id/ · residency https://learn.microsoft.com/en-us/entra/fundamentals/data-residency

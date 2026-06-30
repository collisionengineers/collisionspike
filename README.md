# collisionspike

A fast, early **spike** of the Collision Engineers case-intake workflow. It prototypes the
intake → parse → review → enrich → **EVA** + **Box** pipeline cheaply, to validate the workflow and
de-risk the mature cloud build (`collisioncc`, which is on Google Cloud).

The **live build is an Azure PaaS stack** — a React/Vite **Static Web App** (MSAL / Entra workforce
sign-in) over a **TypeScript Azure Functions** Data API backed by a **Postgres Flexible Server** system
of record, plus six retained Python Functions (parser, enrichment, EVA Sentry, EVA-validation, OCR,
box-webhook). It began on the **Microsoft Power Platform** (Power Apps **Code App** + Dataverse + Power
Automate + custom connectors); that implementation has since been **migrated off to Azure** and its Power
Platform footprint **deprovisioned 2026-06-27** (the Dev sandbox + both solutions + Code App + connectors +
the remaining flow deleted via `pac admin delete`). The **domain + workflow are unchanged** — only the
platform mechanism moved.

> **Status (2026-06-29):** the **live system is the Azure PaaS stack** in resource group
> `rg-collisionspike-dev` (uksouth): the **SPA `cespk-spa-dev`** (Static Web App, Entra / MSAL sign-in),
> the **Data API `cespk-api-dev`** (Node 20 / TS Functions, JWT + `CollisionSpike.User` / `.Superuser`
> app roles — `.Superuser` is the full-privilege role formerly named `.Admin`; a `.Engineer` placeholder is
> defined but not yet enforced), and **Postgres `cespk-pg-dev`** (36 tables; the provider / repairer / image-source /
> inspection-address corpus seeded; `case_`=0). The **six Python Functions, the Key Vaults, and the
> evidence Blob `cespkevidstdev01` are retained unchanged**. The earlier **Power Platform** build (Code
> App + Dataverse + ~16 Power Automate flows + custom connectors) is **migrated off to Azure and
> deprovisioned 2026-06-27** (the Dev sandbox deleted via `pac admin delete`; `CollisionSpike.zip`
> cold-exported off-repo). **No mock data** — the app shows real rows only.
>
> **Honest gaps:** **(1)** *email intake is LIVE on the production mailbox set* — `cespk-orch-dev` runs
> **Microsoft Graph PUSH change-notification subscriptions** over **info@ + engineers@ + desk@** (all
> Exchange-RBAC-scoped; the 2026-06-29 mailbox cutover added info@ + desk@ and removed the test/dev mailbox
> digital@); transport is **push, not delta-poll**. ✅ The earlier subscription-expiry time-bomb is **RESOLVED** —
> a Durable eternal orchestration (`subscriptionMonitorOrchestrator`) keeps the subscriptions renewed (a
> durable timer wakes the scale-to-zero app); operator watch-item = confirm an unattended renew at the next
> wake ([docs/gated.md](./docs/gated.md)). Subscription state: the live registry [docs/architecture/live-environment.md](./docs/architecture/live-environment.md).
> **(2)** the earlier **DB-credential / RLS P0 is resolved (2026-06-26)** — the API now
> connects as the non-owner Postgres login **`cespk_app`** (Key Vault-referenced password, **Row-Level
> Security enforced**), not `csadmin`; the **other plaintext secret exposures (Graph client secret, storage
> keys, Document Intelligence key, function keys) were also remediated 2026-06-27** — all moved to Key Vault
> references / identity-based / keyless auth. **(3)** the
> subscription is an **Azure Free Trial** — the whole stack **disables at ~30 days** unless upgraded to
> **Pay-As-You-Go** (the 12-month free Postgres allowance survives the upgrade). **(4)** **staff app-role
> assignment is incomplete** (one principal assigned; others 403 until assigned).
> **→ See [CURRENT_STATUS.md](./CURRENT_STATUS.md) (where we are) and [ROADMAP.md](./ROADMAP.md) (the checklist).**
> Run `node verify-all.mjs` for the offline gate; deploy/activation sequence in [docs/azure/deploy.md](./docs/azure/deploy.md).

## What it does (target)

Monitor three Outlook shared inboxes → parse instruction documents (PDF/DOC/DOCX/MSG/EML) and
classify images → tag the email → surface a **Case** for human review → when required fields and
images are present, export to **EVA** and archive to **Box** → chase missing info otherwise → audit
and de-duplicate every action. Full pipeline: [docs/requirements/intake-workflow.md](./docs/requirements/intake-workflow.md).

## Start here

- **Plan:** [PLAN.md](./docs/HISTORICAL/PLAN.md) — phased implementation.
- **Microsoft stack:** [docs/architecture/microsoft-stack.md](./docs/architecture/microsoft-stack.md) — the recommended services, costing, and citations.
- **Ecosystem:** [docs/architecture/repo-constellation.md](./docs/architecture/repo-constellation.md) — how this repo relates to `ccc`, `collisioncc`, `collisionplugin`, and `cedocumentmapper_v2.0`.
- **Docs index:** [docs/README.md](./docs/README.md).
- **Agent guidance:** [CLAUDE.md](./CLAUDE.md).

## What's in the repo

Offline-verifiable: `node verify-all.mjs` → **all gates green** (build + tests, schema parity, flow
linter, a pytest loop over every built Function suite, plus the static boundary gates). The gate set has
widened over time — use "all gates green", not a pinned count; the live breakdown is in
[CURRENT_STATUS.md](./CURRENT_STATUS.md) and the live registry
[docs/architecture/live-environment.md](./docs/architecture/live-environment.md).

**Deploy:** [docs/azure/deploy.md](./docs/azure/deploy.md) · **Phase-1 plan:** [docs/plans/phase-1-intake-and-case-tracking/phase-1-intake-and-case-tracking-implementation.md](./docs/plans/phase-1-intake-and-case-tracking/phase-1-intake-and-case-tracking-implementation.md).

The **live Azure stack**:
- `mockup-app/` — the React + Vite SPA (Fluent v9), wired to the Data API over REST
  (`src/data/rest-client.ts`) with MSAL / Entra sign-in: `src/contracts/` (EVA / status / image),
  `src/domain/` (classification, ADR-0010 dedup, provider-match, address-policy), `src/data/` (the data
  seam), screens.
- `api/` — the TypeScript Azure Functions **Data API** (Entra JWT + `CollisionSpike.User` / `.Superuser`
  app roles — `.Superuser` formerly `.Admin`, with the legacy name still accepted for back-compat; Postgres);
  bundled to `deploy/api/` via esbuild.
- `orchestration/` — the intake orchestration Functions app (Microsoft Graph **PUSH change-notification**
  design; email intake **live** over the production mailbox set info@ + engineers@ + desk@ —
  function/subscription counts in the [live registry](./docs/architecture/live-environment.md)); bundled to
  `deploy/orch/`.
- `packages/domain/` — the shared `@cs/domain` package (the platform-independent domain model).
- `functions/` (+ `ocr/`) — the six retained Python Azure Functions (`parser`, `enrichment`,
  `evasentry`, `evavalidation`, `box-webhook`, `ocr`): code, Bicep, OpenAPI, mocked pytest.

**Prior-era — Power Platform (migrated off to Azure and deprovisioned 2026-06-27; these definitions are retained in-repo for provenance + migration reference):**
- `dataverse/` — Dataverse schema-as-code (tables + provenance, choice sets, env-vars, relationships).
- `flows/` — the Power Automate flow definitions + offline linter.
- `.claude/skills/power-automate-flow/` — reusable flow-authoring patterns.

## Relationship to the other repos

`collisionspike` is the build target. **`collisioncc`, `ccc`, `collisionplugin`, and
`cedocumentmapper(_v2.0)` are reference / background / context** — see the
[constellation map](./docs/architecture/repo-constellation.md). Do not modify sibling repos from here.

## Tooling

- **Node.js + TypeScript** drive the live stack (the SPA, the Data API, orchestration, and `@cs/domain`);
  **Azure Functions Core Tools** + **Bicep** for the Functions and infra; **Python** for the six
  retained Functions.
- **Power Platform CLI** (`pac`) was the **prior-era** Code App toolchain (`pac code init` / `push`) —
  now historical, since the live frontend is a Static Web App, not a Code App.
- .NET present. Git initialised (`main`).

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`collisionspike` is a **fast, early spike** of the Collision Engineers case-intake workflow, built
on the **Microsoft Power Platform** (Power Apps **Code App** (React/Vite) + Dataverse + Power
Automate). It de-risks the mature cloud build, **`collisioncc`** (a Next.js + Google Cloud app),
which is **reference/context only** — re-implement its contracts; do **not** call it at runtime.

The Power Apps Code App is built and deployed live (`mockup-app/`, app `da7ba7af-…`) in the
**`Collision Engineers - Dev`** Sandbox (`b3090c42-…`), wired to live Dataverse; the parser +
enrichment Azure Functions are deployed; the Dataverse schema, 10 cloud flows, and the provider
corpus are loaded. Email intake is live. See **CURRENT_STATUS.md** and
**docs/architecture/live-environment.md** for the live registry.

Read first: [README.md](./README.md), [PLAN.md](./PLAN.md),
[docs/architecture/microsoft-stack.md](./docs/architecture/microsoft-stack.md),
[docs/architecture/repo-constellation.md](./docs/architecture/repo-constellation.md).

## Layout

```
README.md                 project overview
PLAN.md                   phased implementation plan (kept at repo root)
CLAUDE.md                 this file
docs/
  requirements/           admin-overview.md, intake-workflow.md, company-background.md
  architecture/           microsoft-stack.md, repo-constellation.md, integrations.md
  reference/              pointers to sibling repos / external specs
  reviews/                BINDING manual user reviews (dated folders) — see docs/reviews/README.md
```

**Binding reviews.** `docs/reviews/<DDMMYY>/` holds **manual user reviews**. A review is the
**authoritative spec** for the areas it covers — it corrects drift and sets requirements, and is
**superseded only by a later review** (it outranks older docs/plans/ADRs/code). When a review and an
older doc disagree, the review wins; reconcile the older doc to it. Method + structure:
[docs/reviews/README.md](./docs/reviews/README.md).

## Sibling repos (one folder up — ideas/prior-art only, NONE canonical, do not modify)

These hold **ideas and references** to Collision Engineers' processes — mine and adapt them; they
are not authoritative. The binding design is the spike's own distilled `docs/` + the `raw/` inbox.

- **ccc** — programme planning, skills, and **draft** contracts. Prior art to adapt.
- **collisioncc** — a mature reference build on Google Cloud; useful source of the EVA Sentry API
  detail, `case-status`, `image-rules`, provider knowledge, and a **pricing guide**. Reference only.
- **collisionplugin** — MCP enrichment connectors on Cloud Run behind an OAuth gateway. **M1
  enrichment bypasses this entirely: the enrichment Azure Function calls DVSA + DVLA directly via
  Entra `client_credentials` + X-API-Key (no Google Cloud gateway in the path).** The
  gateway/`valuationbot` remain prior-art for later phases (valuation, M2+).
- **cedocumentmapper_v2.0** — the document parser, **already ~75% built** (Python library + CLI;
  engine/readers/rules/normalisers/EVA-JSON exporter/tests done; UI/regression/packaging/CI
  outstanding; PyMuPDF **licensed** (AGPL concern resolved)). Complete & integrate it — don't re-derive parsing in Power Fx.
- **cedocumentmapper** — legacy v1 Tkinter monolith; behaviour reference only.

Full map: [docs/architecture/repo-constellation.md](./docs/architecture/repo-constellation.md).

## Domain model (business rules any implementation must honor)

Pipeline: **intake (3 Outlook shared inboxes) → parse + classify → human review → enrich → export
to EVA + archive to Box → audit/dedup**. Cases can arrive partial (instructions without images, or
images without instructions) and are held with a chaser workflow until complete.

- **Case/PO format:** `Principal` (4-char internal provider code) + 2-digit year + 3-digit provider
  case number, e.g. `CCPY26050`. Box folder is named with this.
- **EVA photo order:** upload **2 preview photos** (vehicle overview + main-damage closeup) first,
  then **all** photos in sequence **including those two again**. The overview must show the full
  registration.
- **Photo exclusion:** any photo showing a person's reflection is unusable.
- **Image rules / case-status** mirror `collisioncc` (`src/lib/image-rules.ts`,
  `src/lib/case-status.ts`): ≥2 EVA images incl. one `overview` (registration visible) + one
  `damage_closeup`; status `new_email → ingested → needs_review → ready_for_eva → eva_submitted`.
- **Inspection address** is derived ad hoc, falling back to "Image Based Assessment"; normalise via
  postcode.io. Not fully specified — surface as an open question.
- **Enrichment:** valuation evidence (Companion Report PDF), mileage (from MOT), Experian
  adverse-history (EVA built-in).

## Integration & gating

All non-trivial integrations are **feature-gated with Dataverse environment variables**
(`EVA_API_ENABLED`, `PDF_MAPPER_ENABLED`, `ENRICHMENT_ENABLED`, `AZURE_MAPS_ENABLED`,
`COPILOT_ENABLED`). **EVA** has two paths: JSON drag-drop export now; **Sentry REST API later**
(in testing). Detail: [docs/architecture/integrations.md](./docs/architecture/integrations.md).

## Tooling & conventions

- **Power Platform CLI** (`pac`, installed as a global .NET tool) drives the Code App:
  `pac code init` / `pac code add-data-source` / `pac code run` / `pac code push`. Note `pac` still
  surfaces `code` as **"(Preview)"** — confirm Code Apps GA/licensing before production.
- Relevant skills: `code-apps-preview:*` (`create-code-app`, `add-dataverse`, `add-sharepoint`,
  `add-office365`, `add-connector`, `deploy`), `azure:*` (Document Intelligence, Functions),
  `microsoft-docs:*` (Learn lookups).
- Windows environment; primary shell is PowerShell (Bash also available). Git initialised on `main`
  — commit as work progresses (the predecessor tool's lack of version control was a known problem).

## Agent roster & boundaries

Project agents live in `.claude/agents/`; project skills in `.claude/skills/`. Each domain agent
owns one vertical slice and defers across boundaries (it says so in its own description):

- **azure-integration-engineer** — Azure Functions (parser + enrichment REST wrappers calling
  DVSA/DVLA **directly via Entra** (no gateway)), Key Vault, Entra app registration, custom
  connectors, Document Intelligence, postcode.io/Azure Maps. Leans on `azure:*` +
  `microsoft-docs:*`.
- **power-automate-flow-builder** — cloud flows: inbox intake, dedup, status machine, parser/
  enrichment calls, EVA-submit + Box-sync, chasers. (No plugin covers Power Automate.)
- **eva-sentry-integration** — EVA Sentry REST v1.2, the 12-field JSON contract, photo-order/image
  rules, drag-drop export, Box coupling. Pairs with the `eva-sentry-api` skill.
- **dataverse-data-architect** — the `CollisionSpike` solution: 10 tables, provenance, env-var gates,
  auditing, ALM. Uses `code-apps-preview:add-dataverse`.
- **document-parser-engineer** — completes `cedocumentmapper_v2.0` (Python; **PyMuPDF is licensed —
  no AGPL remediation**); hands a clean HTTP entry point to the azure agent.

Reused plugin agent: **`code-app-architect`** (code-apps-preview) owns the Code App shell, React/Vite,
connector *selection*, and `pac code` deploy — our agents defer to it. **Do not** use the
`canvas-app-*` or `genpage-*` agents: the spike is a **Code App**, not a canvas or model-driven app.

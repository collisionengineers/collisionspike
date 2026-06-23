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
corpus are loaded. Email intake is live. The **Phase 7 Box-centric intake pivot** (ADR-0012 — folder at
parse-confirm, File-Request chasers, webhook intake; **one-way Box mirror, Dataverse authoritative**) has
its **Dataverse schema + env-vars applied live in Dev (all `BOX_*` gates `false`)**. The `box-webhook`
Function (`cespkbox-fn-v76a47`) is **deployed to `rg-collisionspike-dev` and Gate-C-verified, but dormant**
(`BOX_API_ENABLED=false`, KV empty so no Box secrets provisioned, no webhook subscribed); the
`cr1bd_box_rest` connector and the Box flows remain **authored offline (not deployed/bound)**. See
**CURRENT_STATUS.md** and **docs/architecture/live-environment.md** for the live registry.

Read first: [README.md](./README.md), [CURRENT_STATUS.md](./CURRENT_STATUS.md) (live state),
[ROADMAP.md](./ROADMAP.md), [PLAN.md](./PLAN.md),
[docs/architecture/microsoft-stack.md](./docs/architecture/microsoft-stack.md),
[docs/architecture/repo-constellation.md](./docs/architecture/repo-constellation.md). What needs the
operator: [docs/gated.md](./docs/gated.md).

## Layout & documentation map

```
README.md            project overview        ROADMAP.md          forward phased checklist (Phase 0–6 + Phase 7 Box pivot)
PLAN.md              narrative plan           CURRENT_STATUS.md   what is live now
CLAUDE.md            this file               DEPLOY-RUNBOOK.md   operator deploy sequence
AGENTS.md            operating rules + gotchas
docs/
  gated.md           hard/soft operator-blocker registry (everything that needs the user)
  plans/             one folder per phase, each with an ordered build checklist; index = plans/README.md
  reviews/           BINDING dated manual reviews — see docs/reviews/README.md
  adr/               architecture decision records 0001–0012
  architecture/      microsoft-stack, data-model, eva-*, integrations, live-environment (canonical), environment (historical)
  requirements/      admin-overview, intake-workflow, provider-corpus, inspection-address, company-background
  design/  research/  activation/  reference/   UI spec · forward research · operator playbooks · external specs
  README.md          the docs index
```

**Where things live / precedence.** Phases (**ROADMAP 0–6**) are the **work-breakdown** axis;
Milestones (**M0/M1/M2/M3**) are **capability slices that cut across phases** — authoritative map in
[docs/plans/milestone-model.md](./docs/plans/milestone-model.md). **Never equate a Phase with a
Milestone** (e.g. Phase 3 holds M1 EVA drag-drop *and* M2 EVA-REST; valuation in 5c is M3). Roles: **ROADMAP** = forward checklist · **CURRENT_STATUS** = live now ·
**docs/gated.md** = needs the operator · **docs/plans/&lt;phase&gt;/README.md** = the ordered build steps.
When docs disagree, precedence is: a **binding review** (docs/reviews/&lt;DDMMYY&gt;/) > **ADRs** >
**architecture/requirements** specs > **plans** — reconcile the older/lower doc to the higher one.

**Binding reviews.** `docs/reviews/<DDMMYY>/` holds **manual user reviews** — the **authoritative spec**
for the areas they cover, **superseded only by a later review** (outranking older docs/plans/ADRs/code).
When a review and an older doc disagree, the review wins; reconcile the older doc to it. Method:
[docs/reviews/README.md](./docs/reviews/README.md).

## Related repos (in the `collisionsuite/` tree — ideas/prior-art only, NONE canonical, do not modify)

These hold **ideas and references** to Collision Engineers' processes — mine and adapt them; they
are not authoritative. The binding design is the spike's own distilled `docs/` + the `raw/` inbox.
Paths are relative to this repo, now at `collisionsuite/active/collisionspike/` (reorganised 2026-06-23).

- **cedocumentmapper_v2.0** (`../cedocumentmapper_v2.0` — active sibling) — the document parser,
  **already ~75% built** (Python library + CLI; engine/readers/rules/normalisers/EVA-JSON
  exporter/tests done; UI/regression/packaging/CI outstanding; PyMuPDF **licensed** (AGPL concern
  resolved)). Complete & integrate it — don't re-derive parsing in Power Fx.
- **ccc** (`../../archive/ccc`) — programme planning, skills, and **draft** contracts. Prior art to adapt.
- **collisioncc** (`../../archive/collisioncc`) — a mature reference build on Google Cloud; useful source
  of the EVA Sentry API detail, `case-status`, `image-rules`, provider knowledge, and a **pricing
  guide**. Reference only.
- **cedocumentmapper** (`../../archive/cedocumentmapper`) — legacy v1 Tkinter monolith; behaviour reference only.
- **collisionplugin** — **dissolved 2026-06-23.** Its MCP enrichment connectors now live under
  `../../connectors/` (`dvla-dvsa-connector`, `valuation-adverts-connector`, `mcp-gateway`,
  `report-renderer`) and its skills under `../../skills/`. **M1 enrichment bypasses these entirely:
  the enrichment Azure Function calls DVSA + DVLA directly via Entra `client_credentials` + X-API-Key
  (no Google Cloud gateway in the path).** The gateway/valuation connectors remain prior-art for
  later phases (valuation, M2+).

Full map: [docs/architecture/repo-constellation.md](./docs/architecture/repo-constellation.md)
(partly stale after the 2026-06-23 reorganisation into `collisionsuite/`).

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
- **Inspection address** comes from an **offline-derived, full-address-only suggestions corpus**
  (`cr1bd_inspectionaddress`) that staff **pick/edit manually**, falling back to "Image Based
  Assessment" with a reason. `Loc` is an **EVA-export artifact, not an intake input**, and there is
  **no runtime address matcher** (the one that misread `Loc` was removed 2026-06-23). See **ADR-0013**
  and `docs/architecture/inspection-address-corpus.md`.
- **Enrichment:** valuation evidence (Companion Report PDF), mileage (from MOT), Experian
  adverse-history (EVA built-in).

## Integration & gating

All non-trivial integrations are **feature-gated with Dataverse environment variables**
(`EVA_API_ENABLED`, `PDF_MAPPER_ENABLED`, `ENRICHMENT_ENABLED`, `AZURE_MAPS_ENABLED`,
`COPILOT_ENABLED`, and the **Phase-7 `BOX_*` set** — `BOX_API_ENABLED`, `BOX_FOLDER_AT_INTAKE_ENABLED`,
`BOX_FILEREQUEST_ENABLED`, `BOX_EMBED_ENABLED` (reserved), `BOX_METADATA_ENABLED` (deferred), all
default-off). **EVA** has two paths: JSON drag-drop export now; **Sentry REST API later** (in testing).
**Box (Phase 7, ADR-0012)** is an **additive, one-way mirror** (Dataverse stays the system of record):
all non-byte Box ops run through a **custom connector** (CCG token minted inside the `box-webhook`
Function, never the connector); **evidence is linked, not embedded** — a server-minted "Open in Box" deep
link, so there is **no iframe and no `frame-src` edit** (`BOX_EMBED_ENABLED` stays reserved/off). Detail:
[docs/architecture/integrations.md](./docs/architecture/integrations.md).

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

Project agents in `.claude/agents/`, skills in `.claude/skills/`. Each owns one slice and defers across
boundaries; **full descriptions + boundaries are in [AGENTS.md](./AGENTS.md)**. In brief:

- **azure-integration-engineer** — Azure Functions (parser + DVSA/DVLA enrichment direct via Entra), Key Vault, connectors, Document Intelligence, postcode.io/Maps.
- **power-automate-flow-builder** — cloud flows: intake, dedup, status machine, parser/enrichment calls, EVA-submit + Box-sync, chasers.
- **eva-sentry-integration** — EVA Sentry REST v1.2, the 12-field JSON contract, photo-order/image rules, drag-drop export, Box.
- **dataverse-data-architect** — the `CollisionSpike` solution: tables, provenance, env-var gates, auditing, ALM.
- **document-parser-engineer** — completes `cedocumentmapper_v2.0` (Python; PyMuPDF licensed); hands a clean HTTP entry point to the azure agent.

Reused: **`code-app-architect`** (code-apps-preview) owns the Code App shell, React/Vite, connector
*selection*, and `pac code` deploy — our agents defer to it. **Do not** use `canvas-app-*` / `genpage-*`
(this is a Code App, not canvas/model-driven).

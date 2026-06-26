# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`collisionspike` is a **fast, early spike** of the Collision Engineers case-intake workflow. It
de-risks the mature cloud build, **`collisioncc`** (a Next.js + Google Cloud app), which is
**reference/context only** — re-implement its contracts; do **not** call it at runtime.

**Live platform (as of 2026-06-26): pure Azure PaaS.** The spike has been **migrated off the
Microsoft Power Platform** (its original implementation — a Power Apps **Code App** + Dataverse +
~16 Power Automate flows + custom connectors) and that cutover has been **executed**; the Power
Platform implementation is now being **decommissioned**. **Only the platform mechanism changed** —
the **domain model, EVA 12-field contract, image rules, provider corpus, and Case/PO format below
are unchanged**. The executed migration plan + cutover record is **`migration/`** (a temporary,
delete-when-done folder — see [`migration/README.md`](./migration/README.md)).

The live Azure stack lives in resource group **`rg-collisionspike-dev`** (region **uksouth**), inside
the **Azure Free-Trial** subscription `e6076573-…` (quotaId `FreeTrial_2014-09-01`):

- **SPA** — Static Web App **`cespk-spa-dev`** (control-plane region `westeurope`,
  `https://proud-sky-04e318b03.7.azurestaticapps.net`) serving the **preserved** React/Vite app from
  `mockup-app/`, with **Entra/MSAL workforce sign-in** (staff-only). It calls the Data API over REST
  (`mockup-app/src/data/rest-client.ts`) — **no Power SDK**.
- **Data API** — Function App **`cespk-api-dev`** (Node 20 / TypeScript Functions v4; source `api/`,
  esbuild bundle `deploy/api/main.cjs`). Validates Entra JWTs (`jose`) and the app roles
  **`CollisionSpike.User` / `CollisionSpike.Admin`** (the two roles that replace the old Dataverse
  security roles; v2 tokens carry `aud` = the API client-id GUID `fa2fb28c…`). Connects to Postgres;
  owns the status-machine, dedup, audit, and gate reads.
- **Orchestration** — Function App **`cespk-orch-dev`** (source `orchestration/`) — **built but with
  ZERO functions currently deployed**. Intended design: Microsoft Graph **delta-poll** intake over
  **Exchange-RBAC-scoped** mailboxes (no Global-Admin consent, no push subscription).
- **System-of-record DB** — **Postgres Flexible Server `cespk-pg-dev`** (v16, database
  `collisionspike`): 36 tables, reference corpus seeded — `work_provider` 390, `repairer` 32,
  `image_source` 19, `inspection_address` 2209 (174 confirmed + 2035 suggested), `case_` 0.
- **Retained UNCHANGED** — the **6 Python Functions** (parser `cespike-parser-dev`, enrichment,
  evasentry, evavalidation, ocr, box-webhook), the Key Vaults, Blob `cespkevidstdev01`, and App
  Insights / Log Analytics.

**Honest live state (do not paper over).** (1) **No automated email intake is live yet** — the
orchestration app is undeployed, so the system is currently **read-only + manual case-create only**.
(2) **Postgres security (P0 + P2 — RESOLVED 2026-06-26):** the Data API connects as a **non-owner login
`cespk_app`** (no superuser, no `BYPASSRLS`) whose password is a **Key Vault reference** (no cleartext),
so the authored **Row-Level Security is now enforced** (the prior `csadmin` owner bypassed it) and the
audit trail is append-only at both the grant and RLS layers; the per-connection DB app-role is set via
the libpq `-c app.role=staff` startup option (`PGAPPROLE`). (3) **Free-Trial → Pay-As-You-Go
deadline:** the whole stack disables at the ~30-day mark unless upgraded to PAYG (the 12-month free
Postgres allowance survives the upgrade). (4) **Staff app-role assignment is incomplete** — only ONE
staff principal is app-role-assigned so far; others 403 until assigned. (5) **Durable auth
error-handling + token-audience-form hardening** are in progress.

> **Prior platform (decommissioned, banded historical).** Before the migration the spike ran as a
> Power Apps **Code App** (`mockup-app/`, app `da7ba7af-…`) in the **`Collision Engineers - Dev`**
> sandbox (`b3090c42-…`), wired to **Dataverse**, with ~16 Power Automate cloud flows, custom
> connectors (incl. `cr1bd_box_rest`), and the **Phase 7 Box-centric intake pivot** (ADR-0012). All
> `BOX_*` gates were `false` then and **remain `false`** now. That stack is being torn down per
> [`migration/90-deprovision-power-platform.md`](./migration/90-deprovision-power-platform.md); treat
> any Dataverse / Power Automate / Code App / `pac`-driven detail elsewhere in the docs as the
> **prior era**, not the live system.

Read first: [README.md](./README.md), [CURRENT_STATUS.md](./CURRENT_STATUS.md) (live state),
[docs/architecture/live-environment.md](./docs/architecture/live-environment.md) (the live registry),
[migration/README.md](./migration/README.md) (cutover record), [ROADMAP.md](./ROADMAP.md),
[PLAN.md](./PLAN.md), [docs/architecture/repo-constellation.md](./docs/architecture/repo-constellation.md).
What needs the operator: [docs/gated.md](./docs/gated.md).

## Layout & documentation map

```
README.md            project overview        ROADMAP.md          forward phased checklist (Phase 0–6 + Phase 7 Box pivot)
PLAN.md              narrative plan           CURRENT_STATUS.md   what is live now
CLAUDE.md            this file               DEPLOY-RUNBOOK.md   operator deploy sequence
AGENTS.md            operating rules + gotchas
migration/           EXECUTED Power Platform → Azure PaaS cutover record (temporary; delete-when-done)
api/  orchestration/ LIVE Azure: TS Data API (BFF) + Durable/Graph orchestration Function Apps
docs/
  gated.md           hard/soft operator-blocker registry (everything that needs the user)
  plans/             one folder per phase, each with an ordered build checklist; index = plans/README.md
  reviews/           BINDING dated manual reviews — see docs/reviews/README.md
  adr/               architecture decision records 0001–0018 (0015–0018 Proposed)
  architecture/      microsoft-stack, data-model, eva-*, integrations, live-environment (canonical), environment (historical)
  requirements/      admin-overview, intake-workflow, provider-corpus, inspection-address, company-background
  design/  research/  activation/  reference/   UI spec · forward research · operator playbooks · external specs
  README.md          the docs index
```

**`docs/plans/to-integrate-into-phases/` is a drop-zone** for shorthand operator notes pending
distillation: a note is distilled into the relevant `plans/`, ADR, and `docs/`, then the note stub is
**removed** once distilled (data files dropped alongside may be **retained** where still referenced —
e.g. `inspection-address-revamp/fullevaexportinspectionaddresses.xlsx`).

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

- **cedocumentmapper_v2.0** (`../cedocumentmapper_v2.0` — active sibling) — the document parser, and the
  **one exception to the "prior-art only / do not modify" framing above**: it is the **authoring source of
  truth** for the engine that is **vendored + live** in this repo's parser Function (edit-in-sibling-first,
  then re-vendor — see [ADR-0018](./docs/adr/0018-cedocumentmapper-dual-target-vendored-engine.md),
  [repo-constellation](./docs/architecture/repo-constellation.md), and that copy's `PROVENANCE.md`). It is a
  **standalone dual-target product**: a single-user **desktop review GUI** (React + pywebview; portable
  PyInstaller exe via `build.ps1`) **and** a headless **engine-core for the cloud** (our Azure Function). The
  engine core is **complete & tested** — the old "~75%, UI/packaging outstanding" line is **stale**; it now
  also has the GUI, packaging, an opt-in extraction orchestrator + offline LLM-assist, and an eval harness
  (all **desktop/dev-only — NOT on the vendored cloud path**). PyMuPDF is **licensed** (AGPL resolved). Reuse
  the engine; don't re-derive parsing in the API/SPA.
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
  (live Postgres table `inspection_address` — 174 confirmed + 2035 suggested; was the Dataverse
  `cr1bd_inspectionaddress` table) that staff **pick/edit manually**, falling back to "Image Based
  Assessment" with a reason. `Loc` is an **EVA-export artifact, not an intake input**, and there is
  **no runtime address matcher** (the one that misread `Loc` was removed 2026-06-23). See **ADR-0013**
  and `docs/architecture/inspection-address-corpus.md`.
- **Enrichment:** valuation evidence (Companion Report PDF), mileage (from MOT), Experian
  adverse-history (EVA built-in).

## Integration & gating

All non-trivial integrations are **feature-gated**. Under the live Azure stack the gates are **Function
app-settings** that the Data API + orchestration apps read (they were **Dataverse environment variables**
in the prior Power Platform build); the names and **default-off** semantics are unchanged:
`EVA_API_ENABLED`, `PDF_MAPPER_ENABLED`, `ENRICHMENT_ENABLED`, `AZURE_MAPS_ENABLED`, `COPILOT_ENABLED`,
and the **Phase-7 `BOX_*` set** — `BOX_API_ENABLED`, `BOX_FOLDER_AT_INTAKE_ENABLED`,
`BOX_FILEREQUEST_ENABLED`, `BOX_EMBED_ENABLED` (reserved), `BOX_METADATA_ENABLED` (deferred). **EVA** has
two paths: JSON drag-drop export now; **Sentry REST API later** (gated). The drag-drop path is current
because Minotaur Software's Sentry API supports only **one principal code** per API submission (it cannot
route different work-provider codes); REST stays gated pending Minotaur's patch.
**Box (Phase 7, ADR-0012)** is an **additive, one-way mirror** (**Postgres** is now the system of record —
Dataverse was, in the prior build): **evidence is linked, not embedded** — a server-minted "Open in Box"
deep link, so there is **no iframe and no `frame-src` edit** (`BOX_EMBED_ENABLED` stays reserved/off). Box
stays **gated off across the migration** (every `BOX_*` resolves false). The non-byte Box operations that
formerly ran through a Power Platform **custom connector** (`cr1bd_box_rest`, with a CCG token minted inside
the `box-webhook` Function — never the connector) are, in the Azure design, carried by the **retained
`box-webhook` Function plus the orchestration app**; the Power Platform connector itself is decommissioned.
Detail: [docs/architecture/integrations.md](./docs/architecture/integrations.md).

## Tooling & conventions

- **Live stack tooling (Azure PaaS):** `az` (Azure CLI) for Postgres / the API + orchestration
  Function Apps / Static Web Apps / managed identities / Key Vault grants; `func` (Azure Functions
  Core Tools) to run + deploy the API (`api/`) and orchestration (`orchestration/`) apps; `swa` /
  `az staticwebapp` to deploy the SPA; `psql` to apply the Postgres DDL + corpus seed; `npm` + Vite
  for the React SPA in `mockup-app/`.
- **Reference-only (prior Power Platform build, decommissioned):** the **Power Platform CLI** (`pac`,
  a global .NET tool — `pac code …`) drove the now-retired Code App; it survives only for
  export-for-reference and teardown (`pac admin delete`). Likewise the `code-apps-preview:*` skills.
- Relevant skills: `azure:*` (Document Intelligence, Functions, Postgres, Static Web Apps),
  `microsoft-docs:*` (Learn lookups).
- Windows environment; primary shell is PowerShell (Bash also available). Git initialised on `main`
  — commit as work progresses (the predecessor tool's lack of version control was a known problem).

## Agent roster & boundaries

Project agents in `.claude/agents/`, skills in `.claude/skills/`. Each owns one slice and defers across
boundaries; **full descriptions + boundaries are in [AGENTS.md](./AGENTS.md)**. The roster predates the
Azure migration, so some agents now describe the **prior Power Platform mechanism** — keep their
**domain** guidance, but build against the **live Azure equivalents** below.

**Live (platform-current):**

- **azure-integration-engineer** — Azure Functions (parser + DVSA/DVLA enrichment direct via Entra), Key Vault, connectors, Document Intelligence, postcode.io/Maps.
- **eva-sentry-integration** — EVA Sentry REST v1.2, the 12-field JSON contract, photo-order/image rules, drag-drop export, Box. (EVA contract is platform-independent — unchanged by the migration.)
- **document-parser-engineer** — maintains `cedocumentmapper_v2.0` (Python; PyMuPDF licensed) as the engine's authoring source of truth; hands a clean importable **engine-core** the azure agent vendors into the parser Function's HTTP route (ADR-0004/0018) — not an HTTP service in the sibling itself.

**Reference-only (prior Power Platform build, decommissioned — defer to the Azure components, not these mechanisms):**

- **power-automate-flow-builder** — authored the cloud flows (intake, dedup, status machine, parser/enrichment calls, EVA-submit + Box-sync, chasers). Live equivalent: the **TypeScript orchestration Function App** (`orchestration/`, Durable + Graph delta-poll intake) plus the **Data API** (`api/`) that owns status-machine / dedup / audit.
- **dataverse-data-architect** — owned the `CollisionSpike` Dataverse solution (tables, provenance, env-var gates, auditing, ALM). Live equivalent: the **Postgres schema** (`cespk-pg-dev`, 36 tables + choiceset lookup tables + RLS) and the gates-as-app-settings the Data API reads.
- **`code-app-architect`** (code-apps-preview) — owned the Code App shell, React/Vite, connector *selection*, and `pac code` deploy. Live equivalent: the **SWA-hosted** React SPA (`mockup-app/` on `cespk-spa-dev`) with **MSAL/Entra** auth and the `rest-client.ts` data seam. **Do not** use `canvas-app-*` / `genpage-*` (never canvas/model-driven).

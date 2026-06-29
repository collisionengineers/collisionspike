# Plan: `collisionspike` — Collision Engineers case-intake spike (Power Platform origin → live Azure PaaS)

> **Platform note (2026-06-26).** This spike was **first built on Power Platform** (Power Apps Code App +
> Dataverse + ~16 Power Automate flows + custom connectors) and has since been **migrated to an Azure PaaS
> stack** — a **Static Web App** SPA, a **Function-App data API** (`cespk-api-dev`), an **orchestration
> Function App** (`cespk-orch-dev`), a **Postgres Flexible Server** system of record (`cespk-pg-dev`), and
> the **retained Python Functions**. The Power Platform implementation is **decommissioned**. This document
> is the original **narrative** plan; its **domain content is unchanged** (it is the source for the EVA
> 12-field contract, image rules, the provider corpus, the Case/PO format, and the intake→enrich→EVA+Box
> pipeline), but its **platform mechanism is historical** — read "Dataverse / Power Automate / Code App" as
> the migrated Azure equivalents (Postgres / orchestration Function / Static Web App). See
> [migration/](./migration/) for the executed migration and [CURRENT_STATUS.md](./CURRENT_STATUS.md) for live state.

> **Phase taxonomy:** the canonical phase numbering is **ROADMAP's Phase 0–6** ([ROADMAP.md](./ROADMAP.md));
> what is live is in [CURRENT_STATUS.md](./CURRENT_STATUS.md) and operator-gated items in
> [docs/gated.md](./docs/gated.md). The workstreams below keep their original build order and are labelled
> with their canonical ROADMAP phase. The **forward Azure migration-remediation backlog** lives in
> ROADMAP's *Now / Next / Later* and in [OPEN_ITEMS.md](./OPEN_ITEMS.md), not here.

## Context

Collision Engineers (a vehicle-damage assessment firm) run a manual, multi-system case-intake
workflow: instructions/images arrive in **three Outlook shared inboxes** (plus WhatsApp and the
Audatex API), are tracked on an **Excel job sheet stored in SharePoint**, enriched (valuation,
mileage, Experian, images), then loaded into the legacy **EVA** system (Minotaur "Sentry" API)
and archived in **Box**.

There is already a **mature build in flight** — `../collisioncc`, a Next.js + Firebase/Google
Cloud app ("Collision Command Centre") with ~19 workstreams that implements Graph email intake,
a provider-rule parser + Google Document AI, EVA image-rules, a case-status state machine, and
EVA Sentry-API submission. **This repo (`collisionspike`) is explicitly positioned as an early,
fast spike of that same product** — a rapid prototype to validate the workflow and UX cheaply
using Power Platform low-code building blocks, while the GCP build matures in parallel.

The **original** goal of this plan: stand up `collisionspike` as a **Power Apps Code App (React/Vite)** on
Power Platform that prototypes the core intake→enrich→EVA workflow, **reusing collisioncc's
proven contracts** (EVA payload, case-status, image-roles) so findings transfer to the mature
build. Two adjacent deliverables are folded in: rebuilding `cedocumentmapper` as a clean
`cedocumentmapper_v2.0` Python CLI, and gating the EVA integration (JSON-export now, Sentry API
later).

> **As migrated (2026-06-26).** The React/Vite front end was **preserved** and now runs as the
> **`cespk-spa-dev` Static Web App** with **MSAL / Entra workforce sign-in**, calling the **`cespk-api-dev`
> Function-App data API** over REST (`mockup-app/src/data/rest-client.ts`) — **no Power SDK**. The case
> store moved from Dataverse to **Postgres Flexible Server** (`cespk-pg-dev`). The intake→enrich→EVA
> workflow, the reused collisioncc contracts, and the `cedocumentmapper_v2.0` parser are **all unchanged**;
> only the hosting/data mechanism changed. The forward work is the migration-remediation backlog
> (ROADMAP *Now / Next / Later* + [OPEN_ITEMS.md](./OPEN_ITEMS.md)).

## Repository constellation (what exists, confirmed by exploration)

| Repo (under `collisionsuite/` — layout reorganised 2026-06-23, see [INDEX.md](../../INDEX.md)) | What it is | Role for the spike |
|---|---|---|
| `collisionspike` (**this repo**) | Near-empty: `adminoverview.md`, `CLAUDE.md`, `.claude/settings.json` | **Build target** — the Power Apps Code App spike |
| `collisioncc` | Mature Next.js + Firebase/GCP app ("Command Centre"); Graph intake, parser+Document AI, image-rules, case-status, EVA Sentry submit | **Contract & architecture reference** (the future cloud version); source of the EVA payload shape, `case-status` states, `image-rules`, provider knowledge |
| `collisionplugin` (singular) | Claude plugin + **MCP connectors on Cloud Run**: `dvsa-mot` (mileage/history, 32 tools), `valuationbot` (comparable-advert valuation + PDF), `report-renderer`, `eva` (Sentry browser, currently disabled), `mcp-gateway` (OAuth) | **Connector functions the spike consumes** for enrichment |
| `cedocumentmapper` | 4,244-line Tkinter monolith: PDF/DOCX/DOC/EML/MSG → provider detection → 12-field map → EVA JSON; bundles Tesseract; no tests, no VCS history | **Rebuild → `cedocumentmapper_v2.0`** (library + CLI) |
| `collisionpdf`, `collisionautomation` | Parser-first FastAPI service; React/Vite UI prototype | Secondary references (parser pipeline, UI/runtime-gating patterns) |

## Locked decisions (from clarification)

- **Front end:** _(origin)_ Power Apps **Code App (React/Vite)** — built via `code-apps-preview` skills.
  _**As migrated:** the same React/Vite app is preserved and served as the **`cespk-spa-dev` Static Web App**
  with **MSAL / Entra workforce sign-in** (staff-only), calling the data API over REST — no Power SDK._
- **Case store:** _(origin)_ Reference the existing **SharePoint** job sheet; **mirror it into Dataverse**
  as the spike's working store (start read-only import; SharePoint remains source of record). _**As migrated:**
  the working store is **Postgres Flexible Server** (`cespk-pg-dev`, db `collisionspike`, 36 tables),
  authoritative system of record; the SharePoint job sheet remains the historical business reference._
- **`collisioncc` = reference / information / context guide only** (CONFIRMED). The spike does
  **not** call collisioncc at runtime; it is a **reference** (not canonical) for the domain model,
  EVA payload, case-status, image-rules, and provider knowledge — the spike's own `docs/` +
  `CONTEXT.md` are the source of truth.
- **`collisionplugin`** MCP connectors are consumed at runtime for enrichment (mileage, valuation).
- **Image AI:** **AI Builder first** (overview-vs-damage classification, registration-visible
  check). **Azure AI Vision** (people/reflection detection, plate OCR) and **Azure Document
  Intelligence** + general LLM assist are **explicitly later phases**.
- **EVA:** **full scope** (ADR-0005) — drag-drop JSON now (M1 + permanent fallback); Sentry API
  built against the **EVA test environment** (test vs prod by **credentials**, same URL); production
  cutover gated. **Box** mirrors the case (UPPERCASE Case/PO; EVA lowercase). _Under the Phase-7 Box
  pivot (ADR-0012) the Box folder is minted at **parse-confirm** (`box-folder-create`), not first at
  EVA submit; `finalize-eva-box` then **augments** it. Box is a one-way mirror, Dataverse authoritative._
- **EVA image rule:** **1 full-view image (registration visible) + 1 damage closeup** (the 2 previews).
- **Audatex:** intake/integration **out of scope** for the spike (deferred entirely).
- **Tool boundary:** the tool ends at **EVA submission + Box** (the EVA handoff); the engineer
  assessment / report generation / return-to-client is **out of scope** (ADR-0008).
- **Valuation** (`valuationbot`): **in scope (M2)** — **on-demand** (staff-triggered, e.g.
  total-loss/disputed value): comparable search + evidence PDF attached as Evidence, gated
  `VALUATION_ENABLED`; same REST-wrapper pattern as DVSA.

## Recommended architecture

### Live — Azure PaaS stack (as migrated, 2026-06-26)

```
 Outlook (3 shared inboxes) ──┐  Microsoft Graph DELTA-POLL intake (Exchange-RBAC-scoped mailboxes)
 WhatsApp / Audatex (later) ──┤  Function App  cespk-orch-dev  [BUILT — zero functions deployed yet]
                              ▼
              Postgres Flexible  cespk-pg-dev  (case_, evidence, work_provider, inspection_address, audit…)
                              ▲
        Function-App data API  cespk-api-dev  (Node/TS; Entra-JWT + app roles User/Admin → Postgres)
                              ▲  REST  (mockup-app/src/data/rest-client.ts)
        Static Web App  cespk-spa-dev  (React/Vite; MSAL/Entra workforce sign-in) ── the spike UI
                              │  HTTP (retained Python Functions + Key Vault)
        ┌─────────────────────┼───────────────────────────────┐
        ▼                     ▼                                ▼
  ocr Function     enrichment Function                 parser Function (cespike-parser-dev)
  (scanned PDFs)   DVSA/DVLA direct via Entra          (cedocumentmapper_v2.0 engine, vendored)
                              │                         evasentry / evavalidation / box-webhook Functions
                              ▼
                     EVA: JSON export now │ Sentry REST when flag ON       Box: one-way mirror archive
```

> **Auth + intake model (corrects the old "Graph Mail.Read needs Global-Admin consent" assumption).**
> Staff reach the SPA via **MSAL / Entra workforce sign-in**; the API validates the Entra JWT and the two
> app roles **CollisionSpike.User / CollisionSpike.Admin** (which map the old 2 Dataverse roles).
> **Automated intake** uses **Exchange RBAC for Applications**: an **Exchange Administrator** grants the
> intake app **resource-scoped** Graph mailbox roles (`New-ServicePrincipal` / `New-ManagementScope` /
> `New-ManagementRoleAssignment`) on the 3 inboxes — **no Global-Admin tenant consent, no push subscription**
> — and intake **polls** (delta query). Orchestration is **built but not yet deployed**, so live automated
> intake is **pending** (today: read-only + manual case-create).

**Where logic lives (live):** the typed TS domain modules + contracts run in the SPA and the `cespk-api-dev`
data API; **Postgres** holds relational integrity + audit (with RLS to be enforced once the **P0 DB-security
remediation** lands — see the migration backlog); the **retained Python Functions** carry parsing /
enrichment / EVA / OCR / Box; integrations are gated by **Key-Vault-backed app-settings** rather than
Dataverse environment variables. The whole stack sits in `rg-collisionspike-dev` (uksouth) on an **Azure
Free Trial** subscription — **upgrade to Pay-As-You-Go before the ~30-day cutoff** or it is disabled.

### Historical — Power Platform spike architecture (decommissioned)

> Retained for reference: the original low-code topology, migrated to the Azure stack above. The domain
> shape (Case / Evidence / Provider / AuditEvent, the connector seam, the EVA/Box handoff) carried over;
> the mechanism (Power Automate / Dataverse / Code App / Dataverse env-vars) did not.

```
 Outlook (3 shared inboxes) ──┐
 WhatsApp / Audatex (later) ──┤  Power Automate cloud flows (Office 365 Outlook trigger)
                              ▼
                    Dataverse (Case, Evidence, Provider, AuditEvent)  ◄── mirror ── SharePoint job sheet
                              ▲
        Power Apps CODE APP (React/Vite)  ── the spike UI: intake queue, case detail,
        image ordering/preview, EVA-readiness, missing-info chasing
                              │  calls (custom connectors)
        ┌─────────────────────┼───────────────────────────────┐
        ▼                     ▼                                ▼
  AI Builder       Azure Function (enrichment)        cedocumentmapper_v2.0
  (image classify) DVSA/DVLA direct via Entra         (PDF → EVA-JSON, CLI now;
                   (no mcp-gateway / Cloud Run)         Azure Function + connector later)
                   [valuation via collisionplugin: M2+]
                              │
                              ▼
                     EVA: JSON export now │ Sentry API when flag ON
```

**Why a Code App (not Canvas/model-driven):** chosen by the user, and it let the spike **share
React/TypeScript domain code and contracts with `collisioncc`** (case-status, EVA payload,
image-roles) rather than reinventing them in Power Fx. _That same React/TypeScript investment is exactly
what made the later lift to a Static Web App + REST data API cheap — the domain code was preserved verbatim._

**Where logic lived:** heavy/business logic in typed TS modules in the Code App and in
Power Automate flows; Dataverse for relational integrity/audit; integrations gated with
**Dataverse environment variables** (solution-packaged, per-environment, no redeploy).

## Workstreams (phased)

> **HISTORICAL — Power Platform build narrative (decommissioned; preserved for domain reference).** The
> phased workstreams below describe the **original** low-code build order. They remain the most complete
> record of the **domain decisions** — the M1 vertical slice, the parser/EVA/enrichment/image/Box rules, the
> inspection-address policy — every one of which **carried over to the Azure stack unchanged**. Read the
> platform verbs as their migrated equivalents (Code App → Static Web App + data API; Dataverse → Postgres;
> Power Automate flow → orchestration Function; `add-*` Code App skills → the migrated wiring). The **forward
> Azure work** is in ROADMAP *Now / Next / Later* + [OPEN_ITEMS.md](./OPEN_ITEMS.md); it does not re-derive
> the domain, it re-homes it.

> **First milestone — M1 vertical slice (decided).** ONE mailbox → VRM-correlated Case →
> deterministic readiness checklist + Missing → manual Case/PO + drag-drop EVA JSON export. Minimal
> seeded corpus; inspection address as a manual field. **Parser wired inline (ADR-0004):**
> `cedocumentmapper_v2.0` runs as an Azure Function (custom connector, `PDF_MAPPER_ENABLED`) that the
> Code App calls on the instruction to pre-fill the 12 fields (staff review). Proves Code App +
> Dataverse + parser→EVA + the readiness gate end-to-end. **Images (M1):** stored + **manual role
> tagging**, with deterministic **OCR** (Tesseract via the parser function, or Azure Vision Read)
> auto-checking registration-visible — **OCR is for registration matching only in M1**; classification
> (overview/damage) + reflection detection are **deferred to M2** (ADR-0009). **DVSA enrichment (M1 — ADR-0006):** mileage (**only when the
> document lacks it — authoritative**) + vehicle make/model via an Azure Function calling DVSA/DVLA
> **directly via Entra** (no OAuth gateway / mcp-gateway), gated `ENRICHMENT_ENABLED`, staff-reviewed. **EVA (full scope):**
> drag-drop JSON is the M1 path; the Sentry API is developed against the **test env** (same URL; test
> credentials route to the test server; production cutover gated). **Box (M1):** folder = UPPERCASE
> Case/PO (EVA lowercase — `test26001` → `TEST26001`), created **in unison** with EVA submission.
> **Out of M1:** image-classification AI (overview/damage, reflection detection), valuation connector,
> full corpus governance, assistant/copilot, structured chasers, **EVA production cutover**. **PyMuPDF licensed** (AGPL concern resolved — M1 complete).

### Phase 0 — Foundations
- Scaffold the Power Apps Code App: `code-apps-preview:create-code-app` (React/Vite).
- Create a **Dataverse solution** `CollisionSpike` to hold tables, connectors, env vars, flows.
- Add Dataverse: `code-apps-preview:add-dataverse`. Tables mirroring collisioncc's model:
  `Case` (VRM, provider/principal, Case/PO, status, dates, inspection address), `Evidence`
  (kind, imageRole, registrationVisible, acceptedForEva, storage state), `Provider` (principal
  code, detect phrases, automation mode), `AuditEvent` (actor, action, severity, details).
  Reuse the **status enum** from `collisioncc/src/lib/case-status.ts`
  (`new_email→ingested→needs_review→ready_for_eva→eva_submitted`, plus `missing_images`,
  `missing_required_fields`, etc.).
- Port shared **contracts** as TS modules: EVA payload (12 fields, 6-line address) and
  image-rules from `collisioncc/src/lib/image-rules.ts` and the EVA export contract.
- **Env vars / feature flags:** `EVA_API_ENABLED` (default false), `EVA_BASE_URL`,
  `PDF_MAPPER_ENABLED`, `AZURE_VISION_ENABLED`, connector base URLs.

### Phase 1 — Email intake + case tracking (primary object)
- `code-apps-preview:add-office365` (Outlook). Build **Power Automate flows**, one per shared
  mailbox, "When a new email arrives in a shared mailbox (V2)" with **Include Attachments = Yes**.
- Flow: save `.eml` + attachments, classify attachments (image vs instruction PDF), create/append
  a `Case` in Dataverse, set status, route by mailbox. Mirrors `collisioncc/src/lib/graph-intake.ts`.
- `code-apps-preview:add-sharepoint`: reference the existing Excel job sheet; **read-only import
  → Dataverse mirror** (dashboard of "ready for EVA" vs "missing info", missing-data summaries,
  duplicate-VRM warnings). Per collisioncc job-sheet research: **don't run macros**, preserve
  human review.
- Code App UI: intake queue, case detail, missing-info chasing surface.

### Phase 1b — Provider corpus + inspection-address assistant (distilled from `raw/`)
- **Governed provider/garage corpus** (Dataverse `WorkProvider` + `InspectionAddress`), seeded from
  the real job sheet (`Principals` 58, `Garages` 38). Provider matching by **email domain** (not
  aliases). **Spike scope:** `Review auto` only + **global** kill switches + field-level
  **provenance** markers; per-provider AI/Full-auto and the Improvement-Review queue are **deferred**.
  Entities: WorkProvider, **Repairer** (first-class, m:n — ADR-0001), **ImageSource** (role),
  InspectionAddress; Cases correlate by **VRM** (ADR-0002).
  Spec: [docs/requirements/provider-corpus.md](./docs/requirements/provider-corpus.md),
  [docs/architecture/data-model.md](./docs/architecture/data-model.md).
- **Inspection-address assistant**: per-provider `inspectionLocationPolicy`
  (`always_image_based`/`prefer_address`/`required_address`); **no silent "Image Based Assessment"**.
  Phasing: **M1** policy gate + manual entry; **M2 (lean)** ranked candidates from instruction text +
  corpus + OCR (phone/email/postcode→Repairer) + history; **M3** EXIF/GPS + Azure Maps + vision. Spec:
  [docs/requirements/inspection-address.md](./docs/requirements/inspection-address.md).

### Phase 5b — Image classification (ADR-0009) _(canonical ROADMAP; original sequence: "Phase 2")_
- **AI Builder image classification** (overview vs damage_closeup) — M2; **Azure OpenAI / Foundry
  vision** for **person/reflection** detection. (Registration OCR-matching already shipped in M1;
  **Azure Custom Vision is not used** — retiring 2028.) Surface results against `image-rules` (≥2 EVA
  images, overview with visible plate, damage closeup); enforce **1 full-view + 1 damage-closeup**.
- Image-ordering UI in the Code App (drag to set the 2 preview images, validate before EVA).
- **WhatsApp media bulk import (timesaver — ADR-0007):** ingest a folder of exported WhatsApp media,
  OCR each image for the registration, auto-match/suggest to the open Case by **VRM**. (WhatsApp
  intake itself is manual — Business app.)

### Phase 3 — Enrichment via connectors + EVA export
- **Enrichment connectors (ADR-0006):** M1 = Azure Function calling **DVSA + DVLA directly via
  Entra `client_credentials` + X-API-Key** (no Google Cloud OAuth gateway / mcp-gateway):
  `current_mileage_estimate` (only when the document lacks mileage) + `get_vehicle_summary`.
  **Valuation** (`valuationbot` via collisionplugin) is **in scope at M2+** (later phase). Use
  `code-apps-preview:add-connector` / `list-connections`.
- **EVA export — full scope (ADR-0005):** generate the EVA JSON payload (the `cedocumentmapper_v2.0`
  12-field contract) for drag-drop (M1 + permanent fallback); **build & validate the Sentry API
  against the EVA test environment** (`EVA_BASE_URL` test/prod, `EVA_API_ENABLED` API/JSON), POSTing
  `/Instruction/Inspection` (JWT via `/Connect/token`, 5-min token, idempotency by payload hash).
  **Production cutover gated** by a parity test. Authoritative endpoints:
  [docs/architecture/eva-sentry-api.md](./docs/architecture/eva-sentry-api.md).
- **Box mirror — folder at parse-confirm, augmented at finalisation (Phase 7, ADR-0012):** folder =
  **UPPERCASE** Case/PO (e.g. `TEST26001`; EVA `test26001`), **minted at parse-confirm**
  (`box-folder-create`) once the Case/PO exists — not first created at EVA submit. `finalize-eva-box`
  then **augments** that folder, uploading evidence + EVA JSON in the EVA photo order. Box is a
  one-way mirror (Dataverse → Box; Dataverse authoritative); the pivot also adds File-Request image
  chasers + a webhook that advances the case on upload. _(All `BOX_*` gates currently off.)_

### Phase 5b/5c (later) — Azure AI + Document AI + LLM assist _(canonical ROADMAP; original sequence: "Phase 4")_
- Azure AI Vision: people/reflection detection + plate OCR (HTTP/custom connector, gated by
  `AZURE_VISION_ENABLED`). Azure Document Intelligence for PDF extraction. General LLM assist
  (classification/inspection-address ranking).
- **Copilot Studio** "Collision Engineers copilot" — **deferred to a later milestone (M3+)**,
  optional, gated `COPILOT_ENABLED`: staff assistant over Dataverse once core data exists
  (~$0–30/mo PAYG). Not in M1/M2.

### Parallel workstream — `cedocumentmapper_v2.0` (a standalone dual-target product — NOT a from-scratch rebuild)
**Status (2026-06-24):** the sibling `cedocumentmapper_v2.0` repo is **well past the old "~75%" snapshot**.
Its **engine core** — domain models, readers (PDF/DOCX/DOC/EML/MSG), provider detection, the **12-kind rule
engine**, normalisers, the **schema-validated EVA-JSON exporter**, v1→v2 config migration, pytest (241
passing) — is **complete and tested**, and is **vendored + live** in this repo's parser Function (see
[ADR-0018](docs/adr/0018-cedocumentmapper-dual-target-vendored-engine.md)). It has since added a **desktop
review GUI** (React + pywebview), **portable PyInstaller packaging** (`build.ps1`), an **opt-in extraction
orchestrator + offline LLM-assist**, and an **eval harness** — all **desktop/dev-only, deliberately NOT on
the cloud path**. So the original "Outstanding: review UI / packaging / CI" list is **superseded**:
- The sibling is a **dual-target product**: single-user **desktop** (portable exe) **and** a headless
  **engine-core for the cloud** (our Azure Function vendors it). Awareness/boundary: **ADR-0018**.
- **PyMuPDF licensed** (AGPL concern resolved — no remediation needed).
- Keep the engine-core's EVA projection **drag-drop-compatible**; the contract-parity guard
  (`ocr/tests/test_eva_map_in_sync_with_parser.py`) + the vendored-engine drift guard
  (`functions/parser/tests/test_engine_vendored_in_sync.py`) enforce it.
- **Residual sibling-side gaps** (theirs, not ours): legacy `.doc` via antiword + Word `.doc` export; OCR
  result caching; desktop GUI manual QA in a running pywebview window.
- **Integration path (M1 — ADR-0004):** wrap as an Azure Function → custom connector, gated by
  `PDF_MAPPER_ENABLED`, called inline by the Code App. The CLI remains for offline/batch use.

### Closing — docs
- Update this repo's `CLAUDE.md` with the chosen architecture, the repo-constellation map, and
  the spike↔collisioncc contract-sharing rule.

## Critical files & references
- Reuse/port: `collisioncc/src/lib/case-status.ts`, `collisioncc/src/lib/image-rules.ts`,
  `collisioncc/src/lib/graph-intake.ts`, `collisioncc/src/parser/*`, EVA export contract, and
  `.../eva/sentry_api_complete_guide.md`.
- Rebuild from: `cedocumentmapper/app.py`, `cedocumentmapper/providers.json`,
  `cedocumentmapper/docs/Final Format Example 02.json` (target JSON shape).
- Connectors: `connectors/{valuation-adverts-connector,evaconnector}` (M2+ reference only); M1 enrichment
  uses the spike's own Azure Function (direct DVSA/DVLA — no mcp-gateway).
- Skills to drive the build: `code-apps-preview:create-code-app`, `add-dataverse`,
  `add-sharepoint`, `add-office365`, `add-connector`, `list-connections`, `deploy`.

## Open questions to confirm at review
1. ~~**`collisioncc` integration depth.**~~ **RESOLVED:** collisioncc is reference/context only;
   the spike re-implements its contracts and does not call it at runtime.
2. ~~**Environment/licensing:**~~ **RESOLVED, then MIGRATED:** the spike originally ran in the
   **Collision Engineers - Dev** Power Platform Sandbox (env `b3090c42-…`, solution `CollisionSpike`/`cr1bd`,
   Code App `da7ba7af-…`). It has since been **migrated to the Azure PaaS stack** in subscription
   `e6076573-…` (resource group `rg-collisionspike-dev`, **uksouth**): Static Web App `cespk-spa-dev`, data
   API `cespk-api-dev`, orchestration `cespk-orch-dev`, Postgres `cespk-pg-dev`, plus the retained parser /
   enrichment / evasentry / evavalidation / ocr / box-webhook Functions, Key Vaults, and Blob
   `cespkevidstdev01`. **Licensing caveat (now the dominant constraint):** the subscription is an **Azure
   Free Trial** (quotaId `FreeTrial_2014-09-01`) — **the whole stack is disabled at the ~30-day mark unless
   upgraded to Pay-As-You-Go** (the 12-month free Postgres allowance survives the upgrade). The Power
   Platform tenant/licensing question is moot post-migration.
3. ~~**Scope of first milestone.**~~ **RESOLVED, then SUPERSEDED by the migration:** in the Power-Platform
   era email intake reached **live** — the `CS Intake` flow ran an `OnNewEmailV3` trigger on the connected
   `digital@` mailbox, with Provider Match + Case Resolve ON. That low-code intake was **decommissioned**
   with the platform. **On the Azure stack, live automated intake is currently PENDING:** the orchestration
   Function App `cespk-orch-dev` is **built but has zero functions deployed**, so today the system is
   **read-only + manual case-create only** (`case_ = 0`). The remaining work to re-light intake is
   deploying the Graph **delta-poll** orchestration + the **Exchange-RBAC** mailbox scoping on the 3 inboxes
   (ROADMAP *Now*). The parser, enrichment, OCR, EVA, and Box Functions were retained through the migration.

## Verification

_Re-homed onto the Azure stack; the domain assertions (status machine, image rules, EVA JSON shape, parser
byte-parity) are unchanged from the Power-Platform era._

- **SPA + data API (was "Code App"):** sign in to the **`cespk-spa-dev`** Static Web App with an Entra
  account holding **CollisionSpike.User/Admin**; confirm the SPA fetches over REST
  (`mockup-app/src/data/rest-client.ts`) from **`cespk-api-dev`**, which validates the JWT + app role and
  reads **Postgres** (`cespk-pg-dev`). With no live intake yet, the case list is correctly **empty**
  (`case_ = 0`); exercise the **manual case-create** path and confirm the row + correct status in Postgres.
  _Once orchestration + Exchange-RBAC intake are deployed, re-run with a sample email and confirm a `Case`
  appears with the right status._
- **Image AI:** upload a known overview+damage set; assert classification + **image-rules** validation
  (≥2 images, plate visible, one damage closeup) match expectations. _(Image-classification AI itself is a
  later phase; the rule engine runs now.)_
- **EVA gating:** confirm the JSON export matches `Final Format Example 02.json` (the 12-field contract);
  the Sentry call path is exercised via the **retained `evasentry` Function** behind its Key-Vault-backed
  enable flag against the EVA **test** env (no redeploy) — gated pending the Minotaur one-principal-code patch.
- **`cedocumentmapper_v2.0`:** `pytest` over fixture documents; the engine (vendored into the retained
  **parser Function**, `cespike-parser-dev`) produces JSON byte-compatible with the v1 EVA contract for the
  same input — enforced by the vendored-engine drift guard.
- **Migration parity + remediation:** run the migration parity harness (see [migration/](./migration/)) to
  confirm the Postgres seed matches the prior Dataverse corpus (work_provider 390 / repairer 32 /
  image_source 19 / inspection_address 2209); and track the **P0 DB-security remediation**, the
  **Free-Trial→PAYG** upgrade, and **staff app-role assignment** to closure (ROADMAP *Now / Next*).

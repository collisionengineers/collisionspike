# Plan: `collisionspike` — fast Power Platform spike of Collision Engineers admin workflow

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

The goal of this plan: stand up `collisionspike` as a **Power Apps Code App (React/Vite)** on
Power Platform that prototypes the core intake→enrich→EVA workflow, **reusing collisioncc's
proven contracts** (EVA payload, case-status, image-roles) so findings transfer to the mature
build. Two adjacent deliverables are folded in: rebuilding `cedocumentmapper` as a clean
`cedocumentmapper_v2.0` Python CLI, and gating the EVA integration (JSON-export now, Sentry API
later).

## Repository constellation (what exists, confirmed by exploration)

| Repo (in `C:\Users\Alex\Documents\GitHub\`) | What it is | Role for the spike |
|---|---|---|
| `collisionspike` (**this repo**) | Near-empty: `adminoverview.md`, `CLAUDE.md`, `.claude/settings.json` | **Build target** — the Power Apps Code App spike |
| `collisioncc` | Mature Next.js + Firebase/GCP app ("Command Centre"); Graph intake, parser+Document AI, image-rules, case-status, EVA Sentry submit | **Contract & architecture reference** (the future cloud version); source of the EVA payload shape, `case-status` states, `image-rules`, provider knowledge |
| `collisionplugin` (singular) | Claude plugin + **MCP connectors on Cloud Run**: `dvsa-mot` (mileage/history, 32 tools), `valuationbot` (comparable-advert valuation + PDF), `report-renderer`, `eva` (Sentry browser, currently disabled), `mcp-gateway` (OAuth) | **Connector functions the spike consumes** for enrichment |
| `cedocumentmapper` | 4,244-line Tkinter monolith: PDF/DOCX/DOC/EML/MSG → provider detection → 13-field map → EVA JSON; bundles Tesseract; no tests, no VCS history | **Rebuild → `cedocumentmapper_v2.0`** (library + CLI) |
| `collisionpdf`, `collisionautomation` | Parser-first FastAPI service; React/Vite UI prototype | Secondary references (parser pipeline, UI/runtime-gating patterns) |

## Locked decisions (from clarification)

- **Front end:** Power Apps **Code App (React/Vite)** — built via `code-apps-preview` skills.
- **Case store:** Reference the existing **SharePoint** job sheet; **mirror it into Dataverse**
  as the spike's working store (start read-only import; SharePoint remains source of record).
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
  cutover gated. **Box** finalises in unison with EVA submission (UPPERCASE Case/PO; EVA lowercase).
- **EVA image rule:** **1 full-view image (registration visible) + 1 damage closeup** (the 2 previews).
- **Audatex:** intake/integration **out of scope** for the spike (deferred entirely).
- **Tool boundary:** the tool ends at **EVA submission + Box** (the EVA handoff); the engineer
  assessment / report generation / return-to-client is **out of scope** (ADR-0008).
- **Valuation** (`valuationbot`): **in scope (M2)** — **on-demand** (staff-triggered, e.g.
  total-loss/disputed value): comparable search + evidence PDF attached as Evidence, gated
  `VALUATION_ENABLED`; same REST-wrapper pattern as DVSA.

## Recommended architecture (the spike)

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
  AI Builder            collisionplugin MCP            cedocumentmapper_v2.0
  (image classify)      connectors via mcp-gateway     (PDF → EVA-JSON, CLI now;
                        (mileage, valuation, EVA)        Azure Function + connector later)
                              │
                              ▼
                     EVA: JSON export now │ Sentry API when flag ON
```

**Why a Code App (not Canvas/model-driven):** chosen by the user, and it lets the spike **share
React/TypeScript domain code and contracts with `collisioncc`** (case-status, EVA payload,
image-roles) rather than reinventing them in Power Fx — maximising transfer to the mature build.

**Where logic lives:** keep heavy/business logic in typed TS modules in the Code App and in
Power Automate flows; use Dataverse for relational integrity/audit; gate integrations with
**Dataverse environment variables** (solution-packaged, per-environment, no redeploy).

## Workstreams (phased)

> **First milestone — M1 vertical slice (decided).** ONE mailbox → VRM-correlated Case →
> deterministic readiness checklist + Missing → manual Case/PO + drag-drop EVA JSON export. Minimal
> seeded corpus; inspection address as a manual field. **Parser wired inline (ADR-0004):**
> `cedocumentmapper_v2.0` runs as an Azure Function (custom connector, `PDF_MAPPER_ENABLED`) that the
> Code App calls on the instruction to pre-fill the 13 fields (staff review). Proves Code App +
> Dataverse + parser→EVA + the readiness gate end-to-end. **Images (M1):** stored + **manual role
> tagging**, with deterministic **OCR** (Tesseract via the parser function, or Azure Vision Read)
> auto-checking registration-visible — **OCR is for registration matching only in M1**; classification
> (overview/damage) + reflection detection are **deferred to M2** (ADR-0009). **DVSA enrichment (M1 — ADR-0006):** mileage (**only when the
> document lacks it — authoritative**) + vehicle make/model via a REST wrapper (Azure Function) over
> collisionplugin `dvsa-mot`, gated `ENRICHMENT_ENABLED`, staff-reviewed. **EVA (full scope):**
> drag-drop JSON is the M1 path; the Sentry API is developed against the **test env** (same URL; test
> credentials route to the test server; production cutover gated). **Box (M1):** folder = UPPERCASE
> Case/PO (EVA lowercase — `test26001` → `TEST26001`), created **in unison** with EVA submission.
> **Out of M1:** image-classification AI (overview/damage, reflection detection), valuation connector,
> full corpus governance, assistant/copilot, structured chasers, **EVA production cutover**. **Resolve
> PyMuPDF AGPL in M1.**

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
- Port shared **contracts** as TS modules: EVA payload (13 fields, 6-line address) and
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

### Phase 2 — Image classification (ADR-0009)
- **AI Builder image classification** (overview vs damage_closeup) — M2; **Azure OpenAI / Foundry
  vision** for **person/reflection** detection. (Registration OCR-matching already shipped in M1;
  **Azure Custom Vision is not used** — retiring 2028.) Surface results against `image-rules` (≥2 EVA
  images, overview with visible plate, damage closeup); enforce **1 full-view + 1 damage-closeup**.
- Image-ordering UI in the Code App (drag to set the 2 preview images, validate before EVA).
- **WhatsApp media bulk import (timesaver — ADR-0007):** ingest a folder of exported WhatsApp media,
  OCR each image for the registration, auto-match/suggest to the open Case by **VRM**. (WhatsApp
  intake itself is manual — Business app.)

### Phase 3 — Enrichment via connectors + EVA export
- **Enrichment connectors (ADR-0006 — REST wrapper / Azure Function over collisionplugin behind the
  OAuth gateway):** **DVSA `dvsa-mot` is pulled into M1** (`current_mileage_estimate` — only when the
  document lacks mileage — + `get_vehicle_summary`); **valuation** (`valuationbot`) is **in scope at
  M2**. Use
  `code-apps-preview:add-connector` / `list-connections`.
- **EVA export — full scope (ADR-0005):** generate the EVA JSON payload (the `cedocumentmapper_v2.0`
  13-field contract) for drag-drop (M1 + permanent fallback); **build & validate the Sentry API
  against the EVA test environment** (`EVA_BASE_URL` test/prod, `EVA_API_ENABLED` API/JSON), POSTing
  `/Instruction/Inspection` (JWT via `/Connect/token`, 5-min token, idempotency by payload hash).
  **Production cutover gated** by a parity test. Authoritative endpoints:
  [docs/architecture/eva-sentry-api.md](./docs/architecture/eva-sentry-api.md).
- **Box archival — in unison with EVA submission (M1):** folder = **UPPERCASE** Case/PO (e.g.
  `TEST26001`; EVA `test26001`); upload evidence + EVA JSON in the same finalisation step.

### Phase 4 (later) — Azure AI + Document AI + LLM assist
- Azure AI Vision: people/reflection detection + plate OCR (HTTP/custom connector, gated by
  `AZURE_VISION_ENABLED`). Azure Document Intelligence for PDF extraction. General LLM assist
  (classification/inspection-address ranking).
- **Copilot Studio** "Collision Engineers copilot" — **deferred to a later milestone (M3+)**,
  optional, gated `COPILOT_ENABLED`: staff assistant over Dataverse once core data exists
  (~$0–30/mo PAYG). Not in M1/M2.

### Parallel workstream — `cedocumentmapper_v2.0` (complete & harden — NOT a from-scratch rebuild)
**Correction:** the sibling `cedocumentmapper_v2.0` repo is **already ~75% built** — a clean,
layered, contract-first Python library + CLI (~5,100 LOC): domain models, readers
(PDF/DOCX/DOC/EML/MSG), provider detection, a **12-kind rule engine**, normalisers, a
**schema-validated 13-field EVA-JSON exporter**, v1→v2 config migration, and pytest are done
(EPIC-01→07). The work is to **complete and harden**, not rewrite:
- Outstanding: review UI (0%), **regression corpus harness** (~30%), packaging (~20%), CI/CD (0%).
- **Resolve the PyMuPDF (AGPL) licensing risk** before any closed-source distribution (swap to
  pdfplumber/Poppler or buy a commercial licence).
- Keep the **13-field → EVA JSON** contract drag-drop-compatible.
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
- Connectors: `collisionplugin/connectors/{dvladvsa,valuation-tool,eva,mcp-gateway}`.
- Skills to drive the build: `code-apps-preview:create-code-app`, `add-dataverse`,
  `add-sharepoint`, `add-office365`, `add-connector`, `list-connections`, `deploy`.

## Open questions to confirm at review
1. ~~**`collisioncc` integration depth.**~~ **RESOLVED:** collisioncc is reference/context only;
   the spike re-implements its contracts and does not call it at runtime.
2. **Environment/licensing:** is there a Power Platform environment with Dataverse + a premium/
   AI Builder capacity available, and an Azure subscription for the later phases?
3. **Scope of first milestone:** is Phase 0–1 (intake + Dataverse mirror) the first shippable
   spike, with image AI / connectors / EVA as fast-follows?

## Verification
- **Code App:** `code-apps-preview:deploy` to the Power Platform environment; load the app, run a
  sample email through the intake flow, confirm a `Case` appears in Dataverse with correct status
  and the SharePoint mirror dashboard reflects "ready/missing".
- **Image AI:** upload a known overview+damage set; assert AI Builder classification and
  image-rules validation (≥2 images, plate visible) match expectations.
- **EVA gating:** with `EVA_API_ENABLED=false`, confirm JSON export matches
  `Final Format Example 02.json`; flip the flag in a test environment and confirm the Sentry
  call path (mock endpoint) without redeploying.
- **`cedocumentmapper_v2.0`:** `pytest` over fixture documents; CLI `extract` on a real provider
  PDF produces JSON byte-compatible with the v1 EVA contract for the same input.

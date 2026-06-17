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
  **not** call collisioncc at runtime; it is the source of truth for contracts, domain model, EVA
  payload shape, case-status, image-rules, and provider knowledge that the spike re-implements.
- **`collisionplugin`** MCP connectors are consumed at runtime for enrichment (mileage, valuation).
- **Image AI:** **AI Builder first** (overview-vs-damage classification, registration-visible
  check). **Azure AI Vision** (people/reflection detection, plate OCR) and **Azure Document
  Intelligence** + general LLM assist are **explicitly later phases**.
- **EVA:** **gated** — JSON drag-drop export now; **Sentry API behind a feature flag** until EVA's
  developers enable/stabilise it (currently in testing).

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
> Dataverse + parser→EVA + the readiness gate end-to-end. **Out of M1:** image AI, enrichment
> connectors, Sentry API, full corpus governance, assistant, chasers. **Resolve PyMuPDF AGPL in M1.**

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
  (`always_image_based`/`prefer_address`/`required_address`); **ranked candidates** with evidence;
  **no silent "Image Based Assessment"** fallback; signal fusion (instruction text → corpus → OCR
  phone/email → EXIF/GPS → history → vision clues). Spec:
  [docs/requirements/inspection-address.md](./docs/requirements/inspection-address.md).

### Phase 2 — Image classification (AI Builder first)
- AI Builder **image classification** (overview vs damage_closeup) + object/text detection for
  **registration-visible** check; surface results against `image-rules` (≥2 EVA images, overview
  with visible plate, damage closeup). Enforce the **two-preview-then-full-sequence upload order**
  and the **no-person-reflection** rule (Phase 3 adds robust people detection).
- Image-ordering UI in the Code App (drag to set the 2 preview images, validate before EVA).

### Phase 3 — Enrichment via connectors + EVA export
- **Custom connectors** for the `collisionplugin` MCP services through `mcp-gateway`:
  `dvsa-mot` (mileage from MOT, vehicle history), `valuationbot` (Companion-Report-style
  valuation evidence). Use `code-apps-preview:add-connector` / `list-connections`.
- **EVA export (gated):** generate the EVA JSON payload (the `cedocumentmapper_v2.0` 13-field
  contract) for drag-drop now; when `EVA_API_ENABLED` is true, POST to Sentry `/Instruction/Inspection`
  (JWT via `/Connect/token`, 5-min token, idempotency by payload hash). Authoritative endpoints:
  [docs/architecture/eva-sentry-api.md](./docs/architecture/eva-sentry-api.md).
- Box archival (folder named by Case/PO) — stub/defer to align with collisioncc.

### Phase 4 (later) — Azure AI + Document AI + LLM assist
- Azure AI Vision: people/reflection detection + plate OCR (HTTP/custom connector, gated by
  `AZURE_VISION_ENABLED`). Azure Document Intelligence for PDF extraction. General LLM assist
  (classification/inspection-address ranking).

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

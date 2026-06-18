# ROADMAP — collisionspike

_Phase-1 (M1) case-intake spike for **Collision Engineers** (UK vehicle-damage assessment) on the **Microsoft stack** — Power Apps **Code App** + Dataverse + Power Automate + Azure Functions. Last updated **2026-06-18**._

_Companion docs: [README.md](./README.md) · [PLAN.md](./PLAN.md) · [CURRENT_STATUS.md](./CURRENT_STATUS.md) (single source of truth for "where are we now") · [DEPLOY-RUNBOOK.md](./DEPLOY-RUNBOOK.md) (deploy sequence + blockers) · ADRs in [docs/adr/](./docs/adr/)._

> This roadmap is comprehensive: the early phases are largely **complete** because the M1 vertical slice was built offline and much of the non-inbox deploy is already executed in the dedicated Sandbox. The frontier is **live activation** (operator), **enrichment + EVA/Box**, and the **provider-corpus incorporation**.

---

## Legend

- `[x]` **done** — built and/or deployed; verified per CURRENT_STATUS / the offline gate.
- `[ ]` **remaining** — not yet built or not yet activated.
- 🔒 **operator-gated** — crosses the live-services boundary (touches the live Outlook shared inboxes, live SharePoint job sheet, live Box, or live EVA, or injects real secrets). **Claude builds offline; the operator activates.**
- ⚙️ **deployed but gated-OFF** — shipped to the Sandbox in a disabled state by design (env-var gate `false` / flow `state=off`).

**Two hard principles:**
1. **Offline build vs operator activation** — anything inbox/SharePoint/Box/EVA + all live tests + real secret injection are the operator's, in DEPLOY-RUNBOOK order.
2. **No mock/seed case data in the app** — the Code App renders **real Dataverse rows only**. The empty intake list is correct until the operator turns on email intake; it is never "fixed" with sample cases.

---

## Now / Next / Later

**Now (operator, single highest-value step)** — activate **live email intake for ONE shared mailbox**: bind the Outlook shared-mailbox connection, bind the Dataverse + parser connection references, turn ON the `intake` + `classify-persist` + `parse` flows, send a test email, watch a real Case appear (DEPLOY-RUNBOOK §7). This is what makes "emails populate the app."

**Next** — (a) incorporate the **provider corpus** + **clarifying-info** into Sandbox Dataverse (the two plans in `plans/`, `[DEPLOY-WITH-LOGIN]`, pure data, no inbox contact); (b) activate **enrichment** (DVSA/DVLA creds → Key Vault, `DVSA_TENANT_ID`, flip `ENRICHMENT_ENABLED` in a test env); (c) drive the **EVA M1 JSON drag-drop** path end-to-end into the EVA **test** environment + **Box** archival.

**Later** — **EVA Sentry REST API**, **address-matching service** (resolve part-postcodes → inspection address), **chaser automation** (draft-only), **OCR for scanned PDFs** ("B-full", Azure Container Apps), and the full **§7 live-validation checklist** across all three mailboxes.

---

## Phase 0 — Foundations _(complete)_

- [x] Repo, requirements, Microsoft-stack research, phased PLAN distilled into `docs/` + `PLAN.md`.
- [x] **ADRs 0001–0011** recorded.
- [x] **Power Apps Code App** scaffolded (React + Vite + Fluent v9) in `mockup-app/`.
- [x] **Shared contracts** ported as typed TS — EVA payload (**12 fields**, 6-line address), case-status state machine, image-rules.
- [x] **Domain logic** in typed TS — classification, **ADR-0010 dedup ladder**, provider-match, address-policy.
- [x] **Data seam** built — mock↔Dataverse swap + field adapter; app shows real rows only.
- [x] **Dataverse schema-as-code** authored (`dataverse/`); parity test.
- [x] **Env-var feature gates** defined.
- [x] **Offline verification gate** green — `node verify-all.mjs` → 6 gates.
- [x] **Boundary-compliance gates** authored — no live calls in the app; no secret values in the repo; all flows `off`.

---

## Phase 1 — Intake & Case Tracking (M1 vertical slice) _(mostly done; live email intake awaits the operator)_

### 1a. Parser (cedocumentmapper_v2.0 → Azure Function)

- [x] Parser engine **vendored** into the Function package (text PDF/DOCX/DOC/EML/MSG).
- [x] **Parser Function live** on Azure **Flex Consumption (FC1)**, function-level auth, ≈£0 idle.
- [x] **Live-verified extraction** into the **12-field EVA contract**.
- [x] **Parser adapter** maps legacy sibling fields → EVA keys.
- [x] **Parser custom connector** created.
- [x] **PyMuPDF AGPL** concern **resolved**.
- [ ] **B2 — telephone / email fields** arrive **empty** (staff fill). Confirm with **document-parser-engineer**. _Optional for M1; required for full auto-fill._

### 1b. Dataverse schema in Sandbox

- [x] **Schema built** in Sandbox `Collision Engineers - Dev` — solution `CollisionSpike`, prefix `cr1bd`: **11 tables**, 19 choice sets, 15 relationships, 3 alt keys, 11 env-vars.
- [x] EVA secrets **Key-Vault-typed, no values**; `ENRICHMENT_ENABLED` imported **`false`** per-env.

### 1c. Code App (live)

- [x] **B4 cleared** — Code Apps enabled + maker licensed; `pac code push` succeeds.
- [x] **Code App deployed + live**, wired to **live Dataverse**.
- [x] **Manual-intake path** works: upload → parse → create real **Case**.
- [x] **Logo / brand fonts / Dashboard nav fixed**; `npm run build` green.
- [x] **"Emails don't populate" diagnosed** — not an app bug; intake flow `off` + unbound connectors; fix = operator activation, **not** mock data.

### 1d. Flows (imported OFF)

- [x] **10 cloud flows imported `state=off`**; connection refs unbound.
- [x] **Intake flow guards** — `MinIntakeDate` (2026-06-17) + temporary attachment filter.
- [x] **Dedup ladder (ADR-0010)** encoded in `case-resolve`.

---

## Phase 1b — Provider Corpus & Inspection-Address Data _(seed done; incorporation + clarifying-info planned, not yet loaded)_

`[DEPLOY-WITH-LOGIN]` (pure Dataverse data — no inbox/SharePoint/Box/EVA contact).

### 1b.1 Initial seed + analysis _(done)_

- [x] **Provider corpus seeded** — `WorkProvider` (45), `Repairer` (38), `ImageSource` (4) + N:N.
- [x] **Provider/garage/location data analysis** (2026-06-18) — `raw/principalandrepairersheets/outputs/`, reproducible via `outputs/_scripts/run_all.py`.
- [x] Actionable outputs: `provider_corpus_recommendation.csv`, `loc_principal_analysis.md`, `principal_address_worklist.md`.

### 1b.2 Corpus incorporation (per `plans/dataverse-corpus-incorporation.md`) _(planned — not loaded)_

- [ ] `10-seed-workprovider.ps1` — refresh `WorkProvider` from `provider_corpus_recommendation.csv` (upsert on `principalcode`; SEED→active, ARCHIVE→inactive; derive name from address; don't overwrite domains/toggles).
- [ ] `11-seed-repairers.ps1` — confirmed shared yards + garage↔REPAIRER matches → `Repairer` (upsert on name+postcode).
- [ ] `12-seed-inspection-sites.ps1` — repeated full postcodes (`count>=3`) → `InspectionAddress` reference rows (`confirmed_physical`).
- [ ] `13-link-imagesources.ps1` — `ImageSource(kind=repairer)` per yard; idempotent N:N to each linked `WorkProvider`.
- [ ] `14-verify-corpus.ps1` — post-run validation + idempotency re-run.
- [ ] **Deliberately excluded** (deferred): partial postcodes, paper providers, red-herrings, REVIEW unknowns, unconfirmed code-drift, note-mining.

### 1b.3 Clarifying-info ingestion (per `plans/clarifying-info-ingestion.md`) _(planned — awaits operator worklists)_ 🔒

- [ ] 🔒 **Input 3** — code reconciliation (canonical `principalCode`).
- [ ] 🔒 **Input 5** — the 137 active-but-off-jobsheet principals (CONSIDER decisions).
- [ ] 🔒 **Input 1** — confirmed full addresses for part-postcode districts → `Repairer` known-sites + N:N; fast-confirm path.
- [ ] 🔒 **Input 4** — garage↔provider coverage → N:N.
- [ ] 🔒 **Input 2** — intermediary confirmations → `ImageSource(kind=intermediary)`; de-collide `knownEmailDomains`.

---

## Phase 2 — Live Activation _(operator — the live-services boundary)_ 🔒

`[RESERVED-FOR-USER]` — after the non-inbox deploy is green, **one mailbox first**, in DEPLOY-RUNBOOK §7 order.

- [ ] 🔒 **Bind the Outlook shared-mailbox connection** + Dataverse + parser connection references.
- [ ] 🔒 **Turn ON `intake` + `classify-persist` + `parse` for ONE inbox.**
- [ ] 🔒 **Send a test email** (PDF + 2 images: overview with legible plate + damage closeup).
- [ ] 🔒 **Confirm a Case appears**; status `new_email → ingested`; provider matched by sender domain; 12 fields pre-filled with provenance.
- [ ] 🔒 **Confirm Outlook categories** applied.
- [ ] 🔒 **Confirm dedup live** (ADR-0010).
- [ ] 🔒 **Provider-matching live validation** — intermediary domain does **not** auto-match.
- [ ] 🔒 **Scale to all three inboxes** — only after single-mailbox success.

---

## Phase 3 — Enrichment & EVA Sentry _(enrichment deployed gated-OFF; EVA M1 path awaits activation; REST later)_

### 3a. Enrichment (DVSA/DVLA)

- [x] **Enrichment Function deployed** ⚙️ **gated-OFF**.
- [x] **Direct DVSA + DVLA** path; **Google Cloud gateway retired**. **B1 obviated.**
- [x] Enrichment **custom connector** + Bicep + mocked pytest; live-verified gate behaviour.
- [ ] 🔒 **Inject DVSA/DVLA creds** into Key Vault + set `DVSA_TENANT_ID`.
- [ ] 🔒 **Register/consent the Entra app**.
- [ ] 🔒 **Flip `ENRICHMENT_ENABLED=true`** in a **test** env; verify mileage (only when the document lacks it — ADR-0006) + make/model.

### 3b. EVA — JSON drag-drop (M1 path + permanent fallback)

- [x] **12-field EVA JSON serializer** built; exact order, 6-line address, enums.
- [x] **B3 resolved** — contract is **12 fields**.
- [x] `finalize-eva-box` flow built, imported `off`.
- [ ] 🔒 **Export 12-field JSON, drag-drop into EVA test**; confirm acceptance.

### 3c. EVA — Sentry REST API (later)

- [ ] **Build the Sentry REST submit path** (v1.2) — token, Instruction/Inspection, two-request photo submission, idempotency by payload hash.
- [ ] 🔒 **B5 — EVA test credentials** → Key Vault; flip `EVA_API_ENABLED=true` in test.
- [ ] 🔒 **Production cutover** — gated behind a parity test; operator-confirmed.

### 3d. Box archival

- [x] `finalize-eva-box` builds the Box folder + photo-order step — imported `off`.
- [ ] 🔒 **B5 — confirm Box honours the UPPERCASE Case/PO folder name**.
- [ ] 🔒 **Activate Box archival** in unison with EVA submit; photo order verified.

### 3e. EVA readiness gate (offline-built)

- [x] **Image-rules / readiness checklist** in the Code App.
- [ ] 🔒 **Drive the readiness checklist to green on a live Case**; Address decision gate (override-with-reason).
- [ ] 🔒 **Confirm AuditEvent rows** for ingest / review / submit.

---

## Phase 4 — Address-Matching & Chaser _(policy gate built; matching service + chaser automation remain)_

### 4a. Inspection-address matching

- [x] **Address-policy gate** in the Code App — per-provider policy; no silent "Image Based Assessment".
- [x] **Known-site reference data** modelled (`InspectionAddress` + `Repairer`); seeded by Phase 1b.
- [ ] **Address-matching service** — resolve a Case's part-postcode `Loc` (57% of cases) → the linked yard's full address (district `startswith(outwardCode)` over the corpus) → `InspectionAddress` → EVA field 9. Honours `AZURE_MAPS_ENABLED=false` → **postcode.io**.
- [ ] **Azure Maps (gated)** — only if needed (later).

### 4b. Chaser automation (channel-aware — ADR-0003)

- [x] `chaser-draft` flow built (imported `off`); **draft-only** behind the outbound kill switch; WhatsApp drafted for manual send only.
- [ ] 🔒 **Activate draft-only chasers** — confirm a chaser **drafts** (never sends), targeting the right garage.
- [ ] **Wire chaser targeting** to the garage↔provider coverage (N:N) once Phase 1b.3 Input 4 is loaded.

---

## Phase 5 — OCR & Scale _(deferred)_

### 5a. OCR for scanned PDFs ("B-full")

- [x] **Scope decided** — FC1 can't run Tesseract; OCR deferred to **Azure Container Apps**.
- [ ] **B-full — OCR host on Azure Container Apps** — OCR for scanned-image PDFs; registration matching in M1. _(Task #9.)_

### 5b. Image classification AI (ADR-0009 — M2+)

- [ ] **AI Builder image classification** (overview vs `damage_closeup`).
- [ ] **Azure OpenAI / Foundry vision** for **person / reflection detection** (Custom Vision explicitly not used — retiring 2028).
- [ ] **Image-ordering UI** — drag to set the 2 preview images.
- [ ] **WhatsApp media bulk import (ADR-0007)** — OCR each for the registration, auto-match to the open Case by VRM.

### 5c. Valuation & Copilot (M2 / M3+)

- [ ] **Valuation (`valuationbot`, gated `VALUATION_ENABLED`)** — staff-triggered; evidence PDF attached.
- [ ] **Copilot Studio agent (gated `COPILOT_ENABLED`)** — staff assistant over Dataverse.

---

## Phase 6 — Boundary Evidence & Handoff _(gates green; final live evidence pending)_

- [x] **Offline gate green** — `verify-all.mjs` 6/6.
- [x] **Static grep gate** / **flow-state assertion** / **no-credentials assertion**.
- [ ] 🔒 **Connection inventory** — `pac connection list` (operator evidence at activation).
- [ ] 🔒 **Deploy log** — record every `[DEPLOY-WITH-LOGIN]` + `[RESERVED-FOR-USER]` action.
- [ ] 🔒 **§7 live-validation checklist complete** across all three mailboxes — the M1 "done" definition.

---

## Blocker tracker (DEPLOY-RUNBOOK §0)

| ID | What | State |
|---|---|---|
| **B1** | Gateway grant | **Obviated** ✅ — direct DVSA/DVLA. Remaining = inject creds + `DVSA_TENANT_ID` (operator). |
| **B2** | Parser telephone/email | **Partial** — 2 EVA fields empty (staff fill); needs sibling parser change. |
| **B3** | 13th EVA field | **Resolved** ✅ — contract is 12 fields. |
| **B4** | Code Apps enablement | **Resolved** ✅ — enabled; app pushed. |
| **B5** | EVA test creds + Box casing | **Open** 🔒 — operator. |
| **B-full** | OCR for scanned PDFs | **Deferred** — Azure Container Apps. |

---

### What "done" looks like for M1

> A real email in one shared inbox becomes a tracked **Case**, is parsed + (optionally) enriched into the **12 EVA fields** with provenance, passes a human readiness review, and is exported to **EVA** as drag-drop JSON with a **Box** archive folder — with dedup, provider matching, and the inspection-address gate all behaving per the offline decision-table tests.

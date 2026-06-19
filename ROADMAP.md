# ROADMAP — collisionspike

_Phase-1 (M1) case-intake spike for **Collision Engineers** (UK vehicle-damage assessment) on the **Microsoft stack** — Power Apps **Code App** + Dataverse + Power Automate + Azure Functions. Last updated **2026-06-19**._

_Companion docs: [README.md](./README.md) · [PLAN.md](./PLAN.md) · [CURRENT_STATUS.md](./CURRENT_STATUS.md) · [DEPLOY-RUNBOOK.md](./DEPLOY-RUNBOOK.md) · [docs/gated.md](./docs/gated.md) · plans under [docs/plans/](./docs/plans/) · ADRs in [docs/adr/](./docs/adr/)._

> **Role split.** This **ROADMAP** is the forward phased checklist (per-phase done/remaining).
> [CURRENT_STATUS.md](./CURRENT_STATUS.md) is what is live *now*. [docs/gated.md](./docs/gated.md) is
> everything that needs the operator (hard/soft blockers). The canonical phase taxonomy is the
> **Phase 0–6** used here; each phase's ordered build checklist lives in
> [docs/plans/&lt;phase&gt;/README.md](./docs/plans/README.md).

> This roadmap is comprehensive: the early phases are largely **complete** because the M1 vertical slice was built offline and much of the non-inbox deploy is already executed in the dedicated Sandbox. The frontier is **live activation** (operator), **enrichment + EVA/Box**, and the **provider-corpus incorporation**.

> **2026-06-19 progress** — (1) **CE Parser connector wired + bound**: the custom connector now exposes `api_key`, a Connected connection exists (`01b43be8…`), the Code App calls the parser through it (`CollisionEngineersParserService` + `parser-connector-transport.ts`), and the old raw-fetch path (`parser-config.ts`) was deleted — so **manual-intake parse is no longer CSP-blocked** and the function key is off the client bundle (204/204 app tests; rebuilt + pushed). (2) **Provider-corpus incorporation (1b.2) LOADED** — scripts 10–14 + verify all passed (WorkProvider 390 updated, 20 named yards, 174 InspectionAddress rows, 20 ImageSource + 98 N:N); **37 over-length principal codes deferred** (widen `cr1bd_principalcode` or supply ≤8-char codes), GGP→GG / ZEN==ZENITH merges deferred. (3) **Built this session, gated-OFF, deploy pending**: EVA Sentry REST v1.2 (`functions/evasentry`, pytest 42/42), inspection-address matching Function (`functions/addressmatch`), OCR host (`ocr/`, ACA — no longer deferred), parser B2 claimant telephone/email extraction, plans for every remaining phase, and hardened IaC (workspace App Insights, no shared-key storage). **Azure deploys for evasentry/addressmatch/ocr + the parser REDEPLOY and the Phase-1 flow-chain activation on `digital@` remain pending.**

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

**Next** — (a) the **provider corpus** is now **incorporated** (1b.2 done 2026-06-19); the **clarifying-info** second phase remains (the plan in `plans/`, `[DEPLOY-WITH-LOGIN]`, pure data, no inbox contact); (b) activate **enrichment** (DVSA/DVLA creds → Key Vault, `DVSA_TENANT_ID`, flip `ENRICHMENT_ENABLED` in a test env); (c) drive the **EVA M1 JSON drag-drop** path end-to-end into the EVA **test** environment + **Box** archival.

**Later** — **EVA Sentry REST API**, **address-matching service** (resolve part-postcodes → inspection address), and **OCR for scanned PDFs** ("B-full", Azure Container Apps) are now **built (deploy pending)**; **chaser automation** (draft-only) and the full **§7 live-validation checklist** across all three mailboxes remain.

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
- [x] **B2 — claimant telephone / email fields** now **extracted** by the parser into the EVA fields with provenance + tests (was: arrive empty / staff fill). _(built + **REDEPLOYED live 2026-06-19**; `/api/parse` verified extracting `claimant_telephone`/`claimant_email`, and the EVA schema is now vendored in-package so no spurious `schema_unavailable` issue.)_

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

## Phase 1b — Provider Corpus & Inspection-Address Data _(seed + incorporation done; clarifying-info second phase remains)_

`[DEPLOY-WITH-LOGIN]` (pure Dataverse data — no inbox/SharePoint/Box/EVA contact).

### 1b.1 Initial seed + analysis _(done)_

- [x] **Provider corpus seeded** — `WorkProvider` (45), `Repairer` (38), `ImageSource` (4) + N:N.
- [x] **Provider/garage/location data analysis** (2026-06-18) — `raw/principalandrepairersheets/outputs/`, reproducible via `outputs/_scripts/run_all.py`.
- [x] Actionable outputs: `provider_corpus_recommendation.csv`, `loc_principal_analysis.md`, `principal_address_worklist.md`.

### 1b.2 Corpus incorporation (per `plans/dataverse-corpus-incorporation.md`) _(LOADED — scripts 10–14 + verify all passed 2026-06-19)_

- [x] `10-seed-workprovider.ps1` — `WorkProvider` **390 updated** (`Corpus 2026-06-18` provenance; SEED→active / ARCHIVE→inactive; name from address; domains/toggles preserved); 11 excluded, 2 review-skipped, 12 placeholder names. **37 principal codes >8 chars deferred** (operator must widen `cr1bd_principalcode` or supply canonical ≤8-char codes); GGP→GG and ZEN==ZENITH merges deferred to the clarifying-info phase.
- [x] `11-seed-repairers.ps1` — **20** named full-postcode yards + **14** garage↔REPAIRER matches → `Repairer`.
- [x] `12-seed-inspection-sites.ps1` — `InspectionAddress` **174** rows, all Confirmed Physical, all with postcodes.
- [x] `13-link-imagesources.ps1` — `ImageSource(kind=repairer)` **20**, with **98** WorkProvider N:N links.
- [x] `14-verify-corpus.ps1` — all 14-verify checks PASSED; idempotent re-run = no-op.
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

- [x] **Build the Sentry REST submit path** (v1.2) — `functions/evasentry`: two-request EVA `Files` submission (`/Instruction/Inspection` then `/Note/SubmitNote`), payload-hash idempotency; pytest **42/42**; `finalize-eva-box` refined. _(built; gated-OFF, Azure deploy pending.)_
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
- [x] **Address-matching service** — `functions/addressmatch`: resolve a Case's part-postcode `Loc` (57% of cases) → the linked yard's full address (district `startswith` over the corpus) → `InspectionAddress` → EVA field 9; honours `AZURE_MAPS_ENABLED=false` → **postcode.io**. _(**deployed live 2026-06-19** — `cespkaddr-fn-i7m4re`, `POST /api/match-address` verified: district match + postcode.io reachable.)_
- [ ] **Azure Maps (gated)** — only if needed (later).

### 4b. Chaser automation (channel-aware — ADR-0003)

- [x] `chaser-draft` flow built (imported `off`); **draft-only** behind the outbound kill switch; WhatsApp drafted for manual send only.
- [ ] 🔒 **Activate draft-only chasers** — confirm a chaser **drafts** (never sends), targeting the right garage.
- [ ] **Wire chaser targeting** to the garage↔provider coverage (N:N) once Phase 1b.3 Input 4 is loaded.

---

## Phase 5 — OCR & Scale _(deferred)_

### 5a. OCR for scanned PDFs ("B-full")

- [x] **Scope decided** — FC1 can't run Tesseract; OCR deferred to **Azure Container Apps**.
- [x] **B-full — OCR host built** (`ocr/`, no longer deferred) — scanned/image-PDF fallback; Dockerfile + Azure Container Apps Bicep + plate/pdf adapters.
- [x] **OCR image built + pushed to ACR** (2026-06-19) — `ce-ocr:latest` in `cespkocracraeee76` (built via **WSL-root docker**, working around the subscription's ACR-Tasks block + no local Docker). _(the hard part — the image carrying `tesseract` + `fast-alpr` is ready.)_
- [ ] **OCR ACA host deploy** — **failed 3× (`Failed to provision revision … Operation expired`, ~20 min each)** then rolled back; bicep needed `DOCKER_REGISTRY_SERVER_URL` (bare hostname). Adapters lazy-import, so not a startup crash → likely the **AcrPull RBAC-propagation race** or an ingress health-probe mismatch. **Next:** a pre-granted **user-assigned MI** for AcrPull (2-step: identity+role first, then the site) **or** ACA revision-log diving. Failed-deploy scaffolding (env/storage/AI/LAW) **cleaned up** (ACR + image kept) per the no-idle-infra stance. See `docs/review-followups-2026-06-19.md`.

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

> The consolidated hard/soft operator registry is **[docs/gated.md](./docs/gated.md)**. The table
> below is the M1 deploy-blocker snapshot.

| ID | What | State |
|---|---|---|
| **B1** | Gateway grant | **Obviated** ✅ — direct DVSA/DVLA. Remaining = inject creds + `DVSA_TENANT_ID` (operator). |
| **B2** | Parser telephone/email | **Done** ✅ — parser REDEPLOYED 2026-06-19; `/api/parse` live-verified extracting `claimant_telephone`/`claimant_email`. |
| **B3** | 13th EVA field | **Resolved** ✅ — contract is 12 fields. |
| **B4** | Code Apps enablement | **Resolved** ✅ — enabled; app pushed. |
| **B5** | EVA test creds + Box casing | **Open** 🔒 — operator. |
| **B-full** | OCR for scanned PDFs | **Image built + pushed** ✅ (`ce-ocr:latest` in ACR); **ACA host deploy pending** — revision provisioning expired 3× (AcrPull race / health probe), needs user-assigned-MI pull or log diving. |

---

### What "done" looks like for M1

> A real email in one shared inbox becomes a tracked **Case**, is parsed + (optionally) enriched into the **12 EVA fields** with provenance, passes a human readiness review, and is exported to **EVA** as drag-drop JSON with a **Box** archive folder — with dedup, provider matching, and the inspection-address gate all behaving per the offline decision-table tests.

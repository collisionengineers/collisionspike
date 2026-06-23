# ROADMAP — collisionspike

_Phase-1 (M1) case-intake spike for **Collision Engineers** (UK vehicle-damage assessment) on the **Microsoft stack** — Power Apps **Code App** + Dataverse + Power Automate + Azure Functions. Last updated **2026-06-22**._

_Companion docs: [README.md](./README.md) · [PLAN.md](./PLAN.md) · [CURRENT_STATUS.md](./CURRENT_STATUS.md) · [DEPLOY-RUNBOOK.md](./DEPLOY-RUNBOOK.md) · [docs/gated.md](./docs/gated.md) · milestone map [docs/plans/milestone-model.md](./docs/plans/milestone-model.md) · plans under [docs/plans/](./docs/plans/) · ADRs in [docs/adr/](./docs/adr/)._

> **Role split.** This **ROADMAP** is the forward phased checklist (per-phase done/remaining).
> [CURRENT_STATUS.md](./CURRENT_STATUS.md) is what is live *now*. [docs/gated.md](./docs/gated.md) is
> everything that needs the operator (hard/soft blockers). The canonical phase taxonomy is the
> **Phase 0–6** used here, **plus the later additive Phase 7** (the Box-centric intake pivot, ADR-0012);
> each phase's ordered build checklist lives in
> [docs/plans/&lt;phase&gt;/README.md](./docs/plans/README.md).

> This roadmap is comprehensive: the early phases are largely **complete** because the M1 vertical slice was built offline and much of the non-inbox deploy is already executed in the dedicated Sandbox. The frontier is **live activation** (operator), **enrichment + EVA/Box**, and the **provider-corpus incorporation**.

> **2026-06-19 progress** — (1) **CE Parser connector wired + bound**: the custom connector now exposes `api_key`, a Connected connection exists (`01b43be8…`), the Code App calls the parser through it (`CollisionEngineersParserService` + `parser-connector-transport.ts`), and the old raw-fetch path (`parser-config.ts`) was deleted — so **manual-intake parse is no longer CSP-blocked** and the function key is off the client bundle (204/204 app tests; rebuilt + pushed). (2) **Provider-corpus incorporation (1b.2) LOADED** — scripts 10–14 + verify all passed (WorkProvider 390 updated, 20 named yards, 174 InspectionAddress rows, 20 ImageSource + 98 N:N); **37 over-length principal codes deferred** (widen `cr1bd_principalcode` or supply ≤8-char codes), GGP→GG / ZEN==ZENITH merges deferred. (3) **Built this session, gated-OFF, deploy pending**: EVA Sentry REST v1.2 (`functions/evasentry`, pytest 42/42), OCR host (`ocr/`, ACA — no longer deferred), parser B2 claimant telephone/email extraction, plans for every remaining phase, and hardened IaC (workspace App Insights, no shared-key storage). _(A runtime inspection-address matcher was also built this session but was later **removed root-and-stem 2026-06-23** — built on a misreading; the inspection address is now offline-derived full-address suggestions + manual confirm, ADR-0013.)_ **Azure deploys for evasentry/ocr + the parser REDEPLOY and the Phase-1 flow-chain activation on `digital@` remain pending.**

> **2026-06-20 progress** — **M2 mega-build + deploys.** Authored the authoritative **[docs/plans/milestone-model.md](./docs/plans/milestone-model.md)** (retired the *"M2 = Phases 3–5"* shorthand that caused the M1/M2 overlap; valuation reconciled to **M3**) + the 3 missing M2 plans + Copilot/WhatsApp/multi-inbox/storage/architecture docs. **7 verified code slices** (`node verify-all.mjs` **7/7**): dashboard funnel re-cut (the "Submitted" overlap fix), the live **FIX-3** status mirror in `case-status.ts`, the **suggested-locations** panel, reg-OCR + flows (anchored match, **S2** Box content-bind + fictional-`CreateFolder` fix) + **S4/S5/S7/S8** hardening. **Deployed to the sandbox gated-OFF, no creds:** **Document Intelligence** (`cespkdocintel-dev`, online), **evasentry** (`cespkeva-fn-ufa3ci`, Running), parser+enrichment storage hardened live (S7). **Loaded 697 suggested InspectionAddress rows** (decisionMode=Unknown; 17-verify all passed). **evavalidation** (M2.B) deployed + Running (`cespkeval-fn-6c6fxd`) — the FC1 plan-create rate-throttle cleared after a cooldown; only the `status-evaluate` repoint remains. Operator items in **[docs/gated.md](./docs/gated.md)** (H13 3-case re-run, H14 DI key, S12–S14). Detail in **[CURRENT_STATUS.md](./CURRENT_STATUS.md)**.

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

**Next** — (a) the **provider corpus** is now **incorporated** (1b.2 done 2026-06-19); the **clarifying-info** second phase remains (the plan in `docs/plans/`, `[DEPLOY-WITH-LOGIN]`, pure data, no inbox contact); (b) activate **enrichment** (DVSA/DVLA creds → Key Vault, `DVSA_TENANT_ID`, flip `ENRICHMENT_ENABLED` in a test env); (c) drive the **EVA M1 JSON drag-drop** path end-to-end into the EVA **test** environment + **Box** archival.

**Later** — **EVA Sentry REST API** and **OCR for scanned PDFs** ("B-full", Azure Container Apps) are now **built (deploy pending)**; **manual inspection address with offline-derived full-address suggestions** is the model (a runtime matcher was built then **removed root-and-stem 2026-06-23** — ADR-0013, see [docs/architecture/inspection-address-corpus.md](./docs/architecture/inspection-address-corpus.md)); **chaser automation** (draft-only) and the full **§7 live-validation checklist** across all three mailboxes remain. **Phase 7 (the Box-centric intake pivot, ADR-0012)** has its **Dataverse schema + env-vars applied live (all `BOX_*` gates OFF)**, with the **`box-webhook` Function now deployed gated-OFF in Dev (`cespkbox-fn-v76a47`, Gate-C-verified, secret-free)** and the connector/flows still **authored offline, not deployed/bound** — the long pole is the **BUSINESS-account** second test phase (see Phase 7 below + gated.md item 5).

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
- [x] **Offline verification gate** green — `node verify-all.mjs` → 7 gates.
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

### 1d. Flows (imported OFF; M1 chain now WIRED LIVE via CLI)

- [x] **10 cloud flows imported `state=off`**; connection refs unbound.
- [x] **Intake flow guards** — `MinIntakeDate` (2026-06-17) + temporary attachment filter.
- [x] **Dedup ladder (ADR-0010)** encoded in `case-resolve`.
- [x] **M1 flow chain WIRED LIVE via CLI (2026-06-19).** The 3 Run-a-Child cards (`Run_classify_persist`→`Run_parse`→`Run_status_evaluate`) + `Init_caseId`/`Capture_caseId_*` were added to **CS Intake** via the Dataverse API; the `OnNewEmailV3` **trigger node was kept byte-identical** so the digital@ webhook survived (clientdata can't re-arm an Office 365 webhook). **classify-persist creating Evidence verified by a live test email.**
- [x] **Two live bug fixes reconciled into `flows/definitions/`** so a solution re-import can't regress them: (1) `cr1bd_payloadhash` (MaxLength 80) **overflowed at 89 chars** on long-subject emails → no Case; wrapped the `subject|from` seed in **`@take(...,80)`** in `Create_case_matched` **and** `Create_case_unassigned` across **both** intake variants. (2) Child flows need a **`Response`** to be Run-a-Child-callable; added `Respond_to_parent` to `parse` (returns `instructionBytesB64`/`instructionName`) + `status-evaluate` (returns the readiness result) — `classify-persist` already had one. Gate `node verify-all.mjs` **6/6** (flow linter 114/114).
- [ ] **Residuals (not regressions):** parser Function **502** — fixed separately (`parse` already audits a 5xx and lets status advance to needs_review); intake trigger **`concurrency = 1`** — the documented **webhook-risk** edit, **deferred** (re-arms the live webhook in the designer).

---

## Phase 1b — Provider Corpus & Inspection-Address Data _(seed + incorporation done; clarifying-info second phase remains)_

`[DEPLOY-WITH-LOGIN]` (pure Dataverse data — no inbox/SharePoint/Box/EVA contact).

### 1b.1 Initial seed + analysis _(done)_

- [x] **Provider corpus seeded** — `WorkProvider` (45), `Repairer` (38), `ImageSource` (4) + N:N.
- [x] **Provider/garage/location data analysis** (2026-06-18) — `raw/principalandrepairersheets/outputs/`, reproducible via `outputs/_scripts/run_all.py`.
- [x] Actionable outputs: `provider_corpus_recommendation.csv`, `loc_principal_analysis.md`, `principal_address_worklist.md`.

### 1b.2 Corpus incorporation (per `docs/plans/phase-1-intake-and-case-tracking/corpus/dataverse-corpus-incorporation.md`) _(LOADED — scripts 10–14 + verify all passed 2026-06-19)_

- [x] `10-seed-workprovider.ps1` — `WorkProvider` **390 updated** (`Corpus 2026-06-18` provenance; SEED→active / ARCHIVE→inactive; name from address; domains/toggles preserved); 11 excluded, 2 review-skipped, 12 placeholder names. **37 principal codes >8 chars deferred** (operator must widen `cr1bd_principalcode` or supply canonical ≤8-char codes); GGP→GG and ZEN==ZENITH merges deferred to the clarifying-info phase.
- [x] `11-seed-repairers.ps1` — **20** named full-postcode yards + **14** garage↔REPAIRER matches → `Repairer`.
- [x] `12-seed-inspection-sites.ps1` — `InspectionAddress` **174** rows, all Confirmed Physical, all with postcodes.
- [x] `13-link-imagesources.ps1` — `ImageSource(kind=repairer)` **20**, with **98** WorkProvider N:N links.
- [x] `14-verify-corpus.ps1` — all 14-verify checks PASSED; idempotent re-run = no-op.
- [ ] **Deliberately excluded** (deferred): partial postcodes, paper providers, red-herrings, REVIEW unknowns, unconfirmed code-drift, note-mining.

### 1b.3 Clarifying-info ingestion (per `docs/plans/phase-1-intake-and-case-tracking/corpus/clarifying-info-ingestion.md`) _(planned — awaits operator worklists)_ 🔒

- [ ] 🔒 **Input 3** — code reconciliation (canonical `principalCode`).
- [ ] 🔒 **Input 5** — the 137 active-but-off-jobsheet principals (CONSIDER decisions).
- [ ] 🔒 **Input 1** — confirmed full addresses for part-postcode districts → `Repairer` known-sites + N:N; fast-confirm path.
- [ ] 🔒 **Input 4** — garage↔provider coverage → N:N.
- [ ] 🔒 **Input 2** — intermediary confirmations → `ImageSource(kind=intermediary)`; de-collide `knownEmailDomains`.

---

## Phase 2 — Live Activation _(operator — the live-services boundary)_ 🔒

`[RESERVED-FOR-USER]` — after the non-inbox deploy is green, **one mailbox first**, in DEPLOY-RUNBOOK §7 order.

- [ ] 🔒 **Bind the Outlook shared-mailbox connection** + Dataverse + parser connection references.
- [ ] 🔒 **Turn ON `intake` + `classify-persist` + `parse` for ONE inbox.** _(The M1 chain is **wired live via CLI** — orchestrator cards on `CS Intake`, repo reconciled; remaining is the operator/designer step: bind the parser connection, resolve the parser **502**, optionally re-arm the trigger when changing **`concurrency=1`**, flip the children ON.)_
- [ ] 🔒 **Send a test email** (PDF + 2 images: overview with legible plate + damage closeup).
- [ ] 🔒 **Confirm a Case appears**; status `new_email → ingested`; provider matched by sender domain; 12 fields pre-filled with provenance.
- [ ] 🔒 **Confirm Outlook categories** applied.
- [ ] 🔒 **Confirm dedup live** (ADR-0010).
- [ ] 🔒 **Provider-matching live validation** — intermediary domain does **not** auto-match.
- [ ] 🔒 **Scale to all three inboxes** — only after single-mailbox success.

---

## Phase 3 — Enrichment & EVA Sentry _(enrichment ON in Dev; EVA M1 path awaits activation; REST later)_

### 3a. Enrichment (DVSA/DVLA)

- [x] **Enrichment Function deployed + gate ON** ✅ (`ENRICHMENT_ENABLED=true` in Dev, flipped 2026-06-21).
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

> **Superseded by Phase 7 (ADR-0012).** This is the older **M2.D** "Box folder at EVA-submit" slice. Under
> the Box-centric pivot the folder is **minted at parse-confirm** (`box-folder-create`) and `finalize-eva-box`
> **augments** it — Box is no longer first created in unison with EVA submit. See §Phase 7 / B1 below and
> `docs/plans/phase-3-enrichment-and-eva/box-archival-pipeline.md` (reconciled DOWN). Items below are
> retained for history.

- [x] `finalize-eva-box` builds the Box folder + photo-order step — imported `off`.
- [ ] 🔒 **B5 — confirm Box honours the UPPERCASE Case/PO folder name**.
- [ ] 🔒 **Activate Box archival** _(legacy timing — now folder-at-parse-confirm + augment-at-finalise per ADR-0012)_; photo order verified.

### 3e. EVA readiness gate (offline-built)

- [x] **Image-rules / readiness checklist** in the Code App.
- [ ] 🔒 **Drive the readiness checklist to green on a live Case**; Address decision gate (override-with-reason).
- [ ] 🔒 **Confirm AuditEvent rows** for ingest / review / submit.

---

## Phase 4 — Inspection Address & Chaser _(policy gate built; manual address with offline-derived full-address suggestions; chaser automation remains)_

### 4a. Manual inspection address with offline-derived full-address suggestions

- [x] **Address-policy gate** in the Code App — per-provider policy; no silent "Image Based Assessment".
- [x] **Known-site reference data** modelled (`InspectionAddress` + `Repairer`); seeded by Phase 1b.
- [x] **Manual inspection address with offline-derived full-address suggestions** — `Loc` is an **EVA-export artifact, not an intake input**; the full inspection address is derived **offline** from case history into a static, **full-addresses-only** suggestions corpus (`cr1bd_inspectionaddress`) → staff **manually pick** → "Image Based Assessment" with a reason. Postcode normalisation honours `AZURE_MAPS_ENABLED=false` → **postcode.io**. Partials/bare postcodes are a **future-investigation backlog**, never live. _(A runtime matcher Function was built then **removed root-and-stem 2026-06-23** — built on a misreading; ADR-0013, see [docs/architecture/inspection-address-corpus.md](./docs/architecture/inspection-address-corpus.md). There is **no runtime matcher**.)_
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
- [x] **OCR ACA host deploy** — **DONE 2026-06-19** (PR #7). The prior 3× "provision revision expired" was the **AcrPull RBAC-propagation race** (role created in the same deployment as the app). Fix: a **pre-granted user-assigned identity** for AcrPull via a separate ARM deploy + `siteConfig.acrUserManagedIdentityID`. Function App `cespkocr-fn-dev-glju3v` (Functions-on-ACA, scale-to-zero 0..5) is **Running**. Connector wiring + `OCR_SCANNED_PDF_ENABLED`/`PLATE_OCR_ENABLED` flip remain.

### 5b. Image classification AI (ADR-0009 — M2+)

- [ ] **AI Builder image classification** (overview vs `damage_closeup`).
- [ ] **Azure OpenAI / Foundry vision** for **person / reflection detection** (Custom Vision explicitly not used — retiring 2028).
- [ ] **Image-ordering UI** — drag to set the 2 preview images.
- [ ] **WhatsApp media bulk import (ADR-0007)** — OCR each for the registration, auto-match to the open Case by VRM.

### 5c. Valuation & Copilot (M3)

- [ ] **Valuation (`valuationbot`, gated `VALUATION_ENABLED`)** — staff-triggered; evidence PDF attached.
- [ ] **Copilot Studio agent (gated `COPILOT_ENABLED`)** — staff assistant over Dataverse.

---

## Phase 6 — Boundary Evidence & Handoff _(gates green; final live evidence pending)_

- [x] **Offline gate green** — `verify-all.mjs` 7/7.
- [x] **Static grep gate** / **flow-state assertion** / **no-credentials assertion**.
- [ ] 🔒 **Connection inventory** — `pac connection list` (operator evidence at activation).
- [ ] 🔒 **Deploy log** — record every `[DEPLOY-WITH-LOGIN]` + `[RESERVED-FOR-USER]` action.
- [ ] 🔒 **§7 live-validation checklist complete** across all three mailboxes — the M1 "done" definition.

---

## Phase 7 — Box-centric intake pivot (additive hybrid) _(schema + env-vars applied live, gates OFF; box-webhook Function deployed gated-OFF; connector + flows authored offline; NOT activated)_

`[BUILD]` complete in the working tree; the **Dataverse schema + env-vars are applied live in Dev (all
`BOX_*` gates OFF)** and the **`box-webhook` Function is deployed gated-OFF (`cespkbox-fn-v76a47`, secret-free)**; the connector/flows are authored offline and **everything live beyond the
schema + the gated-off Function host is `[RESERVED-FOR-USER]`.** Binding decision:
[ADR-0012](./docs/adr/0012-box-centric-intake-additive-hybrid.md). Ordered build + cross-section
reconciliations: [box-integration-pivot/plans/00-BUILD-PLAN.md](./box-integration-pivot/plans/00-BUILD-PLAN.md).
Phase docs: [docs/plans/phase-7-box-integration/](./docs/plans/phase-7-box-integration/).

> **Phase ≠ Milestone.** Phase 7 is a work-breakdown phase; Box-archival-at-EVA-submit is the older **M2.D**
> slice (`phase-3-enrichment-and-eva/box-archival-pipeline.md`, reconciled DOWN to ADR-0012). This phase is
> the broader pivot that brings Box **earlier** (folder at parse-confirm) and **deeper** (File-Request
> chasers + webhook intake). **Dataverse stays the system of record; Box is a one-way mirror.** Start on
> **base Box Business** (metadata = Business Plus is out of scope now); **EVA stays gated OFF**; **evidence
> is linked, not embedded** (a server-minted "Open in Box" deep link — no iframe, no `frame-src` edit;
> `BOX_EMBED_ENABLED` reserved/off).

### B0 — Unlock: custom connector + token-mint/webhook Function + schema (gate `BOX_API_ENABLED`)

- [x] **ADR-0012** + architecture §Box (`integrations.md`, `data-model.md` one-way-mirror rule, `live-environment.md` placeholder rows).
- [x] **Dataverse schema + env-vars — APPLIED LIVE in Dev (all `BOX_*` gates OFF; verified via `az` 2026-06-22)**: **5 `BOX_*` gates** + **2 String config vars** in `environment-variables.json`; **9 case columns** on `cr1bd_case` (`cr1bd_boxfolderid`/`boxfolderurl`/`boxsyncedat`/`boxfilerequestid`/`boxfilerequesturl`/`sourcemailbox` + the finalize submit-signal columns + the `cr1bd_finalizedpayloadhash` drift declaration) and **`cr1bd_boxfileid`/`cr1bd_boxfileurl`** on `cr1bd_evidence`; **3 audit actions** (`box_folder_created`/`box_file_request_copied`/`box_upload_received`); `verify-parity.mjs` locks the defaults; apply script `dataverse/.build/25-box-schema.ps1` (adds the 9 case columns).
- [x] **`box-webhook` Azure Function DEPLOYED gated-OFF 2026-06-22** (`cespkbox-fn-v76a47`, FC1, Running; MI `5db514c8-25f2-4d94-81ec-3878286d0087`; `BOX_API_ENABLED=false`, `BOX_ALLOWED_ROOT_ID=392761581105`; Gate-C verified: no-key→401, key+unsigned→400, gated facade→503; KV `cespkboxkvv76a47` empty so secret refs pending) — CCG token-mint inside the Function; HMAC dual-key + 10-min-replay + `BOX-DELIVERY-ID`-dedup receiver that **processes the Dataverse fan-out on the request path and returns 200 when settled, or a non-2xx (503) on a transient failure so Box retries** (Box does not retry after a 2xx); durable dedup = the Evidence-existence check on the `box:file:<id>` tag in `cr1bd_sourcemessageid` (the webhook also writes `cr1bd_boxfileid` as a correlation/UI mirror + `cr1bd_acceptedforeva=true`, audits with the canonical `cr1bd_name`/`occurredat`/`action`/`after` shape); custom-connector OpenAPI under `openapi/`; FC1 bicep under `infra/`. **pytest 79 passed.** Secrets are Key Vault refs only, under the **hyphenated** names `box-client-secret`/`box-webhook-primary-key`/`box-webhook-secondary-key`.
- [x] **Connection-ref + invocation mechanism PINNED** — a **parallel custom `cr1bd_box_rest`** (CCG via the Function, authored offline) for folder/File-Request/shared-link/webhook; first-party `cr1bd_box` **retained** for the byte path (NOT a repoint). The Code App invokes copy/shared-link via the connector op **directly** (no flow in the path — CSP `connect-src 'none'`), finalize via a Dataverse submit-signal (no SAS-fronted flow); `box-file-request-copy` is an authored **standby** child flow for future operator activation, not currently invoked.
- [ ] 🔒 **Register + Admin-authorize the Box Platform app** (Server Auth / CCG, scopes `root_readwrite` + `manage_webhook`); supply `client_secret` + webhook signature keys to Key Vault (hyphenated names) — the Function (`cespkbox-fn-v76a47`) is **already deployed gated-OFF**, so the remaining work is setting those secrets, importing the connector, and binding **both** Box connections. **The hard unlock** (needs a Business tenant — base Business suffices; Business Plus is only for the deferred metadata tier).

### B1 — Folder + archival at parse-confirm (gate `BOX_FOLDER_AT_INTAKE_ENABLED`)

- [x] **`box-folder-create`** flow (`state=off`) — `CreateFolder name=@toUpper(casePo)`, idempotent, stamps `cr1bd_boxfolderid`, audits.
- [x] **`finalize-eva-box` reworked** — folder pre-exists → **augments**; keeps the S2 byte path; reads `cr1bd_BOX_FOLDER_ROOT_ID`; stamps `box_synced` last (and stamps `cr1bd_boxsyncedat`).
- [x] **`case-resolve` reworked** — survivor-folder idempotent ensure on merge.
- [x] `flow-state.json` + `validate-flows.mjs` extended; **flow linter 154/154**.
- [ ] 🔒 **Designate the archive root** → `BOX_FOLDER_ROOT_ID`; insert the `box-folder-create` invocation into **live** `intake` (operator/business-phase live edit — the repo intake def trails live, by design); flip `BOX_API_ENABLED` then `BOX_FOLDER_AT_INTAKE_ENABLED` (test env first); live-confirm UPPERCASE casing + photo order.

### B2 — File-Request image chaser + webhook intake (gate `BOX_FILEREQUEST_ENABLED`) — the BLOCKING live-test

- [x] **`box-file-request-copy`** flow (`state=off`) — `empty(folderId)→folder_not_ready` guard; `CopyFileRequest`; returns `{ fileRequestUrl, expiresAt, outcome }`.
- [ ] 🔒 **Hand-build the ONE template File Request** → `BOX_FILE_REQUEST_TEMPLATE_ID`; subscribe the `FILE.UPLOADED` webhook (prefer archive-root/per-sender over per-case).
- [ ] 🔒 **BLOCKING live-test:** a File-Request upload must fire `FILE.UPLOADED` → the Function → the case advances. The File-Request → event firing is **undocumented** (the single biggest empirical unknown). Primary recovery on a transient failure is **Box's own retry** on the receiver's non-2xx (Box does not retry after a 2xx); a timed `ListFolder` reconciliation sweep is **documented but not yet built** — a deferred secondary backstop. Then flip `BOX_FILEREQUEST_ENABLED` (test first).

### B3 — Permanent drop-boxes for image-only senders (gate `BOX_FILEREQUEST_ENABLED`)

- [ ] 🔒 One permanent File Request per repeat sender under `/DropBoxes/`; webhook reg-merges (ADR-0010) to an open case or routes to **Held**. (On base Business the reg signal is filename-VRM / emailed reg / triage; the metadata field is the deferred Business-Plus upgrade.)

### B4 — Surface Box in the Code App (gate `BOX_API_ENABLED`; `BOX_EMBED_ENABLED` reserved)

- [x] **`getBoxGates()`** reads the same env-var-definition rows the flows read (default all-false on failure); **vitest 256 passed, `tsc -b` clean**.
- [x] **Submit dialog → real `finalize-eva-box`** via the Dataverse submit-signal (never writes status locally; drag-drop JSON export stays the permanent fallback).
- [x] **Chaser → `copy_file_request` → clipboard** (calls the Box REST connector op **directly** — `CopyFileRequest`/`GetFolderSharedLink`, no flow in the path under CSP `connect-src 'none'`; reads `fileRequestUrl`; honest `not_connected`/`folder_not_ready`/`error`, never a fake link. At activation the direct transport must also persist `cr1bd_boxfilerequestid`/`url` on the case. `box-file-request-copy` is an authored standby child flow, not currently invoked).
- [x] **Evidence → server-minted "Open in Box" deep link** (`GetSharedLink`, no CSP change). The iframe is **not built**; `BOX_EMBED_ENABLED` reserved/off.
- [ ] 🔒 Bind the Box connection(s) + flip the gates so the affordances light up; **no `frame-src` edit** (link-not-embed).

### Phase C — deferred, tier-gated (placeholders only)

- [x] **`box-blob-purge`** flow (`state=off`) — scheduled, status-driven (`box_synced` + grace, default 7d); only purges archived (accepted, non-excluded) **image** evidence (non-image transient bytes are retained — a deferred follow-up); never deletes the Box copy.
- [ ] **(deferred)** Box Metadata-Query (`BOX_METADATA_ENABLED`, Business Plus tier), Box Governance retention, Box AI Units — each independently gated, each its own decision.

**Two-phase live testing.** Phase A (done) — a throwaway **FREE** Box account proved **8/9 raw-REST ops** via a dev token (folder created + recursively deleted; no secret printed), and a free-account demo (case **SBL26001**) proved the folder + upload + shared-link pattern **manually**; the lone REST failure `CreateWebhook` 403 `insufficient_scope` is expected on a free plan. Phase B (pending, operator) — the live **Business-account** tenant lights up the always-on service-identity path (CCG + File Requests + the BLOCKING `FILE.UPLOADED` live-test; metadata is the optional later Business Plus tier). **Phase B is the long pole.**

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
| **B-full** | OCR for scanned PDFs | **Deployed** ✅ 2026-06-19 (PR #7) — `cespkocr-fn-dev-glju3v` Running (Functions-on-ACA, scale-to-zero); the AcrPull race was fixed with a pre-granted user-assigned identity. Connector wiring + gate flip remain. |
| **B6** | Phase-7 Box pivot (ADR-0012) | **Schema applied live (gates OFF); code authored offline; NOT activated** ✅/🔒 — the Dataverse schema + env-vars are **applied live in Dev with every `BOX_*` gate OFF**; the `box-webhook` Function is **deployed gated-OFF** (`cespkbox-fn-v76a47`, Gate-C-verified, secret-free), while the `cr1bd_box_rest` connector, the Box flows + the Code App surfacing remain **authored offline, not deployed/bound**. The **BUSINESS-account second test phase** (CCG + File Request + the BLOCKING `FILE.UPLOADED` live-test) is the **long pole** — gated.md item 5. |

---

### What "done" looks like for M1

> A real email in one shared inbox becomes a tracked **Case**, is parsed + (optionally) enriched into the **12 EVA fields** with provenance, passes a human readiness review, and is exported to **EVA** as drag-drop JSON with a **Box** archive folder — with dedup, provider matching, and the inspection-address gate all behaving per the offline decision-table tests.

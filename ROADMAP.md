# ROADMAP — collisionspike

_Case-intake spike for **Collision Engineers** (UK vehicle-damage assessment). The **live system is the
Azure PaaS stack** — a **Static Web App** SPA (`cespk-spa-dev`) + a **Function-App data API** (`cespk-api-dev`,
Node/TypeScript) + an **orchestration Function App** (`cespk-orch-dev`) + a **Postgres Flexible Server**
system of record (`cespk-pg-dev`) + the **retained Python Functions** (parser / enrichment / evasentry /
evavalidation / ocr / box-webhook). The original **Power Platform implementation** (Power Apps Code App +
Dataverse + ~16 Power Automate flows + custom connectors) has been **migrated and decommissioned**. Last
updated **2026-06-26**._

_Companion docs: [README.md](./README.md) · [PLAN.md](./PLAN.md) · [CURRENT_STATUS.md](./CURRENT_STATUS.md) · [DEPLOY-RUNBOOK.md](./DEPLOY-RUNBOOK.md) · [docs/gated.md](./docs/gated.md) · migration plans under [migration/](./migration/) · milestone map [docs/plans/milestone-model.md](./docs/plans/milestone-model.md) · plans under [docs/plans/](./docs/plans/) · ADRs in [docs/adr/](./docs/adr/)._

> **Platform migration (2026-06-26).** This repo was first built as a **Power Platform** spike and has
> since been **migrated to an Azure PaaS stack** (the reversible code/data migration in [migration/](./migration/)
> is executed and cut over). The **domain + workflow are unchanged** — the EVA **12-field** contract, the
> image rules, the provider / inspection-address corpus, the **Case/PO** format, and the
> intake→parse→review→enrich→EVA+Box pipeline all carry over verbatim; **only the platform mechanism
> changed**. Power-Platform-era content below is **retained but banded as the prior/decommissioned era** —
> it remains the reference for the domain logic it encodes. The live registry is
> [CURRENT_STATUS.md](./CURRENT_STATUS.md).

> **Live Azure stack (canonical registry: [CURRENT_STATUS.md](./CURRENT_STATUS.md)).** Resource group
> `rg-collisionspike-dev` (region **uksouth**) on subscription `e6076573-…`, an **Azure Free Trial**
> (quotaId `FreeTrial_2014-09-01`) — **the whole stack is disabled at the ~30-day mark unless upgraded to
> Pay-As-You-Go** (the 12-month free Postgres allowance survives the upgrade). Components: **SPA**
> `cespk-spa-dev` (React/Vite from `mockup-app/`, **MSAL / Entra workforce sign-in**, calls the API over
> REST — `mockup-app/src/data/rest-client.ts`, **no Power SDK**); **data API** `cespk-api-dev` (source
> `api/`, esbuild bundle `deploy/api/main.cjs`; validates Entra JWT + app roles **CollisionSpike.User /
> CollisionSpike.Admin**; connects to Postgres); **orchestration** `cespk-orch-dev` (source
> `orchestration/`, **built but zero functions deployed — no live automated email intake yet**); **Postgres
> Flexible** `cespk-pg-dev` v16, db `collisionspike` (36 tables; seeded work_provider 390 / repairer 32 /
> image_source 19 / inspection_address 2209 [174 confirmed + 2035 suggested] / case_ **0**); the **6 retained
> Python Functions**, the **Key Vaults**, **Blob `cespkevidstdev01`**, and **App Insights / LAW**.

> **Role split.** This **ROADMAP** is the forward phased checklist (per-phase done/remaining).
> [CURRENT_STATUS.md](./CURRENT_STATUS.md) is what is live *now*. [docs/gated.md](./docs/gated.md) is
> everything that needs the operator (hard/soft blockers). The canonical phase taxonomy is
> **Phase 0–6** used here, **plus the additive Phase 7** (Box-centric intake pivot, ADR-0012),
> **Phase 8** (inbox/triage management, ADR-0015 _Proposed_), and **Phase 9** (data governance,
> retention & erasure, ADR-0017 _Proposed_); each phase's ordered build checklist lives in
> [docs/plans/&lt;phase&gt;/README.md](./docs/plans/README.md).

> **Live counts live elsewhere — by design.** Table / choice-set / relationship / env-var / flow /
> test-gate tallies are **not restated in this ROADMAP** (they drift). The live registry is
> [CURRENT_STATUS.md](./CURRENT_STATUS.md) + [docs/architecture/live-environment.md](./docs/architecture/live-environment.md);
> this ROADMAP tracks **what** is done / remaining, not running totals, and carries **no dated change
> narrative** — that is CURRENT_STATUS's job. ADRs **0001–0014** are recorded; **0015–0018** are
> _Proposed_ (the two integrated items, the new governance phase, and the parser/repo-boundary ADR-0018).

> This roadmap has two parts. The **forward frontier** is the **Azure migration-remediation backlog**
> (below, in Now / Next / Later): standing the migrated stack up to production-grade — deploy orchestration
> + scope the 3 intake mailboxes for live intake, the P0 DB-security remediation, the Free-Trial→PAYG
> upgrade, durable API hardening, staff app-role assignment, and an IaC config layer — with the **domain
> milestones (EVA, enrichment, Box, OCR, governance) re-homed onto the Azure stack**. The **banded Phase
> 0–9 checklist** that follows is the **Power-Platform-era build record**, preserved for the domain /
> workflow / EVA / provider knowledge it encodes; its platform-mechanism steps (flows, Dataverse, the Code
> App push, env-var gates) are **superseded by the migration** and should be read as history.

---

## Legend

> The symbols and the two principles below govern the **banded Phase 0–9 checklist** (the Power-Platform-era
> build record). The forward Azure work is tracked in **Now / Next / Later** above.

- `[x]` **done** — built and/or deployed; verified per CURRENT_STATUS / the offline gate.
- `[ ]` **remaining** — not yet built or not yet activated.
- 🔒 **operator-gated** — crosses the live-services boundary (touches the live Outlook shared inboxes, live Box, or live EVA, or injects real secrets). **Claude builds offline; the operator activates.**
- ⚙️ **deployed but gated-OFF** — shipped in a disabled state by design (a **retained Python Function** carrying its Key-Vault env-var gate `false`; historically a Dataverse env-var gate / Power Automate flow `state=off`).

**Two hard principles:**
1. **Offline build vs operator activation** — anything inbox/Box/EVA + all live tests + real secret injection are the operator's, in DEPLOY-RUNBOOK order.
2. **No mock/seed case data in the app** — the SPA renders **real rows only**, fetched from Postgres over the data API (historically: real Dataverse rows). With `case_ = 0` and no live intake yet, the empty intake list is **correct**; it is never "fixed" with sample cases.

---

## Now / Next / Later — the Azure migration-remediation backlog

_The forward axis after the Power-Platform→Azure migration. Each rung names the live Azure component it
touches. The detailed Power-Platform-era checklist is **banded below** for domain reference._

**Now (highest priority — make the migrated stack production-grade):**
- **✅ Database-security remediation — DONE (2026-06-26).** The data API (`cespk-api-dev`) now connects to
  Postgres as the **non-owner login `cespk_app`** (`rolsuper=false`, `rolbypassrls=false`; password a **Key
  Vault reference**, no cleartext), so the authored **RLS is enforced** — the prior server-admin `csadmin`
  connection bypassed it. DB app-role set per connection via `-c app.role=staff` (the `PGAPPROLE`
  app-setting); grants least-privilege (no DELETE; `audit_event` INSERT/SELECT only — append-only).
- **Free-Trial → Pay-As-You-Go.** Subscription `e6076573-…` is an **Azure Free Trial**
  (quotaId `FreeTrial_2014-09-01`); **the whole stack is disabled at the ~30-day mark** unless upgraded
  (the 12-month free Postgres allowance survives the upgrade). A hard, dated deadline.
- **Deploy orchestration + scope the 3 intake mailboxes (Exchange RBAC) for live intake.** `cespk-orch-dev`
  is **built but has zero functions deployed**, so there is **no live automated email intake** — today the
  system is **read-only + manual case-create only**. Deploy the Microsoft Graph **delta-poll** intake, then
  have an **Exchange Administrator** grant the intake app **resource-scoped** Graph mailbox roles via
  **Exchange RBAC for Applications** (`New-ServicePrincipal` / `New-ManagementScope` /
  `New-ManagementRoleAssignment`) on the 3 shared inboxes — **no Global-Admin tenant consent, no push
  subscription**; intake **polls** (delta query).

**Next:**
- **Durable API hardening** — durable auth error-handling + token **audience-form** hardening (v2 tokens
  carry `aud` = the API client-id GUID `fa2fb28c…`); in progress.
- **Staff app-role assignment** — only **one** staff principal is app-role-assigned today
  (`CollisionSpike.User` / `CollisionSpike.Admin`, the 2 roles that map the old 2 Dataverse roles); other
  staff **403 until assigned**. Complete the roster.
- **IaC config layer** — capture the live Azure config (app-settings, role assignments, RBAC grants, the
  Static Web App + Function-App wiring) as Infrastructure-as-Code so the environment is reproducible.
- **EVA M1 JSON drag-drop** into the EVA **test** env — the domain milestone, now re-homed onto the Azure
  data API + the retained `evasentry` Function (Minotaur one-principal-code constraint still gates EVA REST).
- **Enrichment test/prod cutover** — the **retained** Python enrichment Function (DVSA/DVLA direct via
  Entra) carries over from the prior build; promote its verified path on the Azure stack.

**Later:**
- **Box business-account live-test** — CCG + File Request + the `FILE.UPLOADED` live-test against the
  **retained** `box-webhook` Function; the deferred Business-Plus metadata tier.
- **OCR for scanned PDFs** calibration (retained `ocr` Function); **chaser automation** (draft-only);
  **EVA Sentry REST** cutover pending the **Minotaur patch + a parity test**.
- **Data governance / retention / erasure** — the biggest substantive gap, now spanning **Postgres + Blob +
  Box**: a retention model (data-minimisation vs litigation hold), a cross-store DSAR/erasure runbook, and a
  DPIA / controller-processor map.
- The inspection-address model stays **offline-derived suggestions + manual confirm** — **ADR-0013 remains
  binding, no runtime matcher** ([docs/architecture/inspection-address-corpus.md](./docs/architecture/inspection-address-corpus.md)).
- **API intake channel (deferred research)** — let providers/principals POST work directly to an HTTP
  endpoint (now naturally a route on the `cespk-api-dev` data API), bypassing email; needs an auth model,
  payload contract, and provider onboarding scoped with the operator before a phase plan is authored
  (see [docs/architecture/integrations.md](./docs/architecture/integrations.md)).

> **Why JSON drag-drop is the EVA path today (not merely an "M1 fallback").** The EVA **test environment exists** (credentials held in the secrets store); the blocker is a **vendor limitation** — Minotaur Software's Sentry API currently accepts only **one principal code** per API submission, so it cannot route different work-provider codes and would force every case under a single work provider. Minotaur is patching this (no ETA); EVA REST therefore stays **gated** pending that patch **+ a parity test**. Note that **enrichment (DVSA/DVLA) is separate from EVA** — it runs at intake, pre-EVA, on the retained enrichment Function; EVA stays **OFF**.

---

---

# HISTORICAL — Power Platform implementation era _(decommissioned; preserved for domain reference)_

> **Read as history.** Everything from here to the end of the phase checklist describes the **original
> Power Platform build** (Power Apps Code App + Dataverse + ~16 Power Automate flows + custom connectors),
> which has been **migrated to the Azure PaaS stack and decommissioned**. It is **retained, not deleted**,
> because it is the most detailed record of the **domain + workflow** — the EVA 12-field contract, the image
> rules, the dedup ladder (ADR-0010), the provider / inspection-address corpus, the Case/PO format, and the
> per-stage gating decisions — all of which **carried over unchanged** to the Azure build. Where a step
> below says "Dataverse", "flow", "Code App push", "Sandbox", or "env-var gate", read the **migrated
> equivalent**: Postgres / orchestration Function / Static Web App deploy / the `rg-collisionspike-dev`
> resource group / Key-Vault-or-app-setting gate. The **retained Python Functions** (parser, enrichment,
> evasentry, evavalidation, ocr, box-webhook), the **Key Vaults**, and **Blob `cespkevidstdev01`** survived
> the migration intact and remain live components. Live status is **[CURRENT_STATUS.md](./CURRENT_STATUS.md)**.

## Phase 0 — Foundations _(complete)_

- [x] Repo, requirements, Microsoft-stack research, phased PLAN distilled into `docs/` + `PLAN.md`.
- [x] **ADRs 0001–0014** recorded (0015–0018 _Proposed_ — see Phases 8, 9, Phase 4a, and the parser-boundary ADR-0018).
- [x] **Power Apps Code App** scaffolded (React + Vite + Fluent v9) in `mockup-app/`.
- [x] **Shared contracts** ported as typed TS — EVA payload (**12 fields**, 6-line address), case-status state machine, image-rules.
- [x] **Domain logic** in typed TS — classification, **ADR-0010 dedup ladder**, provider-match, address-policy.
- [x] **Data seam** built — mock↔Dataverse swap + field adapter; app shows real rows only.
- [x] **Dataverse schema-as-code** authored (`dataverse/`); parity test.
- [x] **Env-var feature gates** defined.
- [x] **Offline verification gate** green — `node verify-all.mjs` → **all gates green** (began at 7; now runs more — see CURRENT_STATUS for the current per-suite breakdown).
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

- [x] **Schema built** in Sandbox `Collision Engineers - Dev` — solution `CollisionSpike`, prefix `cr1bd`: tables, choice sets, relationships, alt keys, env-var gates (incl. the Phase-7 `BOX_*` set, applied live). _Live tallies: CURRENT_STATUS / live-environment._
- [x] EVA secrets **Key-Vault-typed, no values**; `ENRICHMENT_ENABLED` imported **`false`** per-env.

### 1c. Code App (live)

- [x] **B4 cleared** — Code Apps enabled + maker licensed; `pac code push` succeeds.
- [x] **Code App deployed + live**, wired to **live Dataverse**.
- [x] **Manual-intake path** works: upload → parse → create real **Case**.
- [x] **Logo / brand fonts / Dashboard nav fixed**; `npm run build` green.
- [x] **"Emails don't populate" diagnosed** — not an app bug; intake flow `off` + unbound connectors; fix = operator activation, **not** mock data.

### 1d. Flows (imported OFF; M1 chain now WIRED LIVE via CLI)

- [x] **Cloud flows imported `state=off`** then progressively wired; the M1 chain (intake / classify-persist / parse / enrich / status-evaluate + case-resolve) is now **ON in Dev** with the core connection refs bound. _Exact flow count + ON/OFF state: CURRENT_STATUS / live-environment._
- [x] **Intake flow guards** — `MinIntakeDate` (2026-06-17) + temporary attachment filter.
- [x] **Dedup ladder (ADR-0010)** encoded in `case-resolve`.
- [x] **M1 flow chain WIRED LIVE via CLI (2026-06-19).** The 3 Run-a-Child cards (`Run_classify_persist`→`Run_parse`→`Run_status_evaluate`) + `Init_caseId`/`Capture_caseId_*` were added to **CS Intake** via the Dataverse API; the `OnNewEmailV3` **trigger node was kept byte-identical** so the digital@ webhook survived (clientdata can't re-arm an Office 365 webhook). **classify-persist creating Evidence verified by a live test email.**
- [x] **Two live bug fixes reconciled into `flows/definitions/`** so a solution re-import can't regress them: (1) `cr1bd_payloadhash` (MaxLength 80) **overflowed at 89 chars** on long-subject emails → no Case; wrapped the `subject|from` seed in **`@take(...,80)`** in `Create_case_matched` **and** `Create_case_unassigned` across **both** intake variants. (2) Child flows need a **`Response`** to be Run-a-Child-callable; added `Respond_to_parent` to `parse` (returns `instructionBytesB64`/`instructionName`) + `status-evaluate` (returns the readiness result) — `classify-persist` already had one. Gate `node verify-all.mjs` **6/6** (flow linter 114/114).
- [ ] **Residuals (not regressions):** parser Function **502** — **fixed 2026-06-19, regression-guarded** (the 16:49 UTC unreadable-PDF burst; the handler now returns **422 → needs_review** with no retry for unreadable docs, guarded by `test_unreadable_document_returns_422`; not a live blocker); intake trigger **`concurrency = 1`** — the documented **webhook-risk** edit, **deferred** (re-arms the live webhook in the designer).

---

## Phase 1b — Provider Corpus & Inspection-Address Data _(seed + incorporation done; clarifying-info second phase remains)_

`[DEPLOY-WITH-LOGIN]` (pure Dataverse data — no inbox/SharePoint/Box/EVA contact).

### 1b.1 Initial seed + analysis _(done)_

- [x] **Provider corpus seeded** — `WorkProvider` (45), `Repairer` (38), `ImageSource` (4) + N:N.
- [x] **Provider/garage/location data analysis** (2026-06-18) — `raw/principalandrepairersheets/outputs/`, reproducible via `outputs/_scripts/run_all.py`.
- [x] Actionable outputs: `provider_corpus_recommendation.csv`, `loc_principal_analysis.md`, `principal_address_worklist.md`.

### 1b.2 Corpus incorporation (per `docs/plans/phase-1-intake-and-case-tracking/corpus/dataverse-corpus-incorporation.md`) _(LOADED — scripts 10–14 + verify all passed 2026-06-19)_

- [x] `10-seed-workprovider.ps1` — `WorkProvider` **390 updated** (`Corpus 2026-06-18` provenance; SEED→active / ARCHIVE→inactive; name from address; domains/toggles preserved); 11 excluded, 2 review-skipped, 12 placeholder names. **The 37 over-length "principal codes" are EVA-export NAME-ARTIFACTS, not real codes** — `cr1bd_principalcode` **stays maxLength=8** (NOT widened). Disposition: **canonicalise the 5 active recurring businesses** (WHITELINE, BLACKLINE, SILVERLINE, PROACTIVE, WATERMANS); **defer SILVER 100** (different/unclear Case/PO process); **reclassify the within-24m individuals as VRM-keyed** (no Principal code); **disregard the 19 used >24 months ago**. Full list + dispositions: [docs/reference/over-length-principal-codes.md](./docs/reference/over-length-principal-codes.md). GGP→GG and ZEN==ZENITH merges deferred to the clarifying-info phase.
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
- [ ] 🔒 **Turn ON `intake` + `classify-persist` + `parse` for ONE inbox.** _(The M1 chain is **wired live via CLI** — orchestrator cards on `CS Intake`, repo reconciled; remaining is the operator/designer step: bind the parser connection, optionally re-arm the trigger when changing **`concurrency=1`**, flip the children ON.)_
- [ ] 🔒 **Send a test email** (PDF + 2 images: overview with legible plate + damage closeup).
- [ ] 🔒 **Confirm a Case appears**; status `new_email → ingested`; provider matched by sender domain; 12 fields pre-filled with provenance.
- [ ] 🔒 **Confirm Outlook categories** applied.
- [ ] 🔒 **Confirm dedup live** (ADR-0010).
- [ ] 🔒 **Provider-matching live validation** — intermediary domain does **not** auto-match.
- [ ] 🔒 **Scale to all three inboxes** — only after single-mailbox success.

---

## Phase 3 — Enrichment & EVA Sentry _(enrichment ON in Dev; EVA M1 path awaits activation; REST later)_

### 3a. Enrichment (DVSA/DVLA)

- [x] **Enrichment Function deployed + gate ON in Dev** ✅ (`ENRICHMENT_ENABLED=true`; live-verified `BC23JZE`→Ssangyong Rexton).
- [x] **Direct DVSA + DVLA** path; **Google Cloud gateway retired**. **B1 obviated.**
- [x] Enrichment **custom connector** + Bicep + mocked pytest; live-verified gate behaviour.
- [x] **DVSA/DVLA creds injected + `DVSA_TENANT_ID` set; Entra app registered/consented** — creds are now **Key Vault references** (verified live 200, 2026-06-23). _(was three separate remaining items — all done in Dev.)_
- [ ] 🔒 **Test/prod cutover** — the only enrichment residual: promote the verified Dev activation to a test/prod env (ADR-0006 mileage acceptance: estimate only when the document lacks it).

### 3b. EVA — JSON drag-drop (the current EVA path, pending the Minotaur patch)

> **Current path by vendor constraint, not a stop-gap.** JSON drag-drop is the live EVA path because
> Minotaur's Sentry API today supports only **one principal code** for API submissions — it cannot route
> the multiple work-provider codes our cases carry, so REST would funnel every case under a single work
> provider. Minotaur is patching this (no ETA). REST (3c) stays gated pending the patch **+ a parity test**.

- [x] **12-field EVA JSON serializer** built; exact order, 6-line address, enums.
- [x] **B3 resolved** — contract is **12 fields**.
- [x] `finalize-eva-box` flow built, imported `off`.
- [ ] 🔒 **Export 12-field JSON, drag-drop into EVA test**; confirm acceptance.

### 3c. EVA — Sentry REST API (later)

- [x] **Build the Sentry REST submit path** (v1.2) — `functions/evasentry`: two-request EVA `Files` submission (`/Instruction/Inspection` then `/Note/SubmitNote`), payload-hash idempotency; pytest **42/42**; `finalize-eva-box` refined. _(built; gated-OFF, Azure deploy pending.)_
- [ ] 🔒 **Vendor blocker — Minotaur one-principal-code limit.** Sentry currently accepts only one principal code per API submission, so REST cannot route our multiple work-provider codes. **Gated pending Minotaur's patch (no ETA) + a parity test** — this, not the absence of a test env (the test env exists; creds in Infisical), is why drag-drop (3b) is the current path.
- [ ] 🔒 **B5 — EVA test credentials** → Key Vault; flip `EVA_API_ENABLED=true` in test (after the Minotaur patch lands).
- [ ] 🔒 **Production cutover** — gated behind the parity test; operator-confirmed.

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
- [ ] **Corpus FULL REPLACE from the vetted 2-year EVA full-address export** (integrated 2026-06-24, **ADR-0016 _Proposed_**) — the EVA export (`fullevaexportinspectionaddresses.xlsx`, ~17,737 inspection rows with full street/postcode/site-name) **fully replaces** the inspection-address corpus (it is **not** an additive suggestion layer over the old rows). **Back up the current corpus to the repo FIRST**, then: profile the export → map each inspection to a **provider/Principal** via the **'Case ID' leading-alpha prefix** (e.g. `CCPY26050`→`CCPY`; a **VRM-shaped Case ID** is an **individual case keyed by VRM**, no Principal code) → dedup to unique physical sites on **full address** (provider + full address; postcode secondary) → import **every row as a SUGGESTION** (`decisionMode=Unknown`, nothing auto-confirms). **ADR-0013 stays binding** — staff still pick per case; all helper methods are **offline corpus-build only**, never a per-Case runtime resolver.
  - **"Always image-based" is operator-designated** for specific providers only — it is **not** statistically derived from the export (B4).
  - **Proximity ranking is implemented now** as a suggestion-**ordering** signal (never an auto-select, so ADR-0013 is not reopened): rank by accident location/postcode **when present** in the instruction (formats vary — opportunistic), else fall back to **claimant home-address** proximity (a soft signal, not a guarantee — they may have been travelling). Needs two best-effort parser extractions + gated geocoding (B5).
  - **Frequency + recency ranking is implemented now** and surfaced in the Code App now (not deferred to M2) (B6).
  - Plan: [docs/plans/phase-4-address-and-chaser/inspection-address-revamp.md](./docs/plans/phase-4-address-and-chaser/inspection-address-revamp.md).
- [ ] **Azure Maps (gated)** — only if needed (later); geocoding stays **offline corpus-mining** if ever used.

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

- [x] **Offline gate green** — `verify-all.mjs` **all gates green** (began at 7; now runs more, incl. the boundary grep-gate added in this phase).
- [x] **Static grep gate** / **flow-state assertion** / **no-credentials assertion**.
- [ ] 🔒 **Connection inventory** — `pac connection list` (operator evidence at activation).
- [ ] 🔒 **Deploy log** — record every `[DEPLOY-WITH-LOGIN]` + `[RESERVED-FOR-USER]` action.
- [ ] 🔒 **§7 live-validation checklist complete** across all three mailboxes — the M1 "done" definition.

---

## Phase 7 — Box-centric intake pivot (additive hybrid) _(schema + env-vars applied live, gates OFF; box-webhook Function deployed gated-OFF; connector + flows authored offline; NOT activated)_

An **additive** pivot: bring Box **earlier** (folder at parse-confirm) and **deeper** (File-Request chasers
+ webhook intake) **without moving the source of truth** — **Dataverse stays authoritative; Box is a one-way
mirror**. `[BUILD]` complete in the tree; the **Dataverse schema + env-vars are applied live in Dev (all
`BOX_*` gates OFF)** and the **`box-webhook` Function is deployed gated-OFF** (`cespkbox-fn-v76a47`,
secret-free); the connector + flows are authored offline, and **everything live beyond that is
`[RESERVED-FOR-USER]`**. Floor is **base Box Business** (metadata = Business Plus, out of scope now); **EVA
stays gated OFF**; **evidence is linked not embedded** (`BOX_EMBED_ENABLED` reserved/off — no `frame-src`
edit). Binding decision [ADR-0012](./docs/adr/0012-box-centric-intake-additive-hybrid.md); ordered build
[box-integration-pivot/plans/00-BUILD-PLAN.md](./box-integration-pivot/plans/00-BUILD-PLAN.md); phase docs
[docs/plans/phase-7-box-integration/](./docs/plans/phase-7-box-integration/). _(Live deploy narrative lives in CURRENT_STATUS; Phase≠Milestone map in milestone-model.md.)_

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

## Phase 8 — Inbox / Triage Management (additive) _(planned — ADR-0015 Proposed; integrated 2026-06-24)_

Classify **every** email at the 3 shared inboxes (not just attachment-bearing instructions) into the
operator's taxonomy — route work to the existing Case chain, everything else (queries / enquiries /
"other") to a lightweight triage record + queue. **Everything is categorised; there is no drop-junk
pre-filter** — spam simply lands in category `other`. **Deterministic MVP first; LLM gated and deferred.**
Cost is negligible: the deterministic classifier is **$0** (within the Power Automate seeded run limit at
~1–3k emails/mo); the later optional LLM pass is **~$0.21–1.50/mo** — track it as a **monitor**, not a cost
ceiling. Same additive pattern as Phase 7. Full plan:
[docs/plans/phase-8-inbox-management/README.md](./docs/plans/phase-8-inbox-management/README.md).

> **`.eml` retention rule (A7).** A raw `.eml` is persisted to Blob **only when a Case is extracted**. For
> query/other email **no `.eml` is persisted** — the mailbox keeps the mail and the triage row holds the
> metadata + a pointer.

### 8a. Phase A — deterministic MVP (offline build)

- [ ] **`/classify-email` parser route + `email_classifier.py`** — pure, unit-tested function reusing `VRM_RE` / `detect_audit_signals` / phrase tuples from `engine.py`; authored in **both** the vendored `functions/parser/` copy and the `cedocumentmapper_v2.0` sibling (keep `test_engine_vendored_in_sync` green).
- [x] **`cr1bd_inboundemail` triage table** + 2 additive choicesets (`cr1bd_inboundcategory` / `cr1bd_inboundsubtype`) + `inbound_*` audit actions — build step `26-inbound-email.ps1`; `verify-parity.mjs` extended. **Built offline 2026-06-24 (deploy-pending, operator applies).** Actions minted: `inbound_classified=100000024` / `inbound_routed=100000025` (the earlier "next free = 100000022" was stale — 100000022 is `location_assist_confirmed`, 100000023 `chaser_sent`, 100000026 `case_disposed`; **next free is now 100000027**).
- [ ] **`triage-classify` child flow** — create/update the triage row, call `/classify-email`, do the open-Case body-VRM lookup (never auto-link on ambiguity — ADR-0010), return the label.
- [ ] **Labelled corpus** — relabel the 12 existing fixtures + author synthetic query/enquiry/OOO/bounce `.eml`; **real PII-scrubbed mail = `[RESERVED-FOR-USER]`** (precision unverified until it lands).
- [ ] 🔒 **Intake restructure (Phase 2 prerequisite, live-designer):** flip `fetchOnlyWithAttachment` true→false + generalise Message-ID dedup + Switch-on-category, on **ONE inbox**, after single-mailbox activation. **Every email is classified** (spam → category `other`); there is **no drop-junk pre-filter**. The classifier is deterministic ($0 within the seeded run limit), so cost is a **monitor** rather than a ceiling.
- [ ] 🔒 **Classifier testing (gated operator step):** the operator drops real sample emails into the Phase-8 folder and the tests consume them — a planned Phase-8 sub-step to verify precision on real mail.

### 8b. Phase B — query queue + Code App "Inbox / Triage" screen _(planned)_
### 8c. Phase C — gated LLM assist (`cr1bd_EMAIL_AI_ENABLED`, default off) _(deferred; honours per-provider AI flags; gated by the Phase 9 AI-data-protection prerequisite)_

> **Sequencing:** reconcile the repo `intake.definition.json` to live (`Run_enrich`/`Run_case_resolve`) **before** any triage edit; run the locked decisions (new-table-vs-extend; the 4-quadrant + Other taxonomy) through `grill-with-docs` **before** applying schema. Avoid the triple-loaded "audit" term — name the new actions `inbound_*`.

---

## Phase 9 — Data Governance, Retention & Erasure (NEW) _(planned — ADR-0017 Proposed; the biggest substantive gap surfaced by the 2026-06-24 review)_

The automated pipeline now processes third-party claimant PII (names, VRMs, addresses, accident detail,
and — **only when a Case is extracted** — a retained `.eml`) across **Dataverse + Azure Blob + Box**, yet
only **image blobs** are ever purged. No retention policy, no erasure path, no privacy/DPIA artefacts. The
governance items below are **deferred — pending operator/legal** (G1–G4 / G6); the **retention period +
lawful basis** are operator/legal input (gated.md).

- [ ] **(deferred — pending operator/legal, G1)** **Retention model = two competing clocks** — GDPR data-minimisation **vs** an engineer-report **litigation / evidential hold** (reports can be disputed years later). Model both, not one expiry.
- [ ] **(deferred — pending operator, G1)** **Retention-clock schema** — `cr1bd_closedat` / `cr1bd_retentionexpiresat` (+ a legal-hold flag) on `cr1bd_case`; a scheduled **case-disposition** flow (sibling to `box-blob-purge`) that purges retained transient Blob bytes + anonymises/hard-deletes case + evidence PII after the window. **No automated deletion from Box** (see the principle below).
- [ ] **(deferred — pending operator, G4)** **DSAR / right-to-erasure cross-store runbook** — Dataverse (FetchXML) + Blob (prefix list) + **Box folder by Case/PO**. **DSAR blind spot:** PII-adjacent identifiers also live in **Box folder names, File-Request URLs, and Outlook category strings** outside Dataverse — the path must cover them.
- [ ] **(deferred — pending operator/legal, G3)** **Privacy notice / DPIA / controller-processor map** — `docs/architecture/data-protection.md` (Box = processor under the one-way mirror; EVA / DVSA / DVLA recipients); **ICO registration** + **DVLA data-use terms** named explicitly.
- [ ] **Lawful basis** recorded for DVSA/DVLA enrichment (legitimate interest; VRM-only outbound) and valuation (before `VALUATION_ENABLED`).
- [ ] **AI-data-protection sign-off (deferred, G5)** (gates `EMAIL_AI` / Box-AI / Copilot / vision) — PII pre-scrub, prefer **in-tenant Azure OpenAI** (no external retain/train). The data-protection **production** sign-off is deferred per gate, **but the operator has FULL AUTHORITY for AI testing on all repo data** — so the Phase-8 LLM classifier and the Phase-4a vision/geocode testing are **unblocked now**.
- [ ] **Audit-trail integrity** — enable native Dataverse auditing on case/evidence/auditevent; define the cascade-delete rule (what happens to `cr1bd_auditevent` when a Case is hard-deleted).
- [ ] **(deferred — pending operator)** **Store hardening before prod** (G6) — define **KV purge-protection** (blocks permanent secret deletion during the soft-delete window) on the enrichment/EVA/Box vaults; **Azure Blob `evidence` container soft-delete + versioning** (recoverable deletes — the hard pre-step before arming `box-blob-purge`).
- [ ] **No automated deletion from Box, ever (principle).** `box-blob-purge` only deletes **transient Azure Blob image bytes that are already archived to Box** — it never deletes the Box copy itself. There is **no automated deletion path into Box**.
- [ ] 🔒 **(deferred — pending operator/legal)** confirm the statutory **retention period** + **lawful basis** + **litigation-hold** rule (G1–G4 / G6 are recorded as deferred-pending-operator, not active work).

> **Staff least-privilege — the 3-role model (G8).** Build **User** (all case-intake actions) + **Admin**
> (settings + audit logs) **now**, offline and **gated-OFF**, as `cr1bd_*` security roles (the
> `roles-and-permissions.md` plan); **Engineer** (future assessment functionality) is **deferred / out of
> scope**. Track here or in Phase 2.
>
> **AI testing authority (G5).** Data-protection sign-off is **deferred**, **but** the operator has **full
> authority for AI testing on all repo data** — an enabler for the Phase-8 LLM classifier and the Phase-4a
> vision/geocode work.

## Blocker tracker (DEPLOY-RUNBOOK §0)

> The consolidated hard/soft operator registry is **[docs/gated.md](./docs/gated.md)**. The table
> below is the **Power-Platform-era** M1 deploy-blocker snapshot (historical — most were resolved before the
> migration; the **live** Azure remediation backlog is in **Now / Next / Later** above). The retained
> Functions and EVA/Box/OCR domain blockers carried over onto the Azure stack.

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

> A real email in one shared inbox becomes a tracked **Case** (now persisted in **Postgres** via the
> `cespk-api-dev` data API, surfaced in the Static Web App SPA), is parsed + (optionally) enriched into the
> **12 EVA fields** with provenance, passes a human readiness review, and is exported to **EVA** as drag-drop
> JSON with a **Box** archive folder — with dedup, provider matching, and the inspection-address gate all
> behaving per the offline decision-table tests. The domain definition is unchanged by the migration; the
> remaining gate is **live automated intake**, which depends on deploying `cespk-orch-dev` + the Exchange-RBAC
> mailbox scoping (see Now / Next / Later).

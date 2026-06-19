# CURRENT_STATUS — collisionspike

_Single source of truth for "where are we now." Last updated **2026-06-19**._
_Companion docs: [README.md](./README.md) · [PLAN.md](./PLAN.md) · [DEPLOY-RUNBOOK.md](./DEPLOY-RUNBOOK.md) · [ROADMAP.md](./ROADMAP.md) · [docs/gated.md](./docs/gated.md)._

> **Role split.** This **CURRENT_STATUS** is the snapshot of what is live *now*.
> [ROADMAP.md](./ROADMAP.md) is the forward phased checklist; [docs/gated.md](./docs/gated.md) is
> everything that needs the operator; plans live under [docs/plans/](./docs/plans/).

This is the Phase-1 (M1) case-intake spike on the Microsoft stack (Power Apps **Code App** +
Dataverse + Power Automate + Azure Functions). Built **offline**; live activation of anything that
touches the shared inboxes / SharePoint / Box / EVA is the **operator's** step (see the boundary in
DEPLOY-RUNBOOK). **Principle: no mock/seed case data in the app — it shows real Dataverse rows only.**

---

## 🔔 Update — 2026-06-19 (late): M1 flow chain WIRED LIVE via CLI (branch `fix/flow-chain-live-reconcile`)
The **M1 flow chain is now wired LIVE** end-to-end via the Dataverse API (CLI), and the repo is
**reconciled to the live flows** so a future solution re-import can't regress them:
- **Orchestrator cards added to `CS Intake`.** The live intake now carries `Init_caseId` +
  `Capture_caseId_matched`/`Capture_caseId_unassigned` + the **3 Run-a-Child-Flow cards**
  (`Run_classify_persist` → `Run_parse` → `Run_status_evaluate`) that pass `caseId` down the chain.
  These were already present in `flows/definitions/intake.definition.json` (the orchestrator target) —
  confirmed byte-for-byte, no change needed there.
- **Webhook preserved.** The Office 365 `OnNewEmailV3` **trigger node was kept byte-identical** so the
  existing digital@ webhook subscription survives (clientdata can't re-arm an Office 365 webhook —
  memory `flow-webhook-trigger-provisioning`).
- **classify-persist creating Evidence — VERIFIED by a live test email** (the child now receives the
  attachments array + subject/from and writes one `cr1bd_evidences` row per attachment to Blob).
- **Two live BUG FIXES reconciled into the repo** (`flows/definitions/`):
  1. **`payloadhash` truncation (real bug, both intake variants).** The Case-create actions wrote the
     `subject|from` seed un-truncated → `cr1bd_payloadhash` (MaxLength **80**) overflowed (**89 chars**)
     → long-subject emails created **NO case**. Wrapped the value in **`@take(..., 80)`** in
     `Create_case_matched` **and** `Create_case_unassigned` in **both** `intake.definition.json` and
     `intake-shared-mailbox.definition.json`.
  2. **Child flows need a `Response` action** to be callable via Run-a-Child-Flow. Added
     `Respond_to_parent` ("Respond to a PowerApp or flow") to **`parse.definition.json`**
     (returns `instructionBytesB64`/`instructionName` + `parsed`/`contractVersion`) and
     **`status-evaluate.definition.json`** (returns the readiness result: `status`/`statusCode` +
     `fieldsValid`/`imagesValid`). `classify-persist.definition.json` already had one.
- **Parser runtime apiId** — definitions correctly bind the **portable logical** id `shared_ceparser`
  (matched against `connection-references.json`; ALM rebinds to the physical runtime id at import), so
  **no stale `new_collision-…` apiId existed in any definition** to fix. Recorded the physical runtime
  id (`shared_new-5fcollision-20engineers-20parser-5ff48c20e0e0674f63`) in `flows/README.md` for the
  operator's connection bind only.
- **Gate: `node verify-all.mjs` = 6/6** (Code App build + 204 vitest, Dataverse parity, **flow linter
  114/114**, parser 37 / enrichment 18 pytest).
- **Residuals (not regressions):** (a) the **parser Function 502** is being fixed separately
  (`Audit_parser_failed` already absorbs a parser 5xx so status still advances to needs_review);
  (b) the intake trigger **`concurrency = 1`** is the documented **webhook-risk** edit, **deferred** —
  changing it re-arms the live webhook in the designer.

---

## 🔔 Update — 2026-06-19 (review 190626 actioned): UI/UX review pass (branch `review/190626-ui-pass`)
The binding manual review **`docs/reviews/190626/`** was actioned end-to-end — **all 8 tasks (~44 issues)**,
checklist complete, **built green + 204/204 tests + pushed live (`pac code push`) + verified on the deployed
player**. Headlines:
- **Nav IA re-cut:** first-class expandable **Queues** group → Instructions (awaiting images) / Images only /
  Ready for review / **Exceptions**; **Corpus→Provider settings**, **Audit→Action logs** (real page over the
  audit seam); new **Add evidence** second intake; **Done-today** dropped as a page.
- **Dashboard:** funnel re-cut to **New / Not ready / Review / Submitted** (Parsing/Box/Chasing/Ready folded
  in); redundant "drainable now" row + dev copy removed; Exceptions bar added.
- **Case view + chasers** decluttered: Export-JSON gated to ready, minimalistic Job-Sheet chasers (no
  Mark-held / ADR caption; "Log as chased" auto-note), one no-image warning, "Imported details" panel.
- **New case** rebuilt (17 fixes): drag-drop, automatic case-type, **split identity fields**
  (VRM / Work provider / Principal / Case-PO / Claim No / Insured Name), **Date of Incident**, gated DVLA/DVSA
  **"Look up vehicle"** + postcodes.io **"Normalise address"**, manual-entry path, EVA required set; no dev copy.
- **Provider settings** (was Corpus): reference-data cards (Repairers 61 / Image sources 23 / Inspection
  addresses 174); de-jargoned assisted-import.
- **Broad-review:** removed the floating red `SectionHeading` hairline; documented the **EVA field model**
  (`docs/architecture/eva-field-model.md`) + the **5 enrichment/AI status checks** — DVLA/DVSA **gated-off**
  (make/model/mileage only, **no VAT**), OCR built-not-deployed, postcodes.io **live**, AI/Document-AI
  **not present** (parsing is PyMuPDF). New gated `data/enrichment-client.ts`.
- **Convention:** `docs/reviews/<DDMMYY>/` reviews are now documented as **binding** (README + CLAUDE.md +
  AGENTS.md) — superseded only by a later review.

---

## 🔔 Update — 2026-06-19 (PM): Azure deploys live + UI pass (branch `feat/m1-live-activation`)
- **Parser Function REDEPLOYED** (`cespike-parser-dev-…`, FC1). Vendored the EVA payload schema into the
  package (`functions/parser/contracts/`) + fixed the resolver order, so `/api/parse` no longer emits a
  spurious `schema_unavailable` issue. **Live-verified:** returns the 12 EVA fields incl. **B2**
  `claimant_telephone` (`07700900123`) + `claimant_email` extracted from document text. (B2 → **Done**.)
- **Address-match Function DEPLOYED** (`cespkaddr-fn-i7m4re`, FC1, `POST /api/match-address`). Live-verified:
  part-postcode `M1` → district match over candidate sites, postcode.io reachable. (ROADMAP 4a → deployed.)
- **OCR host — DEPLOYED 2026-06-19 (Running).** Function App `cespkocr-fn-dev-glju3v` (Functions-on-ACA,
  scale-to-zero 0..5, HTTPS-only) pulls `ce-ocr:latest` from ACR `cespkocracraeee76`. The prior 3×
  `Failed to provision revision … Operation expired` was the **AcrPull RBAC-propagation race** (the role
  was created in the same deployment as the app); fixed with a **pre-granted user-assigned identity** for
  AcrPull (separate ARM deploy) + `siteConfig.acrUserManagedIdentityID` (PR #7). Connector wiring +
  `OCR_SCANNED_PDF_ENABLED`/`PLATE_OCR_ENABLED` flip remain. (ROADMAP 5a / B-full → deployed.)
- **Live UI/UX pass** (Chrome DevTools, deployed app): logo renders (data-URI), **real Dataverse data**
  (2 NEW cases, no mock), dashboard KPIs + nav + manual-intake screen render, honest empty states, **no CSP
  violations / no font errors**, parser connector **consented**. One pre-existing **non-fatal** console
  error remains (`React.createElement … undefined`; app renders fully). The browser file-upload→parse click
  couldn't be automated through the nested player iframe, but the parse path is verified end-to-end at the
  connector API level + the connection is consented.
- **Architecture review** run as a multi-agent ultracode workflow (Azure efficiency / Code App / flows /
  dead-code / UI-UX, with adversarial verification) — see the final report.
- **M1 flow-chain activation: prepared + de-risked, NOT forced.** Verified the live `CS Intake` is the
  **simple** (non-orchestrator) flow and the children (`classify-persist`/`parse`/`status-evaluate`) are
  **OFF + stale** vs the repo. Full activation re-arms the live webhook + rebinds Run-a-Child-Flow cards —
  genuine `[RESERVED-FOR-USER]` designer work that must **not** be forced via API onto the working digital@
  webhook. Precise steps captured in **`docs/activation/m1-flow-chain-activation.md`**.
  **→ SUPERSEDED by the 2026-06-19 (late) update above: the chain was subsequently WIRED LIVE via CLI**
  (orchestrator cards added to `CS Intake`, the `OnNewEmailV3` trigger node kept byte-identical so the
  webhook survived, classify-persist creating Evidence verified by a live test email). Residuals there:
  parser 502 (fixed separately) + trigger `concurrency=1` (still the deferred webhook-risk edit).
- **Deliberately NOT deployed (resource-conscious):** `evavalidation` (status-evaluate does readiness
  inline → the connector is unused by design) and `evasentry` (EVA REST is Phase 3c/M2; M1 uses JSON
  drag-drop). All deployed compute is FC1 (~£0 idle) or ACA scale-to-zero.

## 🔔 Update — 2026-06-19: parser connector wired, corpus loaded, EVA/address/OCR built (gated-OFF)
- **Manual-intake parse is no longer CSP-blocked.** The CE Parser custom connector
  (`new_collision-20engineers-20parser`) was updated to expose the `api_key` parameter (the
  `x-functions-key` was previously undefined, so connections couldn't carry it); a **Connected**
  connection now exists (`01b43be8542148efbcd1284b8ca64013`, "Collision Engineers Parser"), so
  connection reference `cr1bd_ceparser` is now **Bound**. The Code App calls the parser through it
  (`pac code add-data-source` → `CollisionEngineersParserService`; bridged by
  `src/data/parser-connector-transport.ts`). The **old raw-fetch path was removed** —
  `mockup-app/src/data/parser-config.ts` deleted and `fetchParserTransport` gone — so the function
  key is **no longer in the client bundle** (it lives on the connection). **204/204 app tests pass**;
  app rebuilt + pushed.
- **Provider corpus incorporation LOADED** — `dataverse/.build/10–14` ran idempotently and all
  14-verify checks **PASSED**: `WorkProvider` **390 updated** (`Corpus 2026-06-18` provenance,
  SEED→active / ARCHIVE→inactive; 11 excluded, 2 review-skipped, 12 placeholder names);
  `Repairer` **20** named full-postcode yards + **14** garage matches; `InspectionAddress` **174**
  rows (all Confirmed Physical, all with postcodes); `ImageSource(kind=repairer)` **20** with **98**
  WorkProvider N:N links. **37 principal codes >8 chars deferred** (operator: widen
  `cr1bd_principalcode` or supply ≤8-char codes); GGP→GG and ZEN==ZENITH merges deferred to the
  clarifying-info phase.
- **Built this session, gated-OFF, DEPLOY PENDING (not yet live):** EVA Sentry REST v1.2
  (`functions/evasentry` — two-request `Files` submission `/Instruction/Inspection` → `/Note/SubmitNote`,
  payload-hash idempotency, pytest **42/42**; `finalize-eva-box` refined); inspection-address matching
  Function (`functions/addressmatch`, ROADMAP 4a — part-postcode `Loc` → corpus yard via district
  `startswith`; postcode.io); **OCR host** (`ocr/`, ROADMAP 5a, **no longer deferred** — scanned/image-PDF
  fallback, Dockerfile + Azure Container Apps Bicep + plate/pdf adapters); parser **B2** (claimant
  telephone/email now extracted with provenance + tests); plans authored for every remaining phase
  (3c/4a/5a/5b/5c) + `docs/plans/README.md`; IaC hardened (workspace-based App Insights, storage
  `allowSharedKeyAccess:false`, right-sized memory).
- **Known follow-ups (still pending):** Azure deploys for `evasentry`, `addressmatch`, `ocr` (ACA:
  build+push image then deploy Bicep), and the **parser Function REDEPLOY** (also fixes
  `EVA_PAYLOAD_SCHEMA_PATH` so the EVA payload schema loads from the package, not cwd); the **Phase-1
  flow-chain activation on `digital@`** (turn on classify-persist / parse / status-evaluate, bind
  `cr1bd_evidenceblob`, re-publish the intake orchestrator); operator-gated items unchanged (live
  Info/Engineers/Desk inboxes, DVSA/DVLA/EVA/Box secret injection, EVA test drag-drop).
  (`evavalidation` could later fold into the parser Function app — both secret-free Python.)

## 🔔 Update — 2026-06-18 (PM): live debug session (verified against cloud + deployed app)
- **Email intake is now LIVE & verified.** Root cause of "emails don't create cases": the `CS Intake`
  flow had only ever been **injected via the Dataverse `clientdata` API**, so its Office 365 webhook
  subscription was never registered (Flow `/triggers` API = 500, **zero runs ever**, even though the
  flow showed *On* with the correct V3 trigger and `digital@` bound). Neither a Flow-API stop/start nor
  a plain designer Save fixed it. **Fix:** in the make.powerautomate.com designer, deleted the trigger
  and **re-added a fresh "When a new email arrives (V3)"** (re-enabling concurrency=1 to clear
  `CannotDisableTriggerConcurrency`), then Saved → a test email produced a **Succeeded** run and a real
  `cr1bd_cases` row. See memory `flow-webhook-trigger-provisioning`.
- **Logo is NOT broken** — confirmed on the live deployed app via Chrome DevTools (both logo assets
  HTTP 200, no font/CSP errors, current build hash). Earlier reports were a **cached old build**;
  hard-refresh resolves it. (One unrelated console error remains: `React.createElement … undefined`.)
- **Manual-intake "parse" — root cause found:** the deployed Code App is blocked by the **Code App CSP
  default `connect-src 'none'`**, which forbids the app's raw cross-origin `fetch()` to the parser
  Function. The Function + CORS are healthy (curl: OPTIONS 204, POST 400, correct ACAO). **Fix (chosen):**
  route through the **CE Parser custom connector** (same-origin via the SDK; key in the connection).
  **Done 2026-06-19** — connector exposes `api_key`, connection `01b43be8…` Connected, app calls
  `CollisionEngineersParserService`; raw-fetch path deleted. See memory `codeapp-csp-use-connectors`.

## ✅ Live now (Sandbox `Collision Engineers - Dev`, NOT Default)

| Piece | Status | Where |
|---|---|---|
| **Parser Function** | Live, extracting real PDFs (provider/claimant/dates/address/VRM/ref), 12-field EVA contract, function-level auth | Azure **Flex Consumption (FC1)**, `cespike-parser-dev-…`, UK South |
| **Dataverse schema** | Built — 11 tables, 19 choice sets, 15 relationships, 3 alt keys, 11 env-vars | Solution `CollisionSpike`, prefix `cr1bd` |
| **Provider corpus** | **Incorporated + 2026-06-19 verify passed** — `WorkProvider` **390 updated** (SEED→active / ARCHIVE→inactive, `Corpus 2026-06-18` provenance; 37 over-length codes deferred), `Repairer` **20** named yards + **14** garage matches, `ImageSource(kind=repairer)` **20** (shared storage yards), `InspectionAddress` **174** known-sites (all Confirmed Physical), **98** N:N links. Idempotent (`dataverse/.build/10–14`); all 14-verify checks passed. | Sandbox |
| **Parser custom connector** | Created, points at the live host | Sandbox |
| **Code App** | Live + wired to Dataverse; **manual-intake** (upload → parse → Case) works, **parse now routed via the CE Parser connector** (no longer CSP-blocked; key off the bundle); logo/fonts/nav fixed | `mockup-app/`, app `da7ba7af-…` |
| **Enrichment Function** | Deployed **gated-OFF**; calls **DVSA + DVLA directly** (Entra `client_credentials` + `X-API-Key`); **no Google Cloud gateway** | `cespkenrich-fn-…`, KV `cespkenrichkv…` |
| **Cloud flows (×10)** | Imported **`state=off`**; connection refs unbound | Solution `CollisionSpikeFlows` |

## ⛔ Built but NOT activated (operator-gated — live-services boundary)

- **Live email intake** — the intake flow is imported **off** with **placeholder connector bindings**
  (real names: `SharedMailboxOnNewEmailV2` / `folderId` / `hasAttachments`). It has a **MinIntakeDate
  guard (2026-06-17)** + an **attachment filter** (documented as temporary, to be replaced by full
  email routing later). Until the operator binds the Outlook shared-mailbox connection and turns it on,
  **no emails become Cases** → see "Why emails don't show" below.
- **EVA / Box** — EVA is JSON drag-drop now (`EVA_API_ENABLED=false`); Sentry REST API later. Box
  archival not activated. Needs EVA **test** creds in Key Vault + Box folder-casing confirmation (B5).
- **Enrichment** — `ENRICHMENT_ENABLED=false` in the Sandbox; needs DVSA/DVLA creds in Key Vault +
  `DVSA_TENANT_ID` (operator), then flip the gate in a test env.

## 🔎 "Emails don't show/populate" — RESOLVED 2026-06-18 (PM)

The app was always **correct** — it renders Cases from Dataverse (`cr1bd_cases`). The empty state was
real because the `CS Intake` flow's **Office 365 webhook subscription was never provisioned** (it had
been API-injected, never published through the Flow service). After rebuilding the V3 trigger in the
designer, an inbound email to `digital@collisionengineers.co.uk` now creates a `cr1bd_cases` row
(verified: Succeeded run + Case "CE intake test 4 fresh trigger"). Still **no mock data** — these are
real email-sourced rows. Remaining email gates: provider **auto-match** needs `knownemaildomains`
seeded (run `dataverse/.build/15-seed-emaildomains.ps1`), and downstream `Classify+Persist` / `Parse`
/ `Status Evaluate` are still `off` (so attachments/evidence/parse/status don't advance yet).

---

## 🆕 This session (2026-06-18)

- **Provider/garage/location data analysis** — `raw/principalandrepairersheets/` EVA exports analysed
  into `raw/principalandrepairersheets/outputs/` (tasks 1–8 + `claudeschoice/` + `reports/`),
  reproducible via `outputs/_scripts/run_all.py`. Headlines: EVA **principal code is the join key**
  (not the name; LEGAL names are "FAO The Court" placeholders — firm is in the address); the REPAIRER
  list (Scottish) ≠ where inspections happen (English storage yards); **137 active principals are not
  on the job sheet**; 264/440 principals dormant >12m; 57% of located cases carry only a **part
  postcode**. Actionable outputs: `reports/provider_corpus_recommendation.csv`,
  `reports/loc_principal_analysis.md`, `reports/principal_address_worklist.md`. See the memory note
  `provider-corpus-analysis`.
- **Corpus incorporated into live Dataverse** — `dataverse/.build/10–14` (+`_corpus-common.ps1`) loaded the
  confirmed analysis: WorkProvider 45→**392** (176 active / 216 archived-dormant), Repairer 38→**61**,
  ImageSource 4→**23** (shared yards), **174** `InspectionAddress` known-sites, **98** N:N links. §9 verify
  passed; idempotent re-run = no-op. Plans: `docs/plans/phase-1-intake-and-case-tracking/corpus/dataverse-corpus-incorporation.md` (confirmed) +
  `docs/plans/phase-1-intake-and-case-tracking/corpus/clarifying-info-ingestion.md` (the operator-confirmed second phase).
- **Research** — `docs/research/` (00 strategy + 01 Power-Platform + 02 Azure/AI + 03 domain + index):
  next moves = activate intake (operator) ∥ corpus incorporation (done) → **address-matching + fast-confirm**;
  explicit anti-features (no EVA REST / image-AI / AI Search / mock data yet).
- **Code App fixes** — broken **logo** (top-left) and brand **fonts** now bundle correctly under the
  Code App subpath (moved `public/assets`+`public/fonts` → `src/`, imported as modules / relative
  `url()`, Vite-fingerprinted); added a **Dashboard** nav item to the rail. `npm run build` green.
- **Email-population diagnosis** (above) — no code change; documented activation path.

## 🟡 Decisions needed (surfaced 2026-06-18)

> Tracked in the operator registry **[docs/gated.md](./docs/gated.md)** — H10 (sender domains) and
> S10 (over-length principal codes; the column was already widened 8→12, so loading works now).

1. **Email auto-matching needs sender domains.** Provider matching is by **sender email domain only**
   (`WorkProvider.knownemaildomains`). The data analysis carried **no domains**, so only the ~16
   prior-seeded providers have one — the other ~376 of the 392 are **blank**, so nothing will auto-match
   until domains are supplied. **Action:** provide per-provider sender domain(s) (from the job-sheet Inbox
   column or sample real emails); then `15-seed-emaildomains.ps1` upserts them idempotently. A domain that
   maps to >1 active provider is an **intermediary** (ADR-0011), not a provider domain.
2. **37 principal codes exceed the 8-char `principalcode` cap** (e.g. `R1AMMCLASS`, `THECARHIRE`,
   `T&KMOTORS`) — EVA-export truncation artifacts; skipped by the incorporation. **Action:** either widen
   the `cr1bd_principalcode` column, or supply canonical ≤8-char codes (it is the Box/Case-PO prefix).

## Blockers (DEPLOY-RUNBOOK §0)

> Full hard/soft operator registry: **[docs/gated.md](./docs/gated.md)**. M1 snapshot below.

| ID | State |
|---|---|
| B1 gateway grant | **Obviated** — gateway removed, direct DVSA/DVLA |
| B3 13th EVA field | **Resolved** — contract is 12 fields |
| B4 Code Apps enablement | **Resolved** — enabled on the env; app pushed |
| B2 parser telephone/email | **Built** — claimant telephone/email now extracted with provenance + tests; parser REDEPLOY pending to go live |
| B5 EVA creds + Box casing | **Open** — operator (EVA test creds in KV, Box UPPERCASE folder check) |

## Key docs
- **Operational charter / rules:** [AGENTS.md](./AGENTS.md) · **Live ID/resource/flow registry:** [docs/architecture/live-environment.md](./docs/architecture/live-environment.md)
- Analysis: `raw/principalandrepairersheets/outputs/reports/`
- Architecture: `docs/architecture/` · ADRs: `docs/adr/` (corpus model = ADR-0011)
- Plans: `docs/plans/` · Roadmap: `ROADMAP.md` · Deploy: `DEPLOY-RUNBOOK.md`

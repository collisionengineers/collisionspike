# CURRENT_STATUS — collisionspike

_Single source of truth for "where are we now." Last updated **2026-06-18**._
_Companion docs: [README.md](./README.md) · [PLAN.md](./PLAN.md) · [DEPLOY-RUNBOOK.md](./DEPLOY-RUNBOOK.md) · [ROADMAP.md](./ROADMAP.md)._

This is the Phase-1 (M1) case-intake spike on the Microsoft stack (Power Apps **Code App** +
Dataverse + Power Automate + Azure Functions). Built **offline**; live activation of anything that
touches the shared inboxes / SharePoint / Box / EVA is the **operator's** step (see the boundary in
DEPLOY-RUNBOOK). **Principle: no mock/seed case data in the app — it shows real Dataverse rows only.**

---

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
  Pending implementation. See memory `codeapp-csp-use-connectors`.

## ✅ Live now (Sandbox `Collision Engineers - Dev`, NOT Default)

| Piece | Status | Where |
|---|---|---|
| **Parser Function** | Live, extracting real PDFs (provider/claimant/dates/address/VRM/ref), 12-field EVA contract, function-level auth | Azure **Flex Consumption (FC1)**, `cespike-parser-dev-…`, UK South |
| **Dataverse schema** | Built — 11 tables, 19 choice sets, 15 relationships, 3 alt keys, 11 env-vars | Solution `CollisionSpike`, prefix `cr1bd` |
| **Provider corpus** | **Incorporated from the full analysis** — `WorkProvider` **392** (176 active / 216 archived-dormant), `Repairer` **61**, `ImageSource` **23** (shared storage yards), `InspectionAddress` **174** known-sites, **98** N:N links. Idempotent (`dataverse/.build/10–14`); §9 verify passed. | Sandbox |
| **Parser custom connector** | Created, points at the live host | Sandbox |
| **Code App** | Live + wired to Dataverse; **manual-intake** (upload → parse → Case) works; **logo/fonts/nav fixed this session** | `mockup-app/`, app `da7ba7af-…` |
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
  passed; idempotent re-run = no-op. Plans: `plans/dataverse-corpus-incorporation.md` (confirmed) +
  `plans/clarifying-info-ingestion.md` (the operator-confirmed second phase).
- **Research** — `docs/research/` (00 strategy + 01 Power-Platform + 02 Azure/AI + 03 domain + index):
  next moves = activate intake (operator) ∥ corpus incorporation (done) → **address-matching + fast-confirm**;
  explicit anti-features (no EVA REST / image-AI / AI Search / mock data yet).
- **Code App fixes** — broken **logo** (top-left) and brand **fonts** now bundle correctly under the
  Code App subpath (moved `public/assets`+`public/fonts` → `src/`, imported as modules / relative
  `url()`, Vite-fingerprinted); added a **Dashboard** nav item to the rail. `npm run build` green.
- **Email-population diagnosis** (above) — no code change; documented activation path.

## 🟡 Decisions needed (surfaced 2026-06-18)

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

| ID | State |
|---|---|
| B1 gateway grant | **Obviated** — gateway removed, direct DVSA/DVLA |
| B3 13th EVA field | **Resolved** — contract is 12 fields |
| B4 Code Apps enablement | **Resolved** — enabled on the env; app pushed |
| B2 parser telephone/email | **Partial** — those 2 EVA fields arrive empty (staff fill); needs sibling parser change |
| B5 EVA creds + Box casing | **Open** — operator (EVA test creds in KV, Box UPPERCASE folder check) |

## Key docs
- **Operational charter / rules:** [AGENTS.md](./AGENTS.md) · **Live ID/resource/flow registry:** [docs/architecture/live-environment.md](./docs/architecture/live-environment.md)
- Analysis: `raw/principalandrepairersheets/outputs/reports/`
- Architecture: `docs/architecture/` · ADRs: `docs/adr/` (corpus model = ADR-0011)
- Plans: `plans/` · Roadmap: `ROADMAP.md` · Deploy: `DEPLOY-RUNBOOK.md`

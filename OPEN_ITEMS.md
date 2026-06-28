# OPEN_ITEMS.md — the Azure migration-remediation backlog

_The single worklist of what is **not done** on the **live Azure PaaS stack**. The spike was migrated from
Power Platform to Azure (Static Web App + Function-App data API + orchestration Function + Postgres Flexible
Server + the retained Python Functions); the **Power-Platform implementation is decommissioned**. The
near-term work is **finishing the migration to production-grade**: deploy orchestration + scope the 3 intake
mailboxes for live intake, the **P0 DB-security** fix, the **Free-Trial→PAYG** upgrade, **durable API
hardening**, **staff app-role assignment**, and an **IaC config layer** — with the **domain milestones
(EVA, enrichment, Box, OCR, governance) re-homed onto Azure**. Last reframed **2026-06-26**._

**How this differs from the other status docs** (precedence unchanged — a binding review > ADRs >
architecture/requirements > plans):
- [ROADMAP.md](./ROADMAP.md) — forward phased checklist + the *Now / Next / Later* Azure backlog.
- [CURRENT_STATUS.md](./CURRENT_STATUS.md) — what is **live now** (the canonical Azure registry).
- [docs/gated.md](./docs/gated.md) — the operator hard/soft blocker registry.
- [migration/](./migration/) — the executed Power-Platform→Azure migration plans + parity harness.
- **OPEN_ITEMS.md (this file)** — the **single flat remediation list**, each item tagged with who can do it.

### Legend
- **[P0]** — production-blocking security/availability issue on the live Azure stack; do first.
- **[OPERATOR]** — needs the operator: an Azure subscription/role change, a secret, an Exchange-RBAC grant,
  a gate flip, or live Outlook/Box/EVA contact, or business data. _Claude builds; the operator activates._
- **[BUILD]** — buildable now in the repo (code/IaC/config), no operator/secret/live-service dependency.
- **[DEFERRED]** — deferred by design to a later milestone (M2/M3) or behind another item.
- **[DRIFT]** — doc-vs-code mismatch to reconcile (no functional change).

---

## A. Migration remediation backlog (live Azure PaaS) — the current frontier

> The verified live stack: RG `rg-collisionspike-dev` (uksouth) on subscription `e6076573-…` (**Azure Free
> Trial**). SPA `cespk-spa-dev` · data API `cespk-api-dev` (→ Postgres) · orchestration `cespk-orch-dev`
> (**DEPLOYED + WIRED — 41 functions — but NOT yet live**: no Graph subscriptions, mailboxes not yet
> Exchange-RBAC-scoped) · Postgres `cespk-pg-dev` (36 tables; `case_ = 0`) · the 6 retained Python
> Functions · Key Vaults · Blob `cespkevidstdev01`. Today the system is **read-only + manual case-create**.

### A* — 2026-06-28 session frontier (start here)

_What this session changed and the exact next actions. Workstream tags (WS#) match the remediation plan._

- **[BLOCKER · OPERATOR · this session] Azure CLI session re-auth.** The `az` session token expired
  mid-session — `az` **and** the MCP credential chain both return *"a token that does not exist"* / 401, so
  **no live Azure change can be made until** the operator runs `! az login`. Every Azure step below waits on
  this. (Local/offline work and Box-credential proof did **not** need it.)
- **[DONE 2026-06-28 · WS2] Box JWT credentials PROVEN working.** New keypair generated; full `Config.JSON`
  dropped at repo root (`941197__config.json`, **gitignored**). Verified end-to-end vs `api.box.com`: token
  mint **HTTP 200** + authenticated `GET /2.0/folders/392761581105` **HTTP 200** (the Service Account is a
  collaborator on the allowed root; the app **is** Admin-authorized — **no reauthorization needed**).
- **[DONE 2026-06-28 · WS2] Box wiring + activation COMPLETE — Box is LIVE.** Stored the `Config.JSON` as
  the KV secret **`box-config-json`** (the load-bearing piece — *not* "3 secrets"; the webhook keys already
  matched), wired the **`BOX_CONFIG_JSON`** app-setting on `cespkbox-fn-v76a47`, and **redeployed box-fn**
  (the active deploy predated the JWT code → it was still minting via CCG; that, not just the missing
  secret, caused the 502). Live smoke-test **`GET /api/box/folders/392761581105/items` → HTTP 200**
  (folder `CCPY26050`). `BOX_*` gates set on `cespk-api-dev` + `cespk-orch-dev`. Record:
  **[docs/handoff/02-box-activation.md](./docs/handoff/02-box-activation.md)**. **REMAINING (operator/Box-side):**
  File-Request template id → `BOX_FILE_REQUEST_TEMPLATE_ID`; `FILE.UPLOADED` webhook subscription;
  scope-lock decision for prod (`BOX_ALLOWED_ROOT_ID`).
- **[DONE 2026-06-28 · WS1] Email pipeline — triage-first + body-only + parser route.** Intake now classifies
  every email (receiving_work → Case; query/other → `inbound_email`, no case) and carries the body for
  body-only instructions; parser **`/classify-email` redeployed** (both `classify_email` + `parse` live on
  `cespike-parser-dev-x7xt3d5ovhi7y`). See WS1 detail in A1 below.
- **[OPERATOR · WS1b] Email go-live** — Exchange-RBAC `Application Mail.Read` grant (read-only) over the
  intake mailboxes, then `graph-renew` self-bootstraps the subscriptions. **Test** with `digital@` +
  `engineers@`; **production** mailboxes = **`info@` + `engineers@` + `desk@`** (drop `digital@` — it is the
  operator's personal dev mailbox, test-only). Add an Azure Monitor heartbeat alert on intake.
- **[WS3] OCR + Location-assist.** OCR: the parser does scanned-PDF OCR **in-process** (vendored
  `pytesseract`, 2-page cap) — confirm whether the standalone OCR Function (`cespkocr-fn-dev-glju3v`,
  tesseract + `fast_alpr` plate reader) is meant to be invoked (likely plate-reading) or is redundant.
  Location-assist (`functions/location-suggest/`) is offline-built, **deploy-pending**: needs an Azure Maps
  account (**none exists**) + a Vision endpoint — the AIServices S0 `digital-3339-resource` provides Image
  Analysis, so it is **probably the Vision backend, not waste** (see WS4). Deploy keyless/MI; the bicep's
  `cr1bd_*` gate comments are stale Power-Platform framing.
- **[WS4] Cost (no billing change — flag only).** App Insights has no sampling/cap (the one sleeper bill);
  `digital-3339-resource` (AIServices S0) — **do not tear down**, likely load-bearing for location-assist
  Vision. Keep ACR Basic (OCR needs the image). **#1 existential risk = the Free-Trial→PAYG ~30-day deadline.**
- **[OPERATOR · WS6] Identity** — assign `CollisionSpike.User`/`Superuser` to the remaining staff (only one
  principal assigned → others 403). Verify the orch MI can call the Data API internal routes.
- **[WS7] Verification + status refresh** — once intake is live + Box wired: run the `triage-corpus`
  end-to-end checks, KQL error sweep, and reconcile `CURRENT_STATUS.md` / `live-environment.md`.

### A0 — P0 / hard deadlines (do first)
- **[DONE 2026-06-26]** **Database-security remediation.** The data API (`cespk-api-dev`) now connects to
  Postgres as the **non-owner login `cespk_app`** (`rolsuper=false`, `rolbypassrls=false`; password a **Key
  Vault reference**, no cleartext), so the authored **RLS is enforced** (the prior server-admin `csadmin`
  connection bypassed it). DB app-role set per connection via `-c app.role=staff` (the `PGAPPROLE`
  app-setting); grants least-privilege — no DELETE on any table, `audit_event` INSERT/SELECT only (append-only).
- **[OPERATOR]** **Free-Trial → Pay-As-You-Go upgrade.** Subscription `e6076573-…` is an **Azure Free Trial**
  (quotaId `FreeTrial_2014-09-01`); **the whole stack is disabled at the ~30-day mark** unless upgraded
  (the 12-month free Postgres allowance survives). Hard, dated deadline — upgrade or lose the environment.

### A1 — Live automated email intake (orchestration + Exchange RBAC)
- **[DONE 2026-06-27]** **Deploy orchestration.** `cespk-orch-dev` is **deployed + wired (41 functions
  registered)** from `orchestration/` (bundle `deploy/orch/main.cjs`; the prior "zero functions" was an
  esbuild ESM→CJS `import.meta.url` crash, fixed via `build-orch.cjs`). It is **not yet live** — see the
  Exchange-RBAC item below.
- **[OPERATOR]** **Exchange-RBAC mailbox scoping (the 3 shared inboxes).** An **Exchange Administrator** grants
  the intake app **resource-scoped** Graph mailbox roles via **Exchange RBAC for Applications**
  (`New-ServicePrincipal` / `New-ManagementScope` / `New-ManagementRoleAssignment`) — **no Global-Admin
  tenant consent, no push subscription**; intake **polls** (delta query). _(Supersedes the old "Graph
  Mail.Read needs Global-Admin/admin consent" assumption wherever it appears.)_
- **[OPERATOR]** Verify the end-to-end live path: a real email → orchestration poll → parser → a `Case` row
  in Postgres with the correct status, dedup, provider match (then scale to all 3 inboxes).

### A2 — API + identity hardening
- **[BUILD]** **Durable API hardening** — durable auth error-handling + token **audience-form** hardening
  (v2 tokens carry `aud` = the API client-id GUID `fa2fb28c…`). In progress.
- **[OPERATOR]** **Staff app-role assignment.** Only **one** staff principal is app-role-assigned
  (`CollisionSpike.User` / `CollisionSpike.Admin`, the 2 roles that map the old 2 Dataverse roles); other
  staff **403 until assigned**. Assign the full roster in Entra.

### A3 — Reproducibility
- **[BUILD]** **IaC config layer** — capture the live Azure config (Function-App + Static-Web-App app-settings,
  RBAC/role assignments, the Exchange-RBAC grant, connection secrets-as-references) as Infrastructure-as-Code
  so `rg-collisionspike-dev` is reproducible and the P0/role/secret state is version-controlled.

### A4 — Domain milestones, re-homed onto Azure _(unchanged business logic; new host)_
- **[OPERATOR]** **EVA M1 JSON drag-drop** into the EVA **test** env — via the SPA/data API + the retained
  `evasentry` Function; confirm acceptance. EVA Sentry **REST** stays gated pending the **Minotaur
  one-principal-code patch + a parity test**.
- **[OPERATOR]** **Enrichment cutover** — promote the retained **enrichment Function** (DVSA/DVLA direct via
  Entra) path on the Azure stack (test/prod).
- **[OPERATOR → Box-side]** **Box activation** — **auth + gates DONE 2026-06-28** (JWT Server Auth, not CCG;
  `box-config-json` in KV, `BOX_CONFIG_JSON` wired, box-fn redeployed, live smoke-test HTTP 200, gates set
  on api+orch). Remaining is **Box-side only**: the hand-built File-Request template (→
  `BOX_FILE_REQUEST_TEMPLATE_ID`) and the BLOCKING `FILE.UPLOADED` webhook subscription/test against the
  retained **`box-webhook`** Function. Record: **[docs/handoff/02-box-activation.md](./docs/handoff/02-box-activation.md)**;
  runbook: **[docs/azure/box-activation.md](./docs/azure/box-activation.md)**.
- **[OPERATOR]** **OCR for scanned PDFs** — bind + calibrate the retained **`ocr`** Function on real scans.
- **[OPERATOR/BUILD]** **Data governance / retention / erasure** — now spanning **Postgres + Blob + Box**:
  the two-clock retention model (data-minimisation vs litigation/evidential hold), the scheduled
  case-disposition purge, the cross-store **DSAR / right-to-erasure** runbook (incl. Box folder names,
  File-Request URLs, Outlook category strings), and the DPIA / controller-processor map. **No automated
  deletion from Box, ever.** Retention period + lawful basis remain operator/legal input.
- **[BUILD]** **PII pre-scrub helper** for the gated AI paths (Phase-8 LLM classifier, Phase-4a vision/geocode).
- **[OPERATOR]** Harden the **live evidence store `cespkevidstdev01`** (the `evidence` container — Blob
  soft-delete + versioning) before any purge job is armed; it is not in IaC, so it can't be hardened from
  templates today (folds into A3).

---

# HISTORICAL — Power-Platform-era SDLC worklist (decommissioned; preserved for domain reference)

> **Read as history.** Everything below is the **code-verified outstanding-item list from the original
> Power Platform build** (the 2026-06-24 16-agent SDLC sweep), kept by phase. It is **retained, not
> deleted**, because it is the most granular record of the **domain + workflow** work — the
> parser / EVA / enrichment / image / Box / corpus items, the dedup ladder (ADR-0010), the
> inspection-address policy (ADR-0013), the Phase-8 triage classifier, the Phase-9 governance schema — **all
> of which carried over to the Azure stack**. The **platform-mechanism** items (Power Automate flows + the
> `validate-flows` linter, Dataverse build scripts + `verify-parity`, the `cr1bd_*` env-var gates, custom
> connectors, `pac code push`) are **superseded by the migration** and are **obsolete on the live stack**.
> The **domain items that still matter are re-homed into §A above** (EVA, enrichment, Box, OCR, governance).
> For live status see [CURRENT_STATUS.md](./CURRENT_STATUS.md); for the migration itself, [migration/](./migration/).

> ✅ **Sweep status (2026-06-24): substantially complete.** 15 build waves + the doc-drift reconciliation (wave 16)
> landed on `feat/sdlc-sweep`. `verify-all.mjs` is **GREEN** — 10 passed, 0 failed, 3 Function suites SKIP for want
> of a local `.venv` (they pass when set up); flow linter 181/181. The parser drift guard that was RED at the
> sweep's start is fixed (engine re-vendored from sibling `aecbc4b`). Every `[DRIFT]` item below is reconciled.
> What remains is the `[OPERATOR]` activations + the two recorded `[DEFERRED]` items (images-backend, corpus Pester).
>
> 🔎 **Post-merge thorough review (2026-06-25):** a 4-agent review of PR #24 (4 commits each) returned **0 blockers**.
> **Fixed:** the save-path wrote `sourceLabel:'suggested:*'` which would have re-classified a *confirmed* pick as an
> unconfirmed suggestion → now `confirmed:*` (+ `provider=` token, + the IBA persist path wired, + the inverted test
> corrected); the classifier's abstain bias for a query/auto-reply email carrying an image from a known provider
> (Rule 0 + Rule 2, sibling `e256760`, +2 corpus fixtures); a stale `chaser_sent=100000019` collision in
> `20-connectors-setup.ps1` + `whatsapp-coexistence.md`; a boundary-gate `axios`/`node-fetch` import needle.
> **Triaged out:** the OpenAPI `audit` `x-nullable` (false positive — `vrm`/`reference` are bare `$ref` too); the
> `28-roles.ps1` `$EnvUrl` default (repo-wide convention across all 14 `.build` scripts).
> **Deferred minors:** bicep `isVersioningEnabled` on the Flex-Consumption host-storage accounts (keep soft-delete;
> versioning belongs on the live evidence store `cespkevidstdev01`, an operator step); a stale pre-scrub
> `.claude/worktrees/` key copy (not on the branch, won't ship — key rotation in gated.md §7 is the real fix).
>
> 🔬 **`/code-review max` pass (2026-06-25, 53 agents):** 15 verified findings (15 refuted), **0 blockers** — caught
> 3 regressions from the sweep itself. **Fixed (14):** `status-evaluate` branch-4 counting *excluded* rows + the
> phantom-200-on-failed-write (both from the M2.B repoint → now `cr1bd_excluded ne true` + a 502 on write failure);
> classifier Rule 0 swallowing a real instruction with a "do not reply" footer (instruction-doc now overrides) +
> `CASEREF_RE` over-match (`AB123456`) tightened (sibling `504c3a3`); the `eva_json` exporter crashing on every
> desktop export (B2 keys added to the bundled schema); `pdf.py` `for…else`/`break` discarding OCR'd pages on
> timeout; `saveInspectionDecision` `cr1bd_name` 200-cap; the boundary-gate stripper truncating `https://`;
> the triage OData single-quote; the disposition audit skipped after destructive work; the `user-role`
> `cr1bd_inspectionaddress` Create/Write (the save-path needs it); + the evavalidation-binding-order &
> evidence-store-before-disposition operator notes (gated.md §8). **Skipped (1):** re-adding the deleted
> `DedupDecisionDialog` (a design decision — it was a mock no-op superseded by `MergeCaseDialog`).

---

## Phase 0 — Foundations
- **[DRIFT]** `verify-all.mjs` is described as "7/7 (7 gates)" in Phase-0/Phase-6 READMEs + ROADMAP +
  milestone-model, but it runs 8 labelled gates and the pytest loop omits 5 Function suites — reword to
  "all gates green" and reconcile CURRENT_STATUS' per-suite counts.
- **[DRIFT]** Phase-0 README claims the parser-key rotation is logged in `docs/gated.md` — no such entry; add it or fix the pointer.
- **[DRIFT]** Stale in-code comments (`dataverse-source.ts`, `types.ts`, `generated-services.ts`, `vite.config.ts`)
  assert a non-existent "no @microsoft/power-apps grep gate" and a false "mock-backed / SDK-free src" posture — correct them.

## Phase 1a — Parser Function
- **[DONE 2026-06-24]** _(★ #1)_ **Re-vendored the parser engine** — re-cut the 8 drifted engine-core modules
  byte-identical from sibling `af98383`, re-applied the vendored-only B2 reconciliation, updated PROVENANCE.
  Drift guard `test_engine_vendored_in_sync.py` now GREEN; parser pytest 73 passed. Sibling untouched.
- **[DONE 2026-06-24]** Vendored the `cedocumentmapper_v2.resources` package (`__init__.py` + `eva-json.schema.json`)
  + new `detection/case_type.py` dep so `import cedocumentmapper_v2.exporters` resolves offline (no ImportError).
- **[DONE 2026-06-24]** Add the missing `audit` field to the parser custom-connector OpenAPI (`parser-connector.json`).
- **[OPERATOR]** Rotate the parser function-key in Azure (the literal is in git history → burned).
- **[OPERATOR]** Live `.doc`/`.msg` parse test on the FC1 host; trim the ManualIntake ACCEPT list if either fails.
- **[DRIFT]** `test_double_encoding.py` comment says "double → 422 (surfaced, not repaired)" but code+test recover to 200 — fix comment.
- **[DRIFT]** Committed parser function-key literal still in `docs/activation/email-intake-activation.md` line 30 — scrub to `<set at activation>`.

## Phase 1b — Provider corpus & inspection-address data
- **[DEFERRED — sweep judgment 2026-06-24]** Pester unit tests for the corpus seed/verify PowerShell pure-functions.
  Deferred: low value (the seed scripts already ran live + the corpus is loaded) and this background job can't
  drive a Pester/pwsh runner reliably (the PowerShell tool returns exit 1 here). Worth adding as a local dev task
  when a Pester runner is available — the pure cores (postcode normalise, Split-AddressLines, Get-RowRanking, domain-ambiguity guard) are the targets.
- **[OPERATOR]** Phase-1b.3 clarifying-info writers (Inputs 1–5): address worklist, intermediary reclassify,
  garage↔provider coverage N:N, code reconciliation, CONSIDER seeding — all await operator-returned worklists.
- **[OPERATOR]** Supply real sender domains for the ~360 providers with blank `knownEmailDomains`; re-run `15-seed -Apply`.
- **[OPERATOR]** Mint canonical short principal codes for the 5 active over-length businesses.
- **[DRIFT]** `clarifying-info-ingestion.md` mandates an AuditEvent on every corpus create/update, but the
  incorporation scripts 10–14 wrote none (provenance-marked instead) — reconcile the doc to as-built.
- **[DRIFT]** InspectionAddress count drift — phase-1 README + Provider card cite 174; CURRENT_STATUS authoritative is 871 (174 confirmed + 697 volatile suggested).

## Phase 1c / 1d — Code App + Flows
- **[DONE 2026-06-24]** Built the shared `<Panel>`/`<Panel accent>` primitive; consolidated the duplicated panel
  blocks (CaseDetail, ManualIntake, Admin, AppErrorBoundary). (Admin `importPanel` + Skeletons borders left as-is — converting would change the rendered fill/DOM.)
- **[DONE 2026-06-24]** Extracted the shared `<EvaFields>` module (`EvaFieldRow` + FIELD_CLUSTERS + LABEL_FOR + option lists); both screens import it (deep-link id + DVSA-mileage provenance preserved).
- **[DONE 2026-06-24]** Added `.ce-overline`/`.ce-stat`/`.ce-stat-lg` theme utilities + `--ce-amber*` vars (used in StatusBadge/Dashboard); routed Dashboard + CaseList through the shared `<EmptyState>`.
- **[DONE 2026-06-24]** Removed dead `FieldsSkeleton` + `logoWhite` (regenerated `logos.generated.ts`); upgraded `ActionLogs` to a loading/error/empty-aware query (`useActivity`); added `public/favicon.svg` + `<link rel=icon>`.
- **[DONE 2026-06-24]** Removed the dead mock dedup-decision dialog (`DedupDecisionDialog.tsx` + `/dedup` route + CaseDetail entry point; superseded by MergeCaseDialog); no `(mock)` copy remains in rendered UI.
- **[OPERATOR]** Reconcile repo `intake.definition.json` UP to live (`Run_enrich` + `Run_case_resolve` + `Run_box_folder_create`) — needs a live flow EXPORT.
- **[OPERATOR]** Live verify of the C5 `React.createElement` console error on the deployed player.
- **[DRIFT]** `power.config.json logoPath='Default'` maker-portal tile (operator `pac push`).

## Phase 2 — Live Activation
- **[DEFERRED — sweep judgment 2026-06-24]** Images-storage **swappable backend abstraction** (B1–B5,
  SharePoint/filesystem alternatives to azureblob). Deliberately NOT built this sweep: it's a *speculative*
  refactor of the working live `classify-persist` flow for a capability not currently needed (azureblob is the
  only backend in use). Build it when a non-blob backend is actually required — at which point it's a clean
  env-var + Switch-per-backend change. (Not a gap/bug; a future-flexibility item.)
- **[OPERATOR]** Bind the Outlook shared-mailbox + Dataverse + parser connection references (digital@ already bound).
- **[OPERATOR]** Turn ON intake/classify-persist/parse for ONE inbox; send a test email; confirm Case/categories/dedup/intermediary-no-automatch.
- **[OPERATOR]** Scale live intake to Info/Engineers/Desk inboxes (M1 exit gate).
- **[DRIFT]** `multi-inbox-access.md`/`-feasibility.md` attribute the V2 SharedMailbox trigger to `intake.definition.json` (actually `OnNewEmailV3`); the V2 flow is `intake-shared-mailbox.definition.json`.
- **[DRIFT]** The V2 multi-inbox flow is claimed "logic IDENTICAL to intake" but lacks the downstream chain — reconcile up or downgrade the claim.

## Phase 3 — Enrichment & EVA
- **[DONE 2026-06-24]** Repointed `status-evaluate` onto `shared_evavalidation/ValidateCase` (M2.B) — deleted the
  5 inline readiness actions, added the `Validate_readiness` connection call (matched the real `{case,evidence}`→
  `{fieldsValid,imagesValid,openIssues}` shape), set `usedBy:[status-evaluate]` + `boundAtActivation` (cleared the
  declared-but-unused WARN). Flow stays state=off. validate-flows 155/155.
- **[DONE 2026-06-24]** Built the **TS-side EVA-readiness parity vitest** (wave 2) — consumes `parity_fixtures.json`, zero drift.
- **[DONE 2026-06-24]** Built the **cross-transport drag-drop ↔ REST byte-identity parity test** (wave 2) — the cutover gate, zero drift.
- **[DONE 2026-06-24]** Wired **body/images photo streaming** into `finalize-eva-box`'s EVA-REST branch (PhotoEntry
  per photo, reusing the bytes the loop already reads). Flow state=off; EVA_API_ENABLED off. Flagged the connector message-size concern for the EVA-test cutover.
- **[OPERATOR]** Enrichment test/prod cutover (Dev is ON + live-verified).
- **[OPERATOR]** Export 12-field JSON, drag-drop into EVA **test**; confirm acceptance.
- **[OPERATOR]** EVA Sentry REST: inject test creds → KV, bind `cr1bd_evasentry`, flip `EVA_API_ENABLED` (after Minotaur one-principal-code patch + parity test); prod cutover.
- **[OPERATOR]** Import the EVA-validation custom connector + bind `cr1bd_evavalidation` (Function deployed; import+repoint remain).
- **[OPERATOR]** Drive EVA readiness to green on a live Case; confirm AuditEvent rows.
- **[DRIFT]** `eva-sentry-rest-submission.md` understates built code (two-request photo flow is BUILT; rename `build_instruction_inspection`→`core_to_instruction`); Phase-3 README 3c/3d + `box-archival-pipeline.md` stale.

## Phase 4 — Inspection Address & Chaser
- **[DONE 2026-06-24]** Fix audit-action value COLLISION — `chaser-send` wrote `100000019` (box_folder_created); added `chaser_sent`=100000023.
- **[DONE 2026-06-24]** Add the missing `cr1bd_CHASER_SEND_ENABLED` gate to the env-var manifest + verify-parity.
- **[OPERATOR]** Run the destructive `16-seed -ReplaceSuggestions -Apply` corpus FULL REPLACE (backup-first); accept ADR-0016 (Proposed→Accepted). _(Already RAN 2026-06-24 per CURRENT_STATUS — confirm/record.)_
- **[OPERATOR]** Chaser-send activation (flip `CHASER_SEND_ENABLED`, turn flow on — crosses the live email boundary).
- **[OPERATOR]** Location-assist activation: deploy the Function + KV, import the CE Location Assist connector, inject Vision+Maps keys, set `LOCATION_ASSIST_API_BASE`, flip the gates, wire `BoxPhotoSource`.
- **[OPERATOR]** Wire chaser garage-targeting to the garage↔provider N:N (blocked on Phase-1b.3 Input 4).
- **[DEFERRED]** **#2b proximity** (closest-to-accident / claimant-home) suggestion-ordering — needs two sibling extractions + gated geocoding (M3); ordering-only, ADR-0013 intact.

## Phase 5 — OCR & Scale
- **[DONE 2026-06-24]** Added the `cr1bd_ocr` connection-ref + the gated empty-extraction **OCR-fallback branch**
  in `parse.definition.json` (when extraction is ~empty AND `cr1bd_OCR_SCANNED_PDF_ENABLED`, call OcrPdf and
  re-prefill via `coalesce(OCR, parser)` — null-safe, off-path unchanged) + promoted `cr1bd_OCR_SCANNED_PDF_ENABLED`/
  `cr1bd_PLATE_OCR_ENABLED` (default false) + `cr1bd_VALUATION_API_BASE` to the env-var manifest + verify-parity locks.
  `OCR_PROVIDER`/`PLATE_PROVIDER` left container-side (engine selection, not feature gates). validate-flows 181/181.
- **[DONE 2026-06-24]** Add the `ImageOrderList` ordering-reducer vitest.
- **[DONE 2026-06-24]** Add the docintel OCR-hook unit test (`_install_docintel_ocr_hook`).
- **[OPERATOR]** Import/bind the OCR connector + flip OCR gates; calibrate on real scans.
- **[DEFERRED]** 5b person/reflection detection + overview-vs-damage classifier (M2; needs Azure OpenAI/Foundry).
- **[DEFERRED]** 5b WhatsApp media bulk-import (ADR-0007, M3).
- **[DEFERRED]** 5c Valuation Function + flow (M3); Copilot Studio offline build pack (M3).
- **[DRIFT]** Phase-5 README line 19 "add two B2 fields to ocr_pdf_adapter EVA map" — already present + parity-guarded; remove. `ImageOrderList.tsx` is built+wired but marked `[ ]` — tick it.

## Phase 6 — Boundary Evidence & Handoff
- **[DONE 2026-06-24]** Added the **static boundary grep-gate** to `verify-all.mjs` (no raw `fetch`/XHR or external
  service host in `mockup-app/src` outside the connector seam; block+line comments stripped so doc mentions don't trip it).
- **[DONE 2026-06-24]** Extended the `verify-all.mjs` pytest loop to ALL built Function suites + ocr (repo-root).
  verify-all now GREEN: 10 passed, 0 failed. (location-suggest/box-webhook/ocr SKIP locally — no `.venv`; they pass when set up.)
- **[OPERATOR/DEV]** Set up local `.venv`s for location-suggest / box-webhook / ocr so their suites run in `verify-all` rather than SKIP.
- **[BUILD]** Delete the untracked `functions/addressmatch/` working-tree remnant (removed-matcher residue; no tracked files).
- **[OPERATOR]** Capture the connection inventory (`pac connection list`), the deploy log, and the §7 three-mailbox live-validation checklist.

## Phase 7 — Box-centric intake pivot
- **[DONE 2026-06-24]** Resolved the `main.tsx` template-id getter TODO — `boxFileRequestTemplateIdFromRows` +
  `getBoxFileRequestTemplateId()` seam getter; `BoxCaseResolver.templateId()` now reads the resolved value (connector injection stays deploy-gated). + tests.
- **[OPERATOR]** Box Platform-app registration + Admin-Console authorization (Business tier) — THE hard unlock for everything Box-live.
- **[OPERATOR]** Inject Box secrets to KV; hand-build the one template File Request + designate the archive root.
- **[OPERATOR]** BLOCKING B2 live-test: File-Request → `FILE.UPLOADED` webhook firing on the live Business tenant; gate-flip choreography + B1 live archive confirm.
- **[OPERATOR]** Grant the box-webhook Function MI a Dataverse Application User; `pac code add-data-source` for the Box connector + bind `cr1bd_box_rest`.
- **[DEFERRED]** Wave-3 (B3) drop-box reg-merge; timed `ListFolder` reconciliation sweep; Phase-C tier-gated items (Metadata-Query, Governance, Box AI).
- **[DRIFT]** "vitest 256 passed" stale (actual 325+); ALM tag inconsistency `[C]` vs `[DEPLOY-WITH-LOGIN]` for the add-data-source wiring.

## Phase 8 — Inbox / Triage Management _(planned; full build authorized 2026-06-24)_
- **[DONE 2026-06-24]** Phase-A **deterministic email classifier** — `rules/email_classifier.py` (pure fn,
  3 categories / 6 subtypes, abstain-to-Other) + `_WORK_/_QUERY_` keyword tuples + `POST /classify-email`
  route (`_strip_html`, /parse-style guard) + `test_email_classifier.py`. Authored in the sibling (committed
  `aecbc4b`) + re-vendored byte-identical; drift guard GREEN; 113 pytest passed; 21/21 corpus precision.
- **[DONE 2026-06-24]** Phase-8 Dataverse schema — `inbound-email.json` table (alt-key `cr1bd_sourcemessageid`,
  2 nullable lookups) + `inbound-email-classification.json` choicesets (members verified 1:1 against the classifier
  constants) + `inbound_classified`=100000024 / `inbound_routed`=100000025 audit actions + 2 relationships +
  `26-inbound-email.ps1` + verify-parity (31 checks). Plus the `triage-classify` flow (state=off) + `ClassifyEmail`
  connector op — classifier call → upsert `cr1bd_inboundemail` → open-Case lookup (Case/PO then VRM, **never
  auto-links on ambiguity** — 3 linter-asserted invariants, Check 8c) → audit → respond. verify-parity PASS, validate-flows 167/167.
- **[DONE 2026-06-24]** Phase-8 **labelled triage corpus** — `test-cases-and-data/triage-corpus/` (`labels.json`
  + 9 synthetic `.eml` across query/enquiry/new-client/body-instruction/OOO/bounce/newsletter/remittance), wired into the classifier test.
- **[OPERATOR]** Intake restructure (flip `fetchOnlyWithAttachment`, generalise dedup, Switch-on-category) — live designer, one inbox first.
- **[OPERATOR]** Operator drops real PII-scrubbed sample emails for precision tuning.
- **[DEFERRED]** Phase-B Code App Inbox/Triage screen + query queue (needs the live table with real rows).
- **[DEFERRED]** Phase-C gated LLM assist (`cr1bd_EMAIL_AI_ENABLED`) — behind the Phase-9 G5 AI sign-off.
- **[DRIFT]** Plan + ROADMAP say "next free audit-action = 100000022" — wrong (taken). Reconcile `intake.definition.json` to live before any triage edit.

## Phase 9 — Data Governance, Retention & Erasure _(planned; offline authoring authorized 2026-06-24)_
- **[DONE 2026-06-24]** Authored the retention-clock schema (`cr1bd_closedat`/`retentionexpiresat`/`legalhold`/
  `legalholdreason`/`heldby` on Case) + `cr1bd_CASE_DISPOSITION_ENABLED` gate + apply script `27-retention-schema.ps1`
  (DRY-RUN default) + verify-parity lock. verify-parity 15/15; 12 EVA fields preserved.
- **[DONE 2026-06-24]** Authored the scheduled **`case-disposition`** flow (state=off, gated `cr1bd_CASE_DISPOSITION_ENABLED`,
  far-future startTime so it never fires on import) + `case_disposed`=100000026 audit action. Two-clock guard (legal-hold
  always wins, double-enforced); **anonymise by field-NULL, never row-delete**; **zero Box ops + zero Dataverse
  DeleteRecord** (asserted by validate-flows Check 8d); hard-delete left as a marked operator-policy placeholder. The
  retention window + anonymise-vs-hard-delete remain operator/legal policy (the flow only consumes `retentionexpiresat`). validate-flows 181/181.
- **[DONE 2026-06-24]** Authored the **3-role least-privilege security model** as schema-as-code — `dataverse/roles/`
  (`_role.schema.json` + `user-role.json` + `admin-role.json`, per-table 8-axis privilege matrix) + `28-roles.ps1`
  (DRY-RUN, **create-not-assign** = gated-off) + promoted `roles-and-permissions.md` (Part B). Least-privilege:
  User no-Delete + corpus read-only + AuditEvent append-only; Admin adds corpus Write (no Delete) + env-var CRUD.
  Env-resolved privilege/BU GUIDs looked up at apply-time (not fabricated). Engineer deferred. Operator assigns at activation.
- **[DONE 2026-06-24]** Added KV **purge-protection** (4 vaults) + Blob **soft-delete + versioning** to the
  6 Function-host bicep templates (defense-in-depth); `az bicep build` clean on all 6. Authoring-only — operator applies.
- **[OPERATOR]** Apply the authoritative G6 hardening (delete-retention + container-delete-retention + versioning)
  to the LIVE evidence-bytes store **`cespkevidstdev01`** (the `evidence` container, reached via the access-key
  connection `cr1bd_evidenceblob`) — it is NOT in the IaC, so it can't be hardened from bicep. Hard pre-step before `box-blob-purge` is armed.
- **[DONE 2026-06-24]** Authored the governance docs — `docs/architecture/data-protection.md` (controller/processor
  map, per-processing lawful-basis table, two-clock retention, rights path) + `docs/plans/runbooks/dsar-erasure-cross-store.md`
  (cross-store DSAR/erasure incl. the Box-folder-name / File-Request-URL / Outlook-category blind spots). Legal sign-offs left [RESERVED-FOR-USER]/[DEFERRED — PENDING LEGAL].
- **[BUILD]** Author a unit-tested PII pre-scrub helper the Phase-8/4a AI paths can reuse (deferred to the Phase-8 build, which consumes it).
- **[OPERATOR]** Promote ADR-0017 Proposed→Accepted (needs retention period + lawful basis + litigation-hold rule + ICO/DPIA sign-off).
- **[DRIFT]** README + ADR-0017 list table-native auditing + cascade as "to-build" — both already in code (narrow to org-level enablement). Add the G1–G8 entries to `docs/gated.md` so the cross-links resolve.

## Cross-cutting
- **[DONE 2026-06-24]** Add the missing `enrichment-client.ts` vitest.
- **[DONE 2026-06-24]** Built the InspectionAddress provenance save-path — `saveInspectionDecision` seam method
  (dataverse upsert; honest no-op until the table is wired), wired into `CaseDetail.useSuggestion`'s explicit-confirm
  path, + 9 tests. ADR-0013-preserved: writes only on an explicit reviewer confirm (never on load/construction), the
  row carries the human-confirmed decisionMode + a non-`suggested*` sourceLabel, no runtime matcher reintroduced.
- **[DRIFT]** The whole Phase-4a location-suggest subsystem (PR #23) + the ADR-0016 offline corpus build are
  absent from CURRENT_STATUS/gated.md — add offline-built/deploy-pending entries.
- **[DRIFT]** `chaser-send` + location-assist activations are absent from `docs/gated.md` — add both.

---

_Reframed 2026-06-26 to the Azure migration-remediation backlog (§A is the live forward worklist; the
per-phase list above is the banded Power-Platform-era SDLC record). The historical sweep's `[DONE]` items
are kept for provenance — they reflect the decommissioned low-code build, not the live Azure stack._

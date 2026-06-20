# Gated items — what needs the operator

_Single registry of everything that is **not** done because it needs the user, or was deliberately
deferred. Last updated **2026-06-19**._

Two classes:

- **Hard blocker** — **must be executed by the operator**; Claude cannot. These cross the
  **live-services boundary** (live Outlook inboxes / SharePoint / Box / EVA), inject **secrets**,
  require **Entra admin consent**, need a **Power Automate designer save** (the Dataverse `clientdata`
  API can't arm an Office 365 webhook — memory `flow-webhook-trigger-provisioning`), depend on
  **operator-supplied data**, or are **live tests**.
- **Soft blocker** — **Claude could do it**, but it's deferred by user request, policy, or sequencing.

> This file is the authoritative "needs-the-operator" list. [../DEPLOY-RUNBOOK.md](../DEPLOY-RUNBOOK.md)
> holds the **sequenced deploy steps**; [../CURRENT_STATUS.md](../CURRENT_STATUS.md) is the source of
> truth for **what is live now**; [../ROADMAP.md](../ROADMAP.md) is the **phased checklist**. Verified
> findings feeding this list: [./review-followups-2026-06-19.md](./review-followups-2026-06-19.md).

---

## 2026-06-20 session — resolved + new operator items

**Resolved this session** (repo, gates green `verify-all.mjs` 7/7): **S2** (`finalize-eva-box` content-bind + the fictional Box `CreateFolder` replaced with real `CreateFile`+`folderPath`), **S4** (OCR↔parser EVA-map equality + test), **S5** (`uploadFileToRecord` regen gate), **S7** (parser-storage `allowSharedKeyAccess:false` — repo **and applied live** to parser `cespikestx7xt3d` + enrichment `cespkenrichstgi62sd`; both functions re-verified Running), **S8** (intake substring linter, now over both intake variants). The `intake-shared-mailbox` variant now also carries the anchored provider match (repo; live deploy still **H3**). Deployed gated-OFF: **Document Intelligence** (`cespkdocintel-dev`) + **evasentry** (`cespkeva-fn-ufa3ci`, Running, no creds). Loaded: **697 suggested InspectionAddress rows** (decisionMode=Unknown, 17-verify all passed).

**New operator actions:**

| ID | Item | What to do | Why operator |
|---|---|---|---|
| **H13** | **Clear the 3 "images only" cases** (`test`, `test1`, `test3`) — they are **stale pre-FIX-3 rows** (zero evidence), **not** a provider-match failure. | Trigger **CS Status Evaluate** with body `{ "caseId": "<guid>" }` once each: `test`=`12a9ee8a-0b6c-f111-ab0e-002248c6a038`, `test1`=`54cdf90a-0c6c-f111-ab0f-0022481b614c`, `test3`=`6f75e9cb-296c-f111-ab0e-002248c6a038` (make.powerautomate.com → Test). Expected: status `100000003`→`100000002` (needs_review); the queue empties. **Do NOT re-save via the Code App** (it would re-stamp the old status). | Live-data mutation; but **safe** — manual-trigger child flow, idempotent, no webhook touched. |
| **H14** | **Document Intelligence key** — DI is deployed but keyless. | Inject the `cespkdocintel-dev` account key into Key Vault secret `docintel-read-key`; set `DOCINTEL_ENDPOINT` on the OCR host; flip `OCR_PROVIDER`/`PLATE_PROVIDER=docintel`. (Tesseract/fast-alpr stay the in-container default; DI is the managed fallback.) | Secret injection + gate flip. |
| **S12** | **EVA-validation (M2.B) repoint** — deploy + publish **DONE**. | The Function is **deployed + Running** (`cespkeval-fn-6c6fxd`, `/api/validate-case`). The initial FC1 plan-create 429 (a per-region ARM *write*-rate throttle re-tripped by back-to-back deploys; **not** the 250-core memory quota, which excludes scale-to-zero apps) cleared after a **20-min cooldown** + one clean attempt. **Only remaining step:** repoint `status-evaluate` onto the `cr1bd_evavalidation` connector (designer) so the flow + Code App share one readiness impl. (Note: FC1 is one-app-per-plan — [Learn](https://learn.microsoft.com/azure/azure-functions/flex-consumption-plan#considerations).) | Designer repoint = live flow edit. |
| **S13** | **Add `cr1bd_inspectionaddress` to the Code App** so the new "Suggested locations" panel + Admin split populate. | `pac code add-data-source` for `cr1bd_inspectionaddress`, rebuild, `pac code push`. Until then the seam returns honest empty suggestions / zero counts. | Deploy-time `pac` step. |
| **S14** | **Continuous suggested-address re-run** — the codexwork sheet changes continuously. | `pwsh dataverse/.build/16-seed-suggested-addresses.ps1 -Apply` on a cadence (idempotent), then `17-verify`. Non-inbox Dataverse data only; no secrets. | `[DEPLOY-WITH-LOGIN]`. |

---

## Hard blockers (operator only)

| ID | Item | Why it's the operator's | What unblocks it | Phase |
|---|---|---|---|---|
| **H1** | **Live email intake** — bind the Outlook shared-mailbox connection + turn intake ON. (digital@ is live-verified; the other **2 inboxes remain**.) | Crosses the live-inbox boundary; the webhook subscription must be saved in the **designer** (clientdata can't arm it). | Operator binds the connection + designer Save; send a test email → a `cr1bd_cases` row appears. | 2 |
| ~~**H2**~~ | **Downstream flow-chain activation** — ✅ **M1 flow chain WIRED LIVE via CLI 2026-06-19.** | **Done:** the 3 Run-a-Child cards (`Run_classify_persist`→`Run_parse`→`Run_status_evaluate`) + `Init_caseId`/`Capture_caseId_*` were added to **CS Intake** via the Dataverse API; the `OnNewEmailV3` **trigger node was kept byte-identical** so the digital@ webhook survived (clientdata can't re-arm it); **classify-persist creating Evidence verified by a live test email**. Repo reconciled to the live flows (payloadhash `@take(...,80)` fix + child `Response` actions) so a solution re-import can't regress them. **Residuals (not blockers):** (a) parser Function **502** — fixed separately (parse already audits a 5xx and lets status advance to needs_review); (b) intake trigger **`concurrency = 1`** — the documented **webhook-risk** edit, **deferred** (changing it re-arms the live webhook in the designer). | Residuals tracked above; original prep steps in [./activation/m1-flow-chain-activation.md](./activation/m1-flow-chain-activation.md). | 1d/2 |
| **H3** | **Deploy the anchored exact-domain provider match** to the **live** intake — *before* seeding sender domains. **CONFIRMED 2026-06-20: live still runs the unanchored `contains()` substring match** (`Resolve_provider`); the repo carries the fix. | Editing the live intake flow is designer work; a substring collision binds the **wrong** provider → wrong Case/PO + Box prefix. | Operator redeploys the intake definition (repo carries `List_active_providers`+`Filter_exact_domain`). ⚠️ The repo intake now also carries FIX 4's `.eml` `Scope_capture_eml` (**H12**) — confirm `ExportEmail_V2` output shape first, or strip the Scope for an H3-only deploy. Pairs with **S8**, **S11**. | 2 |
| **H4** | **Enrichment go-live** — DVSA/DVLA creds → Key Vault, set `DVSA_TENANT_ID`, Entra consent, flip `ENRICHMENT_ENABLED` in a test env. | Secret injection + Entra admin consent. | Inject creds; consent the app; flip the gate in **test**. | 3a |
| **H5** | **EVA submission** — B5 EVA **test** creds → Key Vault; drag-drop the 12-field JSON into EVA test; later flip `EVA_API_ENABLED`; parity-gated prod cutover. | Live EVA + secrets. | Inject EVA test creds; drag-drop JSON; confirm acceptance; cutover behind the parity test. | 3b/3c |
| **H6** | **Box archival** — confirm Box honours the **UPPERCASE** Case/PO folder name + activate. | Live Box. | Confirm folder casing; activate in unison with EVA submit; verify photo order. | 3d |
| **H7** | **Readiness gate to green on a live Case** + confirm AuditEvent rows. | Live data. | Drive the readiness checklist on a real Case; confirm ingest/review/submit audit rows. | 3e |
| **H8** | **Chaser draft-only activation.** | Live outbound (drafts land in a live mailbox). | Confirm a chaser **drafts** (never sends), targeting the right garage. | 4b |
| **H9** | **Clarifying-info ingestion** (Inputs 1–5: code reconciliation, CONSIDER seeding, addresses→yards, garage↔provider, intermediaries). | Needs operator-gathered worklists **and** a Dataverse login. | Operator supplies the worklists; then the upsert runs (`[DEPLOY-WITH-LOGIN]`). See [./plans/phase-1-intake-and-case-tracking/corpus/clarifying-info-ingestion.md](./plans/phase-1-intake-and-case-tracking/corpus/clarifying-info-ingestion.md). | 1b.3 |
| **H10** | **Per-provider sender domains** for auto-match. | Needs operator-supplied domains — ~376/392 providers are blank, so nothing auto-matches. | Provide domain(s); run `dataverse/.build/15-seed-emaildomains.ps1` (idempotent). | 1b.3/2 |
| **H11** | **Phase-6 live evidence** — the §7 validation checklist across **all three** mailboxes, `pac connection list` inventory, deploy log. | Live tests across live inboxes. | Complete [../DEPLOY-RUNBOOK.md](../DEPLOY-RUNBOOK.md) §7/§8. | 6 |
| **H12** | **`.eml` source-email capture go-live** — apply the FIX 4 `Scope_capture_eml` to the **live** `CS Intake`. Repo carries the build (`Init_attachmentsForChild` + `Export_source_email`/`Append_eml_to_attachments` + `Run_classify_persist.attachments`→the variable). | (1) **`ExportEmail_V2` output shape is unconfirmed** — Learn says binary, but the gateway sometimes hands binary actions on as base64; a wrong assumption corrupts every saved `.eml`. (2) Live intake is **webhook-sensitive** (clientdata can't re-arm the V3 webhook). | Operator runs **one inspected** `ExportEmail_V2` and checks raw-binary vs already-base64 (drop `base64()` if already base64); then **designer-adds** the 3 actions to live `CS Intake`; send a test email → a `source.eml` Evidence row (kind email=100000003) appears and the normal attachments still classify. | 1/2 |

---

## Soft blockers (Claude could do it; deferred)

| ID | Item | Why deferred | Phase |
|---|---|---|---|
| **S1** | **Rotate the committed parser function key** + replace both occurrences with a placeholder + add a secret-scan pre-commit gate. | Standing user instruction: *"these keys are non-sensitive, don't fuss."* Surfaced for an explicit decision (rotation, not just doc-scrub, is the real fix — it's in git history). | 0/1a |
| **S2** | **Fix `finalize-eva-box` Box upload** — it passes a blob **path string**, not file **content**. Bind `cr1bd_evidenceblob`, insert an Azure Blob `GetFileContent`, run the drag-drop==API parity test. | Latent (flow is off); fix before activating finalize. | 3d |
| **S3** | **Document the ADR-0010 dedup-ladder deferral** as a known M1 limit + turn **`CS Case Resolve` OFF** in live (ON-but-orphaned). | The doc is AI-doable; the live OFF toggle is a small operator action. | 3 |
| **S4** | **OCR EVA-map B2 sync** — add `claimant_telephone`/`claimant_email` to `ocr/ocr_pdf_adapter.py` + a parser/OCR map-equality test. | Latent until OCR is wired. | 5a |
| **S5** | **Generated-service hand-edit guard** — DEPLOY-RUNBOOK re-apply note + an `uploadFileToRecord` grep gate; regenerate cleanly at SDK ≥1.0.4. | Maintenance hazard, dead at runtime today. | 1c |
| ~~**S6**~~ | **OCR ACA host deploy** — ✅ **DONE 2026-06-19** (PR #7). | Resolved: a pre-granted user-assigned identity for AcrPull (separate ARM deploy) fixed the revision-provision race. `cespkocr-fn-dev-glju3v` (Functions-on-ACA, scale-to-zero) is Running. Connector wiring + gate flip remain. | 5a |
| **S7** | **Redeploy the enrichment Function** from current bicep (clears the managed-LAW RG sprawl) + add `allowSharedKeyAccess:false` to **parser** storage. | Defense-in-depth IaC drift; AI-doable redeploy. | 3a |
| **S8** | **Add an intake-specific substring check** to `flows/validate-flows.mjs` (check 8a only covers `provider-match`). | Repo-side lint; pairs with **H3**. | 2 |
| **S9** | _(optional)_ **Consolidate the 4 per-Function Log Analytics workspaces** into one shared workspace. | Marginal saving in a dev sandbox; reasonable to defer. | infra |
| **S10** | **37 over-length principal codes** — supply canonical ≤8-char codes. | Needs the operator's canonical codes; **non-blocking** — the `cr1bd_principalcode` column was already widened 8→12 this session, so loading works now. | 1b.2 |
| **S11** | **Intake drift MAPPED (2026-06-20) — repo is ahead, not behind.** Diffed live `CS Intake` vs repo `intake.definition.json`: the repo is the **authoritative** design; **live is BEHIND**. Live still runs the OLD **unanchored `contains()` substring** provider match (`Resolve_provider`) — the false-match bug the repo's `List_active_providers`+`Filter_exact_domain` fixes (**this IS H3**); live also carries a **vestigial empty `attachmentHashes`** var the repo omits; child-flow Response is `Respond_to_flow` (live) vs `Respond_to_parent` (repo — cosmetic). Repo leads on FIX 4 `.eml` (**H12**). | **No repo change** — adopting live would REVERT the H3 anchored fix. The reconcile IS the **H3 live deploy** (operator, designer). ⚠️ The repo intake now also carries FIX 4's `Scope_capture_eml`, so an H3 deploy brings `.eml` too → confirm `ExportEmail_V2` output shape (**H12**) first, or strip the Scope for an H3-only deploy. | 1/2 |

---

## Recently resolved / obviated (context — no action)

- **B1** gateway grant — **obviated**: enrichment calls DVSA/DVLA **directly** via Entra (no Google Cloud gateway).
- **B3** 13th EVA field — **resolved**: the contract is **12 fields** (`engineer_allocation` removed).
- **B4** Code Apps enablement — **resolved**: enabled on the env; app pushed.
- **B2** parser telephone/email — **resolved**: parser redeployed 2026-06-19; `/api/parse` extracts both.
- **OCR ACA host** — **deployed 2026-06-19** (S6 done, PR #7): `cespkocr-fn-dev-glju3v` Running via the pre-granted-UAMI AcrPull fix.
- **`cr1bd_principalcode`** widened 8→12 (the residual canonical-codes decision is **S10**).
- **H2** downstream flow-chain — **M1 chain WIRED LIVE via CLI 2026-06-19** (orchestrator cards on `CS Intake`, webhook preserved by a byte-identical trigger node, classify-persist Evidence verified by a live test email; repo reconciled with the payloadhash `@take(...,80)` fix + child `Response` actions). Residuals: parser **502** (separate fix) + trigger `concurrency=1` (deferred webhook-risk edit).

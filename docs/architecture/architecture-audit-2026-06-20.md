# Architecture audit — collisionspike live stack (2026-06-20)

> **Dated findings record.** A read-only audit of the live `collisionspike` architecture against its
> IaC + canonical docs, verified live on **2026-06-20**. This is a **findings + remediation register**,
> not a change log — **no remediation was performed here**. Each issue is tagged
> **CLAUDE-fixable** (offline, no live mutation) or **owner=operator 🔒** (crosses the
> live-services / secret boundary).
>
> Pairs with [live-environment.md](./live-environment.md) (the canonical live registry — this audit
> finds it **stale**, see [F1](#f1--doc-drift-live-environmentmd-shows-the-m1-chain-off-but-it-is-on--highest-impact)),
> [CURRENT_STATUS.md](../../CURRENT_STATUS.md) (what is live now),
> [../gated.md](../gated.md) (operator registry — these findings map onto **S1 / S7 / S8 / S9 / S11 / H3**)
> and [AGENTS.md](../../AGENTS.md) (rules/gotchas). Re-verify IDs with the toolkit at the bottom of
> live-environment.md before acting.

**Precedence note (per [CLAUDE.md](../../CLAUDE.md)).** A **binding review** (`docs/reviews/<DDMMYY>/`)
> ADRs > architecture/requirements specs > plans. This audit is an **architecture-level findings
doc**: it ranks **below** any binding review and the ADRs, and it **reconciles upward** — where it
contradicts the canonical [live-environment.md](./live-environment.md), the **verified-live state in
this audit is the correction to apply to that doc** (a verification-only doc edit), but the doc edit
itself is tracked here as a buildable step, not yet made.

**Milestone tags (LOCKED — see [ROADMAP.md](../../ROADMAP.md)).** Phases (0–6) are the work-breakdown
axis; **M0/M1/M2/M3** are capability slices that cut across phases. This audit covers the **M1**
permanent-fallback vertical slice (parser + DVSA enrichment + EVA JSON drag-drop + readiness gate +
address-policy gate + plate-OCR) and the **M2** resources that are deliberately **deploy-pending**
(EVA Sentry REST + EVA-validation Function + Box archival). Never equate a Phase with a Milestone.

---

## Scope & method

- **Environment:** `Collision Engineers - Dev` Sandbox (`b3090c42-51fb-ee24-9868-474da322a3ad`),
  subscription `e6076573-23a5-46a8-acef-7e22d264e5db`, resource group **`rg-collisionspike-dev`**
  (UK South). Org `https://collisionengineers-dev.crm11.dynamics.com`.
- **Read-only.** Azure resource enumeration, Dataverse `workflows`/`connectionreferences` queries, and
  the six Function Bicep templates were read; **nothing was mutated**. Even the CLAUDE-fixable edits
  below are **staged here, not applied** (this was a planning pass).
- **Contracts re-verified against Microsoft Learn** (citations inline): Flex-Consumption identity
  storage + `allowSharedKeyAccess:false` guidance; the `null`/`true` = Shared-Key-permitted semantics;
  custom connectors do **not** support `client_credentials` (validates the in-Function EVA token mint);
  Office 365 webhook triggers register **only on a designer save** (validates operator-gating of intake
  edits — see memory `flow-webhook-trigger-provisioning`).
- **Verdict:** the live architecture is **substantially sound and matches its IaC**. Eight real issues
  were found (below); the **highest-impact** is documentation drift, not a security or infra defect.

---

## Verified live state (2026-06-20)

### Azure Functions + IaC (RG `rg-collisionspike-dev`)

| Function / role | Live resource(s) | IaC | State |
|---|---|---|---|
| **Parser** (PDF mapper, FC1 Linux Python) | `cespike-parser-dev-x7xt3d5ovhi7y` + storage `cespikestx7xt3d` + `cespike-parser-law-dev` / `cespike-parser-ai-dev` + FC1 plan | [`functions/parser/infra/main.bicep`](../../functions/parser/infra/main.bicep) | **Live** — FC1, identity `AzureWebJobsStorage__accountName` + system-MI Storage Blob Data Owner, `httpsOnly`, TLS 1.2, `ftpsState Disabled`, workspace-bound App Insights. ⚠️ storage **omits** `allowSharedKeyAccess:false` — see [F4](#f4--s7-iac-parser-storage-bicep-omits-allowsharedkeyaccessfalse). |
| **Enrichment** (DVSA/DVLA direct, activated 2026-06-20) | `cespkenrich-fn-gi62sd` + KV `cespkenrichkvgi62sd` + `cespkenrich-ai-gi62sd` — **no `cespkenrich-law` in the RG** | [`functions/enrichment/infra/main.bicep`](../../functions/enrichment/infra/main.bicep) | **Live, gate ON** (`ENRICHMENT_ENABLED` current=`true`; default `false`) — calls DVSA + DVLA directly via Entra `client_credentials` + `X-API-Key` (no Google Cloud gateway). App Insights workspace binding **drifted** — see [F5](#f5--iac-drift-live-enrichment-app-insights-has-no-companion-workspace-in-the-rg). |
| **Address-match** (FC1 Linux) | `cespkaddr-fn-i7m4re` + its own LAW | [`functions/addressmatch/infra/main.bicep`](../../functions/addressmatch/infra/main.bicep) | **Live** — `POST /api/match-address`, part-postcode `Loc` → corpus yard via district, postcode.io (`AZURE_MAPS_ENABLED=false`). No secrets / no Key Vault. Sets `allowSharedKeyAccess:false`. |
| **OCR host** (Functions-on-ACA, scale-to-zero) | `cespkocr-fn-dev-glju3v` on ACA env `cespkocr-env-dev`, ACR `cespkocracraeee76`, pre-granted UAMI `cespkocr-acrpull-id`, `ocr-law` | [`ocr/infra/main.bicep`](../../ocr/infra/main.bicep) + [`ocr/infra/acrpull-role.bicep`](../../ocr/infra/acrpull-role.bicep) | **Live + Running** — `/api/ocr-pdf` + `/api/plate-ocr`, `minReplicas=0`, HTTPS-only. AcrPull race fixed by the pre-granted UAMI + `siteConfig.acrUserManagedIdentityID`. Connector wiring + `OCR_SCANNED_PDF_ENABLED`/`PLATE_OCR_ENABLED` flip remain. |
| **Evidence storage** | `cespkevidstdev01` | — | Present (later-phase Blob evidence). |
| **EVA Sentry REST** (M2) | _none_ (`cespkeva-*` absent) | [`functions/evasentry/infra/main.bicep`](../../functions/evasentry/infra/main.bicep) | **Deploy-pending — CORRECT by design** (Phase 3c / M2). See [F11](#f11--deploy-pending-confirmation-evasentry--evavalidation-correctly-absent--record-only). |
| **EVA-validation** (M2) | _none_ (`cespkeval-*` absent) | [`functions/evavalidation/infra/main.bicep`](../../functions/evavalidation/infra/main.bicep) | **Deploy-pending — CORRECT by design** (status-evaluate computes readiness inline → connector unused; `usedBy:[]`). See [F11](#f11--deploy-pending-confirmation-evasentry--evavalidation-correctly-absent--record-only). |

All five Function Bicep templates + the two OCR templates read clean on the core posture: **FC1/ACA,
identity-based `AzureWebJobsStorage__accountName` + system-MI Storage Blob Data Owner, Key Vault
references only (no secret literals), `httpsOnly`, `minTlsVersion 1.2`, `ftpsState Disabled`.**

### Key Vault + identities

- **Enrichment** has its own vault `cespkenrichkvgi62sd`; the Function's **system-assigned MI** resolves
  `@Microsoft.KeyVault(...)` references (DVSA/DVLA creds + `DVSA_TENANT_ID` are **operator-injected** —
  [../gated.md](../gated.md) H4, never in any artifact).
- **Parser** holds **no secrets today**; its Bicep wires a *future* outbound key only as a Key Vault
  reference (`PARSER_OUTBOUND_API_KEY`), resolved via the parser MI. The live function key lives **only
  on the parser connection** `cr1bd_ceparser` (`01b43be8…`) — but it **was once committed** to git, see
  [F6](#f6--s1-security-a-committed-parser-function-key-is-in-git-history--operator-).
- Each Function's MI holds **Storage Blob Data Owner** scoped to its own storage account (deployment
  package + identity-based host storage on Flex Consumption).

### Dataverse solution

- Solution **`CollisionSpike`** (`fb532f91-…`, unmanaged, prefix **`cr1bd`**) — **11 tables**
  (per [data-model.md](./data-model.md)): `cr1bd_case`, `cr1bd_evidence`, `cr1bd_workprovider`,
  `cr1bd_repairer`, `cr1bd_imagesource`, `cr1bd_inspectionaddress`, `cr1bd_auditevent`,
  `cr1bd_fieldlevelprovenance`, `cr1bd_note`, `cr1bd_chaser`, + the corpus/intermediary table per
  ADR-0011. Solution **`CollisionSpikeFlows`** (`41c87a85-…`) carries the flows.
- **Choice sets / status machine:** `new_email → ingested → needs_review → ready_for_eva →
  eva_submitted`; the audit action-value set includes `duplicate_dropped` (`100000005`, reused for
  `dropped_before_min_date`) and the `.eml` evidence kind `email=100000003`.
- **Env-var feature gates** ([`dataverse/environment-variables.json`](../../dataverse/environment-variables.json),
  11 declared): `cr1bd_PDF_MAPPER_ENABLED=true`, `cr1bd_ENRICHMENT_ENABLED` (**default `false`**; the Dev
  sandbox **current value = `true`** — enrichment is activated live in Dev via the per-env current value,
  not the shipped default), `cr1bd_ENRICHMENT_API_BASE`, `cr1bd_EVA_API_ENABLED=false`,
  `cr1bd_EVA_BASE_URL`, `cr1bd_EVA_CLIENT_ID`/`cr1bd_EVA_CLIENT_SECRET` (Secret → KV refs),
  `cr1bd_AZURE_MAPS_ENABLED=false`, `cr1bd_VALUATION_ENABLED=false`, `cr1bd_COPILOT_ENABLED=false`,
  `cr1bd_AZURE_VISION_ENABLED=false`. Gaps found — see [F9](#f9--env-var--gate-coherence-manifest-vs-flows--bicep).
- **Data loaded:** WorkProvider 392 (176 active / 216 archived), Repairer 61, ImageSource 23,
  InspectionAddress 174, 98 N:N links; `cr1bd_cases` holds real email-sourced test rows (no mock data).

### Cloud flows — 10 live; the M1 chain is **ON**

Dataverse `workflows` query (`category eq 5`) on 2026-06-20:

| Flow | `statecode` | Live state |
|---|---|---|
| CS Intake (shared mailbox) | 1 | **ON** |
| CS Provider Match | 1 | **ON** |
| CS Case Resolve (ADR-0010 dedup) | 1 | **ON** |
| **CS Classify + Persist** | **1** | **ON** ← live-environment.md shows OFF ([F1](#f1--doc-drift-live-environmentmd-shows-the-m1-chain-off-but-it-is-on--highest-impact)) |
| **CS Parse (PDF mapper)** | **1** | **ON** ← live-environment.md shows OFF ([F1](#f1--doc-drift-live-environmentmd-shows-the-m1-chain-off-but-it-is-on--highest-impact)) |
| **CS Status Evaluate** | **1** | **ON** ← live-environment.md shows OFF ([F1](#f1--doc-drift-live-environmentmd-shows-the-m1-chain-off-but-it-is-on--highest-impact)) |
| CS Enrich (DVSA MOT) | 1 | **ON** — activated 2026-06-20 (`ENRICHMENT_ENABLED` current=`true`; default `false`) |
| CS Finalize EVA + Box | 0 | OFF (gated) |
| CS Chaser Draft | 0 | OFF |
| CS Job Sheet Import | 0 | OFF |

The **M1 flow chain is wired LIVE** end-to-end (intake → classify-persist → parse → status-evaluate,
with provider-match + case-resolve inside the chain), confirmed by [CURRENT_STATUS.md](../../CURRENT_STATUS.md)
(the 2026-06-19 "late" + "pipeline fixes" updates). The repo
[`flows/flow-state.json`](../../flows/flow-state.json) declares **12** definitions
(`totalFlows: 12`); the two extras — `intake-shared-mailbox.definition.json` (multi-inbox variant) and
`chaser-send.definition.json` (Phase-2, gated on `cr1bd_CHASER_SEND_ENABLED`) — are **build-only, not
imported live** (the 10/12 gap is **planned backlog, not drift** — see [F2](#f2--doc-drift-the-1012-flow-count-needs-a-note-build-only-vs-imported)).

### Custom connectors

- **Parser** connector `new_collision-20engineers-20parser` → connection `cr1bd_ceparser`
  (`01b43be8…`, **Bound/Connected**). The `document` param **must stay plain `{type:string}`** — never
  `format:byte`/`x-ms-media-kind`; the flow passes the **RAW base64 string** (never `base64ToBinary` —
  HTTP 400, proven live `test34`), and the tolerant parser decode is the load-bearing safeguard
  (memories `codeapp-apikey-connector-connection`, `powerplatform-connector-base64-double-encode`).
- **Deploy-pending connectors** (unbound by design): `cr1bd_evasentry`, `cr1bd_evavalidation`,
  `cr1bd_dvsaenrich`, `cr1bd_evidenceblob`, `cr1bd_box`, `cr1bd_jobsheet_excel`. The **EVA token mint
  runs inside the Function**, not the connector — correct, because **custom connectors do not support
  the `client_credentials` grant** ([Learn](https://learn.microsoft.com/connectors/custom-connectors/connection-parameters)).

### Code App

- App `da7ba7af-9ffc-4c70-8f75-1f053ca354da` ("Collision Engineers - Intake"), source
  [`mockup-app/`](../../mockup-app/) (React + Vite), Dataverse-wired, real rows only (no mock).
  Manual-intake parse routes through the **CE Parser connector** (Code App CSP `connect-src 'none'`
  forbids raw `fetch` — memory `codeapp-csp-use-connectors`); the old raw-fetch transport
  (`mockup-app/src/data/parser-config.ts`) was **deleted 2026-06-19**, so the key is no longer in the
  client bundle. Git **is** a repo (the env header that says otherwise is wrong), branch
  `fix/parser-base64-tolerant-decode`, clean tree.

---

## Prioritised findings

Ordered by impact. **CLAUDE-fixable** = offline, no live mutation (staged here, not yet applied).
**owner=operator 🔒** = crosses the live-services / secret boundary.

### F1 — DOC DRIFT: live-environment.md shows the M1 chain OFF, but it is ON  (highest impact)
- **Owner:** CLAUDE-fixable (verification-only doc edit; no live change).
- **Maps to:** the canonical-registry contradiction; not yet in [../gated.md](../gated.md).
- **Finding.** [live-environment.md](./live-environment.md) flow-inventory rows (lines ~63–65) and its
  "Current vs intended" line (~line 83) mark **CS Classify + Persist / CS Parse / CS Status Evaluate**
  as **OFF**. Dataverse confirms all three are **`statecode 1` (ON)**;
  [CURRENT_STATUS.md](../../CURRENT_STATUS.md) already describes the activation. Because the canonical
  registry is the doc the operator deploy-runbook trusts, a stale "M1 chain OFF" misleads future
  planning. Per the precedence rule the canonical doc must **win or be corrected** — here it is wrong.
- **Remediation (staged).** Flip those three rows to **ON** and rewrite the "Live today" line to:
  *intake / provider-match / case-resolve / classify-persist / parse / status-evaluate all **ON**;
  enrich / finalize / chaser / job-sheet **OFF***. Pure doc edit. (Cross-doc reconciliation is handled
  separately per the task rules — this audit only records the finding.)
- **Cite:** [learn.microsoft.com/power-automate/work-with-triggers-actions](https://learn.microsoft.com/power-automate/work-with-triggers-actions)

### F2 — DOC DRIFT: the 10/12 flow count needs a note (build-only vs imported)
- **Owner:** CLAUDE-fixable (doc note).
- **Maps to:** clarifies, doesn't change, the inventory.
- **Finding.** live-environment.md + this audit say **10 flows**; [`flows/flow-state.json`](../../flows/flow-state.json)
  `summary.totalFlows` is **12**. Verified: neither extra exists live —
  `intake-shared-mailbox.definition.json` (multi-inbox, Phase 2 / H1) and `chaser-send.definition.json`
  (Phase 2, gated `cr1bd_CHASER_SEND_ENABLED`) are **build-only**. The gap reads as "missing wiring"
  without a note.
- **Remediation (staged).** Add a one-line note to live-environment.md: *"repo carries 12 flow
  definitions; 10 are imported live; intake-shared-mailbox + chaser-send are build-only (Phase 2),
  not yet imported."*

### F4 — S7 SECURITY (IaC): parser-storage Bicep omits `allowSharedKeyAccess:false`
- **Owner:** CLAUDE-fixable (Bicep edit; **applying to live = [F4-apply](#f4-apply--s7-security-live-deny-shared-key-on-the-parser-storage--operator-)**).
- **Maps to:** [../gated.md](../gated.md) **S7**.
- **Finding.** The parser storage resource in
  [`functions/parser/infra/main.bicep`](../../functions/parser/infra/main.bicep) (~lines 83–96) is the
  **only one of the six Function storage accounts** missing `allowSharedKeyAccess: false` — enrichment,
  addressmatch, evasentry, evavalidation, and ocr all set it. Microsoft Learn explicitly recommends
  this for Flex Consumption with identity-based `AzureWebJobsStorage__accountName` (the parser uses
  exactly that). Defense-in-depth: the host already uses MI, so this hardens against an out-of-band
  key path, it does not fix a live exploit.
- **Remediation (staged).** Add `allowSharedKeyAccess: false` to the storage `properties` block;
  `az bicep build` to confirm it compiles. (Edit is staged, not applied — read-only pass.)
- **Cite:** [learn.microsoft.com/azure/azure-functions/functions-infrastructure-as-code#create-storage-account](https://learn.microsoft.com/azure/azure-functions/functions-infrastructure-as-code#create-storage-account)
  — *"For better security, add `allowSharedKeyAccess: false` to your storage account properties and use
  managed identity-based connections instead of connection strings."*

### F4-apply — S7 SECURITY (live): deny Shared Key on the parser storage  🔒
- **Owner:** operator 🔒 (mutates a live resource).
- **Finding.** Live `cespikestx7xt3d` returns **no `allowSharedKeyAccess` value** = Shared Key still
  **permitted** (Learn: "permits requests authorized with Shared Key when the property value is **null**
  or when it is **true**").
- **Remediation (operator).** After confirming nothing uses an account key (the host uses MI, so risk
  is low), either redeploy the corrected parser Bicep **or**
  `az storage account update -n cespikestx7xt3d -g rg-collisionspike-dev --allow-shared-key-access false`.
  Verify: `az storage account show … --query allowSharedKeyAccess` returns **false**.
- **Risk.** Any out-of-band tool / SAS still authenticating with the account key would **403** — verify
  usage before flipping.
- **Cite:** [learn.microsoft.com/azure/storage/common/shared-key-authorization-prevent#remediate-authorization-via-shared-key](https://learn.microsoft.com/azure/storage/common/shared-key-authorization-prevent#remediate-authorization-via-shared-key)

### F5 — IAC DRIFT: live enrichment App Insights has no companion workspace in the RG
- **Owner:** CLAUDE confirms the Bicep; **operator 🔒** redeploys to bind it live.
- **Maps to:** [../gated.md](../gated.md) **S7** (the "managed-LAW sprawl" half).
- **Finding.** Live `cespkenrich-ai-gi62sd` has **no `cespkenrich-law`** in `rg-collisionspike-dev`, yet
  [`functions/enrichment/infra/main.bicep`](../../functions/enrichment/infra/main.bicep) now declares a
  **workspace-bound** component (`WorkspaceResourceId`). So the live AI is either classic/workspace-less
  (a retired ingestion path) **or** bound to a managed LAW in a hidden auto-created RG. CLAUDE confirms
  the Bicep already declares the LAW + `WorkspaceResourceId` (it does).
- **Remediation.** **Operator** redeploys enrichment from current Bicep so its AI binds the in-RG
  workspace; verify the component's `WorkspaceResourceId` post-deploy. Pin `namePrefix`/`environmentName`
  to the existing `gi62sd` suffix so it **updates in place** (a param drift would regenerate the
  uniqueString names → a parallel app). Pairs with [F4-apply](#f4-apply--s7-security-live-deny-shared-key-on-the-parser-storage--operator-).
- **Open question.** Is the live `cespkenrich-ai-gi62sd` workspace-less/classic, or bound to a managed
  LAW in a hidden RG? Resolving needs the component's `WorkspaceResourceId`
  (`az monitor app-insights component show` — the Azure AI MCP only exposes `recommendation_list` here).
  This determines whether enrichment needs the redeploy or merely a doc note.
- **Cite:** [learn.microsoft.com/azure/azure-monitor/app/create-workspace-resource](https://learn.microsoft.com/azure/azure-monitor/app/create-workspace-resource)

### F6 — S1 SECURITY: a committed parser function key is in git history  🔒
- **Owner:** operator 🔒 (touches a live secret + the live connection — rotation, not a doc-scrub).
- **Maps to:** [../gated.md](../gated.md) **S1**.
- **Finding.** A **literal** parser function key value once lived in the now-deleted
  `mockup-app/src/data/parser-config.ts` (`functionKey:'A31IJ9kySfjhR-…AzFuzYZHaA=='`), removed in
  commits `2b59420` / `050456f`. The current tree is **clean** (the key lives only on connection
  `cr1bd_ceparser`), but a doc-scrub leaves it in **git history** — the only true fix is **rotation**.
- **Remediation (operator).** Regenerate the parser host/function key (portal or
  `az functionapp keys` — see cite), then update connection `cr1bd_ceparser` with the new key in the
  **same** change (rotating without updating the connection breaks manual-intake parse + the live
  CS Parse flow). The standing note says *"these keys are non-sensitive, don't fuss"* —
  **surface for an explicit rotate-or-accept decision; do not silently ignore.**
- **Open question.** Rotate (the only true fix, since it is in history) or **formally accept + document**
  the exposure? Needs an explicit operator call.
- **Cite:** [learn.microsoft.com/azure/azure-functions/function-keys-how-to](https://learn.microsoft.com/azure/azure-functions/function-keys-how-to)

### F7 — S1 SECURITY (repo gate): no secret-scan guards against re-committing a key
- **Owner:** CLAUDE-fixable (repo gate; planned here — read-only pass).
- **Maps to:** [../gated.md](../gated.md) **S1** (the gate half).
- **Finding.** Nothing prevents a key from being re-committed. The repo already has
  `flows/validate-flows.mjs` + a `verify-all.mjs` harness.
- **Remediation (planned, CLAUDE-doable).** Add a lightweight secret-scan (a `gitleaks` config or a node
  regex check) over `mockup-app/` + `functions/` (excluding `.venv` / `node_modules`), wired into
  `verify-all.mjs`, so the F6 class of leak cannot recur. Flagged as the buildable follow-up to F6.

### F8 — H3 WIRING: live CS Intake still runs the unanchored `contains()` provider match  🔒
- **Owner:** operator 🔒 (intake-flow designer redeploy — webhook-sensitive).
- **Maps to:** [../gated.md](../gated.md) **H3** + **S11** (repo is *ahead*, not behind).
- **Finding.** Live `CS Intake` still runs the **unanchored `contains()` substring** provider match
  (`Resolve_provider`); the repo carries the anchored fix (`List_active_providers` +
  `Filter_exact_domain`). A substring collision binds the **wrong** provider → wrong Case/PO + wrong Box
  folder prefix. Per **S11**, the repo `intake.definition.json` is the **authoritative** design and live
  is **behind**; adopting live would *revert* the fix — so the reconcile **is** the H3 live deploy.
- **Remediation.** CLAUDE can **pre-stage/verify** the anchored definition diff so the operator's apply
  is a known-good one; **activation is the operator's** designer save. ⚠️ The repo intake also carries
  FIX 4's `Scope_capture_eml` ([../gated.md](../gated.md) **H12**) — confirm the real `ExportEmail_V2`
  output shape **first**, or strip the Scope for an **H3-only** deploy.
- **Risk.** Editing live CS Intake **re-arms the digital@ Office 365 webhook** (triggers register only on
  a designer save; clientdata can't arm them). A careless edit silently broke live intake before
  (`CannotDisableTriggerConcurrency`, zero runs) — must be a **designer Save with `concurrency=1`,
  operator-only** (memory `flow-webhook-trigger-provisioning`).
- **Cite:** [learn.microsoft.com/troubleshoot/power-platform/power-automate/flow-run-issues/triggers-troubleshoot](https://learn.microsoft.com/troubleshoot/power-platform/power-automate/flow-run-issues/triggers-troubleshoot)

### F9 — ENV-VAR / GATE COHERENCE: manifest vs flows + Bicep
- **Owner:** CLAUDE-fixable (manifest edit + notes; no live mutation).
- **Maps to:** coherence of the gate manifest; not currently a gated.md ID.
- **Findings.**
  1. [`flows/flow-state.json`](../../flows/flow-state.json) gates `chaser-send.definition.json` on
     **`cr1bd_CHASER_SEND_ENABLED`**, which is **not** in
     [`dataverse/environment-variables.json`](../../dataverse/environment-variables.json).
  2. The parser Bicep app setting **`EVA_PAYLOAD_SCHEMA_PATH`** and the enrichment **`DVSA_TENANT_ID`**
     are real per-environment knobs **not** represented as Dataverse env-vars (they are per-env app
     settings, by design — record it).
  3. The manifest defaults `cr1bd_PDF_MAPPER_ENABLED=true`, while `cr1bd_ENRICHMENT_ENABLED` ships
     **default `false`**; per [CURRENT_STATUS.md](../../CURRENT_STATUS.md) enrichment is **activated ON**
     in the Dev sandbox — the per-environment `currentValue=true` **overrides** the shipped `false` default
     for Dev.
- **Remediation (staged).** Add the missing `cr1bd_CHASER_SEND_ENABLED` entry; add a note that
  `EVA_PAYLOAD_SCHEMA_PATH` / `DVSA_TENANT_ID` are per-env app settings (not env-vars); document the Dev
  `ENRICHMENT_ENABLED` per-env ON override (default `false`). No live mutation.
- **Cite:** [learn.microsoft.com/power-apps/maker/data-platform/environmentvariables](https://learn.microsoft.com/power-apps/maker/data-platform/environmentvariables)

### F10 — S9 IaC SPRAWL (optional): per-Function Log Analytics workspaces
- **Owner:** CLAUDE-fixable but **deferred/optional**.
- **Maps to:** [../gated.md](../gated.md) **S9**.
- **Finding.** The RG holds **≥3 separate** Log Analytics workspaces (`cespike-parser-law-dev`,
  `cespkaddr-law-i7m4re`, `ocr-law` and more), each declared by its own Bicep; OCR additionally force-
  reads `listKeys().primarySharedKey` for ACA log shipping.
- **Remediation (optional).** Refactor the six templates to accept a shared `logAnalyticsWorkspaceId`
  param (one shared workspace, passed by id). **Do NOT** change OCR's ACA log wiring **shape** — it
  needs `customerId` + `sharedKey`. Marginal cost in a dev sandbox → keep optional / defer to a
  Test/Prod ALM cut.
- **Open question.** Worth the refactor churn now in a throwaway sandbox, or accept the sprawl until an
  ALM cut? S9 itself flags it "optional".
- **Cite:** [learn.microsoft.com/azure/azure-monitor/logs/workspace-design](https://learn.microsoft.com/azure/azure-monitor/logs/workspace-design)

### F11 — DEPLOY-PENDING confirmation: evasentry + evavalidation correctly absent  (record only)
- **Owner:** no action — record only.
- **Finding.** Neither `cespkeva-*` (evasentry) nor `cespkeval-*` (evavalidation) exists in the RG —
  **correct by design.** EVA Sentry REST is **Phase 3c / M2** (M1 uses the JSON drag-drop export, the
  permanent fallback); status-evaluate computes readiness **inline**, so evavalidation is unused
  (`usedBy:[]` in `connection-references.json`). The in-Function EVA token mint is the right pattern
  (custom connectors don't support `client_credentials`). **No drift** — ensure
  [../gated.md](../gated.md) continues to mark these **deploy-pending, not missing.**
- **Cite:** [learn.microsoft.com/connectors/custom-connectors/connection-parameters](https://learn.microsoft.com/connectors/custom-connectors/connection-parameters)

---

## Remediation summary

| ID | Finding | Owner | Boundary | gated.md |
|---|---|---|---|---|
| [F1](#f1--doc-drift-live-environmentmd-shows-the-m1-chain-off-but-it-is-on--highest-impact) | live-environment.md M1 chain OFF→ON | **CLAUDE** | doc edit, no live change | (new) |
| [F2](#f2--doc-drift-the-1012-flow-count-needs-a-note-build-only-vs-imported) | 10/12 flow-count note | **CLAUDE** | doc note | (new) |
| [F4](#f4--s7-iac-parser-storage-bicep-omits-allowsharedkeyaccessfalse) | parser-storage Bicep `allowSharedKeyAccess:false` | **CLAUDE** | Bicep edit (staged) | S7 |
| [F4-apply](#f4-apply--s7-security-live-deny-shared-key-on-the-parser-storage--operator-) | deny Shared Key on live `cespikestx7xt3d` | **operator 🔒** | live resource mutation | S7 |
| [F5](#f5--iac-drift-live-enrichment-app-insights-has-no-companion-workspace-in-the-rg) | enrichment App Insights workspace binding | CLAUDE confirms / **operator 🔒** redeploys | live redeploy | S7 |
| [F6](#f6--s1-security-a-committed-parser-function-key-is-in-git-history--operator-) | committed parser key in git history | **operator 🔒** | live secret + connection | S1 |
| [F7](#f7--s1-security-repo-gate-no-secret-scan-guards-against-re-committing-a-key) | secret-scan repo gate | **CLAUDE** | repo gate (planned) | S1 |
| [F8](#f8--h3-wiring-live-cs-intake-still-runs-the-unanchored-contains-provider-match-) | anchored provider-match to live intake | CLAUDE pre-stages / **operator 🔒** applies | webhook-sensitive designer save | H3 / S11 |
| [F9](#f9--env-var--gate-coherence-manifest-vs-flows--bicep) | env-var / gate coherence | **CLAUDE** | manifest edit, no live change | (new) |
| [F10](#f10--s9-iac-sprawl-optional-per-function-log-analytics-workspaces) | per-Function LAW consolidation | **CLAUDE** (optional/deferred) | IaC refactor | S9 |
| [F11](#f11--deploy-pending-confirmation-evasentry--evavalidation-correctly-absent--record-only) | evasentry/evavalidation absent | — | record only | — |

---

## Risks (cross-cutting)

- **Re-arming the live webhook (F8).** Any edit to live CS Intake re-registers the digital@ Office 365
  webhook on the designer save; done carelessly it silently breaks live email intake (this exact
  failure happened before). Designer Save, `concurrency=1`, operator-only.
- **Denying Shared Key on live storage (F4-apply).** Breaks anything still authenticating with the
  account key. The host uses MI so it should be safe, but verify no out-of-band tool/SAS uses the key
  before flipping (otherwise 403).
- **Rotating the parser key (F6).** Invalidates connection `cr1bd_ceparser` until updated — sequence the
  rotation + connection update **together** or manual-intake parse + live CS Parse break.
- **Redeploying enrichment (F5).** A param drift would regenerate the uniqueString-derived names and
  create a parallel app — pin `namePrefix`/`environmentName` to the existing `gi62sd` suffix so it
  updates in place.
- **Doc-only (F1).** Leaving live-environment.md stale (M1 chain shown OFF when it is ON) misleads
  future planning + the operator deploy-runbook. The canonical registry must win or be corrected
  (precedence: binding review > ADR > architecture spec).

---

## Open questions (carried)

1. **F6 rotation decision** — rotate the parser key (the only true fix; it is in git history) or
   formally accept-and-document the exposure? Explicit operator call needed.
2. **F5 enrichment App Insights** — live `cespkenrich-ai-gi62sd` workspace-less/classic, or bound to a
   managed LAW in a hidden RG? Needs `az monitor app-insights component show … --query WorkspaceResourceId`.
3. **F10 LAW consolidation** — worth the refactor churn in a throwaway dev sandbox, or accept the sprawl
   until a Test/Prod ALM cut?
4. **F2 repo-only flows** — import `intake-shared-mailbox` (multi-inbox) + `chaser-send` now, or keep
   build-only until Phase 2 / H1 multi-inbox + chaser activation? (Determines whether the 10/12 gap is
   "drift" or "planned backlog" — this audit treats it as planned backlog.)

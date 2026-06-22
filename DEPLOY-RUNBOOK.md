# Phase 1 Deploy Runbook — collisionspike (M1)

This runbook takes the **offline, fully-built** Phase 1 artifacts in this repo to a **live** Power
Platform + Azure environment. It is the bridge across the hard boundary that governed the build:

> **Claude built everything offline (`[BUILD]`) and never touched a live service.** Deploying
> non-inbox resources (`[DEPLOY-WITH-LOGIN]`) requires *your* interactive login. Activating anything
> that touches the **live Outlook shared inboxes, the live SharePoint job sheet, live Box, or live
> EVA** — and all live tests — is **`[RESERVED-FOR-USER]`**: you do it, in the order below, after the
> non-inbox pieces are deployed and the offline gate is green.

**Before anything here:** run the offline gate and confirm it is clean.

```
node verify-all.mjs        # expect: a final line starting `OK — … 0 failed …` (exit 0)
```

(Gate count grew past the original 6 as static guards were added — e.g. the generated-service
hand-edit check in §5a. The pass/fail line is authoritative: **0 failed** is the bar; Python Function
suites report SKIP when their local `.venv` is absent.)

Source of truth for scope/sequencing: [docs/plans/phase-1-intake-and-case-tracking/phase-1-intake-and-case-tracking-implementation.md](./docs/plans/phase-1-intake-and-case-tracking/phase-1-intake-and-case-tracking-implementation.md) (§9 sequencing, §8.3 live checklist, §8.5 boundary gate).

---

## 0. Resolve the deploy blockers FIRST

These do **not** affect the offline build (all gates pass), but each must be settled before the
dependent live step can work. They are tracked in code/READMEs and surfaced here so none is lost.

> **The consolidated operator registry — every hard/soft blocker across all phases — now lives in
> [docs/gated.md](./docs/gated.md)** (authoritative for the full list + the hard-vs-soft
> classification). The table below is the deploy-sequence view of the original blockers (B1–B5).

| # | Blocker | Where | Impact if unresolved | Resolution |
|---|---|---|---|---|
| ~~B1~~ | **OBVIATED 2026-06-18 — gateway removed from the path.** The enrichment Function now calls **DVSA + DVLA directly** (the DVSA MOT API is itself Entra-authenticated — `client_credentials` at `login.microsoftonline.com`), so there is **no Google Cloud gateway** and no grant to add. `gateway_client.py` deleted; replaced by `dvsa_client.py` + `dvla_client.py` + `analysis.py`. | (was `functions/enrichment/gateway_client.py`) | None — direct Entra auth. | **RESOLVED by removal.** Remaining = inject DVSA/DVLA creds into Key Vault `cespkenrichkvgi62sd` + set `DVSA_TENANT_ID` (activation, RESERVED-FOR-USER). |
| B2 | **Parser legacy field set.** The sibling `cedocumentmapper_v2` still emits the *legacy* fields; the adapter renames `incident_date→date_of_loss`, `instruction_date→date_of_instruction`, drops `inspection_date`, and defaults `claimant_telephone` / `claimant_email` to **absent**. | `functions/parser/parser_adapter.py` | Those 2 EVA fields arrive empty (staff must fill them); not unsafe, but incomplete pre-fill. | Confirm with **document-parser-engineer** whether the sibling adopts the EVA key names / emits telephone+email. Optional for M1 (staff completes); required for full auto-fill. |
| B3 | **~~13th EVA field name.~~ RESOLVED — field removed, contract is now 12 fields.** Per the product owner's ruling, engineer allocation is **NOT an EVA submission field** — it is left blank and assigned inside EVA *after* submission. `engineer_allocation` removed entirely from the contract in lockstep across the schema, the TS serializer, the Dataverse Case table (`cr1bd_evaengineerallocation` dropped), the parser adapter, the connector, and the parse flow. Offline gate green (`verify-all.mjs` 6/6). | (was: `contracts/eva-payload.schema.json`, `mockup-app/src/contracts/eva-export.ts`, `dataverse/schema/case.json`, parser adapter) | None — EVA submit now sends exactly the 12 settled fields. | **RESOLVED** (2026-06-18). |
| B4 | **Code Apps not enabled on the environment + licensing.** **CONFIRMED 2026-06-18:** `pac code push` → HTTP **403 `CodeAppOperationNotAllowedInEnvironment`**. The env-level Code Apps feature is off; the maker also needs Power Apps **Premium**. | env feature toggle + per-user license | Code App cannot deploy. (App is **built + wired**; `appId` still `null` → push resumes cleanly once cleared.) | Power Platform admin center → **Environments → Collision Engineers - Dev → Settings → Product → Features → enable "Power Apps code apps"**; assign **Power Apps Premium** to the maker; then re-run `pac code push`. |
| B5 | **EVA test creds + Box case-sensitivity.** | env-vars / Box | API path can't be validated; Box folder casing. | Confirm EVA **test** credentials (Infisical) and that Box honours the UPPERCASE Case/PO folder name before activating finalization (§ live step 9). |

---

## 0a. Deploy status — what is LIVE (M1 snapshot; enrichment activated 2026-06-21)

Much of §1–§6 is already executed in a dedicated **Sandbox** (NOT the Default environment):

| Piece | Status | Where |
|---|---|---|
| **Azure parser Function** | ✅ Deployed + **extracting real PDFs** (live-verified: provider/claimant/dates/address/VRM/reference) | **Flex Consumption (FC1)** — not EP1 — `rg-collisionspike-dev`, UK South, `cespike-parser-dev-x7xt3d5ovhi7y` |
| **Dataverse schema** | ✅ Built — 11 tables, 19 choice sets, 15 relationships, 3 alt keys, 18 env-vars (11 M1 + 5 Box gates + 2 Box config; `ENRICHMENT_ENABLED` default false but **Dev current=true — live**), EVA secrets Key-Vault-typed (no values) | Sandbox **`Collision Engineers - Dev`** (`b3090c42-…`), solution `CollisionSpike`, publisher prefix `cr1bd` |
| **Parser custom connector** | ✅ Created, points at the live host | Sandbox, `CollisionSpike` solution (id `ccdec4fd-…`) |
| **Code App** | ✅ **Deployed + live** (B4 cleared by enabling Code Apps on the env); wired to live Dataverse; **manual-intake** path added (upload → parse → Case) | `mockup-app/`, app id `da7ba7af-…`, Sandbox |
| **Cloud flows (×15)** | ✅ Imported **`state=off`** (`case-resolve` ON — Claude-wired merge-by-registration; rest Draft); connection refs unbound (operator binds at activation) | Sandbox, solution `CollisionSpikeFlows` |
| **Enrichment Function (DVSA)** | ✅ **Deployed + LIVE** (`cr1bd_ENRICHMENT_ENABLED` flipped to `true` in Dev on 2026-06-21) — calls **DVSA + DVLA directly** (Entra `client_credentials` + `X-API-Key`); **no gateway, no Google Cloud** (B1 obviated). Live-verified returning vehicle data (`BC23JZE`→SsangYong Rexton). | `cespkenrich-fn-gi62sd`, KV `cespkenrichkvgi62sd`, `rg-collisionspike-dev` |
| **EVA / Box / live inbox** | ⛔ Not activated | Operator-gated: connections + EVA secret injection + DVSA/DVLA creds into Key Vault (the enrichment Azure Function is already deployed and live; no Cloud Run deploy needed) |

Notes: the parser engine is **vendored** into the FC1 package (text PDF/DOCX/DOC/EML/MSG work; scanned-image
**OCR is deferred** to an Azure Container Apps host — "B-full", FC1 can't run the Tesseract binary). The cost
shape changed from the originally-authored EP1 to **FC1** (≈£0 idle). Everything operator-gated for *activation*
(Code App push, flow connections + turn-on, EVA/Box, live inbox) remains reserved for you.

---

## 1. Prerequisites (interactive — you run these)

```
pac auth create        # Power Platform — select the target environment
az login               # Azure — select the subscription/tenant
```

- Confirm a **Dataverse** environment with capacity, and an **Azure** subscription for Functions/Key Vault.
- Phase 0 scaffold reconciliation: the Code App in `mockup-app/` is the prototype shell. Run
  `pac code init` to attach the real Power Platform project metadata (`power.config`, `PowerProvider`),
  keeping `src/` as-is — the data seam (`src/data/`) is already structured for the swap. `[DEPLOY-WITH-LOGIN]`

---

## 2. `[DEPLOY-WITH-LOGIN]` — Dataverse solution (non-inbox)

The schema is authored as code in `dataverse/`. Import it (tables, the 11-value case-status choice
set + the other choice sets, relationships, and the **environment-variable definitions with their M1
defaults**). `[DEPLOY-WITH-LOGIN]`

- 10 tables + `FieldLevelProvenance` (4 M1-live: Case, Evidence, WorkProvider, AuditEvent; 6 staged).
- Env-var M1 defaults (from `dataverse/environment-variables.json`): `PDF_MAPPER_ENABLED=true`,
  `ENRICHMENT_ENABLED=true`, `EVA_API_ENABLED=false`, `AZURE_MAPS_ENABLED=false`,
  `VALUATION_ENABLED=false`, `COPILOT_ENABLED=false`, `AZURE_VISION_ENABLED=false`. Secrets
  (`EVA_CLIENT_ID/SECRET`) are **Key Vault references** — values injected in §3.
  > **Per-environment `ENRICHMENT_ENABLED` is the activation gate.** The manifest *default* is
  > `false` (the shipped value); enrichment ships OFF until DVSA/DVLA creds are in Key Vault.
  > **In Dev it is now ON** — creds were injected and `cr1bd_ENRICHMENT_ENABLED` was flipped to
  > `true` on 2026-06-21 (enrichment is live). B1 is obviated (gateway removed). When importing into a
  > NEW environment, leave it `false` until that environment's DVSA/DVLA creds are injected, then flip
  > the current value to `true`.

> Reconcile the `cr1bd_` publisher prefix + the `statuscode` integer values against your environment
> before import; the parity test (`node dataverse/verify-parity.mjs`) is the contract the import must match.

---

## 3. `[DEPLOY-WITH-LOGIN]` — Azure Functions + Key Vault + Entra (non-inbox)

For **each** of `functions/parser/` and `functions/enrichment/`:

1. Deploy infra: `az deployment group create ... --template-file infra/main.bicep` (parameterized; no
   subscription/tenant/secret literals). Creates the Function App (system-assigned identity), Storage,
   App Insights, and — for enrichment — a Key Vault with the MI granted *Key Vault Secrets User*. `[DEPLOY-WITH-LOGIN]`
2. Publish the code: `func azure functionapp publish <name>`. `[DEPLOY-WITH-LOGIN]`
3. **Inject the secret VALUES** into Key Vault — these never existed in the repo, only references do.
   For the **enrichment** KV (`cespkenrichkvgi62sd`): **DVSA/DVLA credentials** (`DVSA_API_KEY`,
   `DVLA_API_KEY`, `DVSA_TENANT_ID`, `DVSA_CLIENT_ID`, `DVSA_CLIENT_SECRET`). Gateway secrets: **not
   needed — B1 obviated** (no Google Cloud OAuth gateway in M1). For **EVA**: `EVA_CLIENT_ID` /
   `EVA_CLIENT_SECRET` (injected at EVA activation). **`[RESERVED-FOR-USER]`**
4. Register the Entra app(s) for the service identity / EVA OAuth and grant consent. `[RESERVED-FOR-USER]` (consent)

> **Do not enable enrichment until blocker B1 is resolved.** Parser deploy is independent and safe.

---

## 4. `[DEPLOY-WITH-LOGIN]` — Custom connectors (non-inbox)

Import the two custom connectors from their OpenAPI 2.0 specs, set host = the deployed Function host,
and store the function key on the connection (parser uses FUNCTION-level auth):

- `functions/parser/openapi/parser-connector.json` → `shared_ceparser`
- `functions/enrichment/openapi/enrichment-connector.json` → `shared_evasentry`-adjacent enrichment connector

---

## 5. `[DEPLOY-WITH-LOGIN]` — Code App (non-inbox)

1. `pac code add-data-source` to generate the typed Dataverse services into `src/generated/`. `[DEPLOY-WITH-LOGIN]`
2. Wire them to the seam: call `configureDataAccess(generatedServices)` once at startup (e.g. in
   `main.tsx`) so `data` switches from the mock source to `dataverse-source`. **No screen edits** — the
   seam (`src/data/`) and the field adapter (`src/data/adapter.ts`) already map `cr1bd_*` ↔ camelCase
   and `statuscode` ↔ `CaseStatus`. Re-run `npm run build` to confirm green against the real services.
3. `pac code push` to deploy the app. `[DEPLOY-WITH-LOGIN]`

### 5a. Generated-service hand-edit — re-apply after every `pac code` regeneration

`pac code add-data-source` (generator 2.8.x) emits, in
`mockup-app/src/generated/services/Cr1bd_evidencesService.ts`, a file-upload method whose body calls
`client.uploadFileToRecord(...)`. The `@microsoft/power-apps` **1.0.3** `DataClient` exposes **no
file-upload API** (only `createRecordAsync` / `updateRecordAsync` / `deleteRecordAsync` /
`retrieveRecordAsync` / `retrieveMultipleRecordsAsync` / `executeAsync`, whose typed action is limited
to `getEntityMetadata`), so the generated body **does not compile**.

The repo carries a **hand-edit**: the method is renamed `upload(...)`, the signature/union types are
kept intact, and the body throws (M1 binds Evidence **read-only** — no file upload, so the method is
unused). This is the single deviation from the autogenerated `src/generated/` tree.

> **Requirement:** any time you re-run `pac code add-data-source` (or otherwise regenerate
> `src/generated/`), the generator **silently overwrites** the file and reintroduces the broken
> `client.uploadFileToRecord(...)` call. You **must re-apply the hand-edit** before `npm run build`
> / `pac code push`. This holds **until `@microsoft/power-apps` >= 1.0.4** ships a `DataClient`
> file-upload API, at which point regenerate cleanly and drop the hand-edit.
>
> The offline gate enforces this: `verify-all.mjs` runs a **read-only** static check
> (*"no uploadFileToRecord in generated services"*) that **FAILS** if the literal
> `client.uploadFileToRecord(` reappears anywhere under `mockup-app/src/generated/`. A red gate here
> means a regeneration clobbered the hand-edit — re-apply it. (The check only reads the generated
> tree; it never edits generated code.)

---

## 6. `[DEPLOY-WITH-LOGIN]` — Flows imported, left OFF

Import the M1 flow definitions (the 10 non-Box flows under `flows/definitions/`; the 5 Phase-7 Box flows are out of scope for this M1 runbook) and the connection references
(`flows/connection-references.json`) into the solution. **Every flow ships `state=off`** — importing is
non-inbox; **activation is the next section.** Bind the connection references to real connections *for
non-inbox connectors only* (Dataverse, the two custom connectors). Outlook / SharePoint / Box
connections are created by you at activation.

---

## 7. `[RESERVED-FOR-USER]` — Live validation checklist (you run, in order)

Performed **after** §1–6, against live inboxes/SharePoint/Box/EVA. Do **one mailbox first.**

1. Complete the remaining interactive connections (Outlook shared mailbox, SharePoint, Box) and
   **turn ON the intake flow for ONE shared inbox only.**
2. Send a **test email** (your address → that mailbox) with one instruction PDF + 2 images (one
   overview with a legible plate, one damage closeup).
3. In the Code App, confirm: a **Case appears** within the expected interval; status `new_email →
   ingested`; provider matched by sender domain; 12 fields pre-filled with provenance badges (note B2 —
   telephone/email may be blank pending the parser).
4. Confirm **Outlook categories** applied (provider + ingestion-success).
5. Open the Case: confirm **image roles / registration-visible**; drive the **readiness checklist** to
   green; confirm the **Address** decision gate (override-with-reason if image-based — never silent).
6. Confirm **dedup** (ADR-0010): re-send the same email → **dropped**; same VRM **different reference**
   → **new case + duplicate_risk**; same VRM **no reference** → **propose-attach** (the dedup decision
   UI surfaces the candidate; Accept-link is disabled when references differ).
7. Confirm the **SharePoint job-sheet mirror** (if you have activated the import) shows staged drafts —
   none auto-activated.
8. **EVA (M1 path):** with `EVA_API_ENABLED=false`, **export the 12-field JSON** and drag-drop it into
   the EVA **test** environment; confirm acceptance. (Only flip `EVA_API_ENABLED=true` with test creds
   once B1/B5 are settled.)
9. Confirm **Box** folder created with the **UPPERCASE** Case/PO in unison with EVA submit; confirm the
   photo order (2 previews first, then all including those two).
10. Confirm **AuditEvent** rows for ingest/review/submit; confirm a **chaser drafts** (never sends) for
    a deliberately-partial case.
11. Only after single-mailbox success: turn ON the remaining two shared inboxes.

---

## 8. `[RESERVED-FOR-USER]` — Boundary-compliance gate (pre-handoff evidence)

Mechanical proof that nothing live was touched before activation:

1. **Static grep gate** (in `verify-all.mjs` / per-slice): zero live EVA/Box/Graph-send/SharePoint-write
   calls in the Code App; such calls live only in flow definitions that are imported **OFF**.
2. **Flow-state assertion:** every intake / classify / SharePoint / finalize / chaser flow is present in
   the solution with state = **off** (`flows/flow-state.json` + the flow linter's checks — currently 154/154).
3. **No-credentials assertion:** no EVA / gateway / Box secret **values** in the repo — only Key Vault
   **references** and env-var **names** (the `no secret literals` grep gate).
4. **Connection inventory:** `pac connection list` — confirm no connection was bound to a live shared
   mailbox by the build; Outlook/SharePoint/Box connections are created **by you** at activation.
5. **Deploy log:** every `[DEPLOY-WITH-LOGIN]` action (Dataverse, Functions, Key Vault, connectors, Code
   App) is non-inbox; every `[RESERVED-FOR-USER]` action (flow activation, secret injection, live tests,
   EVA prod cutover) is performed only by you, in §7.

---

## What "done" looks like for M1

A real email in one shared inbox becomes a tracked Case, is parsed + (optionally) enriched into the 12
EVA fields with provenance, passes a human readiness review, and is exported to EVA as drag-drop JSON
with a Box archive folder — with dedup, provider matching, and the inspection-address gate all behaving
per the offline decision-table tests. The Sentry REST path and full enrichment come online once B2/B5
are resolved and their gates are flipped in a test environment. (B1/B3 are resolved/obviated.)

> **State snapshot:** [CURRENT_STATUS.md](./CURRENT_STATUS.md) is the single source of truth for what is
> live vs pending; [ROADMAP.md](./ROADMAP.md) is the phased checklist.

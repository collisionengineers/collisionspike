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
node verify-all.mjs        # expect: OK — 6 passed, 0 failed
```

Source of truth for scope/sequencing: [plans/phase-1-intake-and-case-tracking-implementation.md](./plans/phase-1-intake-and-case-tracking-implementation.md) (§9 sequencing, §8.3 live checklist, §8.5 boundary gate).

---

## 0. Resolve the deploy blockers FIRST

These do **not** affect the offline build (all gates pass), but each must be settled before the
dependent live step can work. They are tracked in code/READMEs and surfaced here so none is lost.

| # | Blocker | Where | Impact if unresolved | Resolution |
|---|---|---|---|---|
| B1 | **Gateway grant type.** The wrapper authenticates with OAuth2 `client_credentials`, but the live `ce-mcp-gateway` (`collisionplugin/.../mcp-gateway`) registers only `authorization_code + PKCE` / `refresh_token`. | `functions/enrichment/gateway_client.py` `_fetch_token` | Enrichment cannot authenticate in-tenant → DVSA calls 401. | Add a `client_credentials` grant + a confidential **service client** to the gateway (integrations.md Option C), or re-implement `_fetch_token` for the supported machine flow. Keep `ENRICHMENT_ENABLED=false` until done (Bicep default). |
| B2 | **Parser legacy field set.** The sibling `cedocumentmapper_v2` still emits the *legacy* fields; the adapter renames `incident_date→date_of_loss`, `instruction_date→date_of_instruction`, drops `inspection_date`, and defaults `claimant_telephone` / `claimant_email` / `engineer_allocation` to **absent**. | `functions/parser/parser_adapter.py` | Those 3 EVA fields arrive empty (staff must fill them); not unsafe, but incomplete pre-fill. | Confirm with **document-parser-engineer** whether the sibling adopts the EVA key names / emits telephone+email. Optional for M1 (staff completes); required for full auto-fill. |
| B3 | **13th EVA field name.** `engineer_allocation` is a settled *placeholder*. | `contracts/eva-payload.schema.json`, `mockup-app/src/contracts/eva-export.ts`, `dataverse/schema/case.json`, parser adapter | EVA submit uses a placeholder key for field 13. | Transcribe the real name from `Sentry API Documentation 1.2 Amended.pdf` and rename in **lockstep** across those four files (then re-run `verify-all.mjs`). |
| B4 | **Code Apps GA + licensing.** `pac` still marks `code` as *(Preview)*; the app needs Power Apps **Premium** per-user. | — | `pac code push` may be gated. | Confirm Code Apps GA + Premium licensing in the target environment before §5. |
| B5 | **EVA test creds + Box case-sensitivity.** | env-vars / Box | API path can't be validated; Box folder casing. | Confirm EVA **test** credentials (Infisical) and that Box honours the UPPERCASE Case/PO folder name before activating finalization (§ live step 9). |

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

> Reconcile the `cr1bd_` publisher prefix + the `statuscode` integer values against your environment
> before import; the parity test (`node dataverse/verify-parity.mjs`) is the contract the import must match.

---

## 3. `[DEPLOY-WITH-LOGIN]` — Azure Functions + Key Vault + Entra (non-inbox)

For **each** of `functions/parser/` and `functions/enrichment/`:

1. Deploy infra: `az deployment group create ... --template-file infra/main.bicep` (parameterized; no
   subscription/tenant/secret literals). Creates the Function App (system-assigned identity), Storage,
   App Insights, and — for enrichment — a Key Vault with the MI granted *Key Vault Secrets User*. `[DEPLOY-WITH-LOGIN]`
2. Publish the code: `func azure functionapp publish <name>`. `[DEPLOY-WITH-LOGIN]`
3. **Inject the secret VALUES** (gateway `CLIENT_ID/SECRET`, EVA `CLIENT_ID/SECRET`) into Key Vault.
   These never existed in the repo — only references do. **`[RESERVED-FOR-USER]`**
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

---

## 6. `[DEPLOY-WITH-LOGIN]` — Flows imported, left OFF

Import the 10 flow definitions (`flows/definitions/*.definition.json`) and the connection references
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
   ingested`; provider matched by sender domain; 13 fields pre-filled with provenance badges (note B2 —
   telephone/email/engineer_allocation may be blank pending the parser).
4. Confirm **Outlook categories** applied (provider + ingestion-success).
5. Open the Case: confirm **image roles / registration-visible**; drive the **readiness checklist** to
   green; confirm the **Address** decision gate (override-with-reason if image-based — never silent).
6. Confirm **dedup** (ADR-0010): re-send the same email → **dropped**; same VRM **different reference**
   → **new case + duplicate_risk**; same VRM **no reference** → **propose-attach** (the dedup decision
   UI surfaces the candidate; Accept-link is disabled when references differ).
7. Confirm the **SharePoint job-sheet mirror** (if you have activated the import) shows staged drafts —
   none auto-activated.
8. **EVA (M1 path):** with `EVA_API_ENABLED=false`, **export the 13-field JSON** and drag-drop it into
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
   the solution with state = **off** (`flows/flow-state.json` + the flow linter's 97 checks).
3. **No-credentials assertion:** no EVA / gateway / Box secret **values** in the repo — only Key Vault
   **references** and env-var **names** (the `no secret literals` grep gate).
4. **Connection inventory:** `pac connection list` — confirm no connection was bound to a live shared
   mailbox by the build; Outlook/SharePoint/Box connections are created **by you** at activation.
5. **Deploy log:** every `[DEPLOY-WITH-LOGIN]` action (Dataverse, Functions, Key Vault, connectors, Code
   App) is non-inbox; every `[RESERVED-FOR-USER]` action (flow activation, secret injection, live tests,
   EVA prod cutover) is performed only by you, in §7.

---

## What "done" looks like for M1

A real email in one shared inbox becomes a tracked Case, is parsed + (optionally) enriched into the 13
EVA fields with provenance, passes a human readiness review, and is exported to EVA as drag-drop JSON
with a Box archive folder — with dedup, provider matching, and the inspection-address gate all behaving
per the offline decision-table tests. The Sentry REST path and full enrichment come online once B1/B3/B5
are resolved and their gates are flipped in a test environment.

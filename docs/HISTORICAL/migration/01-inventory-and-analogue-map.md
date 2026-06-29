# 01 — Inventory & Azure analogue map

The verified current-state inventory (from a direct read of the repo, 2026-06) and the Azure target
each component maps to. Every analogue carries the **Microsoft Learn topic** used to verify it —
re-check before relying on a command in a new month.

Tags: **[AZ]** already on Azure, keep as-is · **[PP]** Power-Platform-only, migrate or rebuild ·
**[EXT]** external, unchanged.

---

## 1. Inventory by layer

### Dataverse data layer **[PP]** — `dataverse/`
- **12 tables** (`dataverse/schema/*.json`, excluding the two `_*.schema.json` meta files):
  `case`, `evidence`, `work-provider`, `repairer`, `image-source`, `inspection-address`,
  `inbound-email`, `chaser`, `note`, `field-level-provenance`, `improvement-signal`, `audit-event`
  (logical names `cr1bd_case`, `cr1bd_evidence`, …).
- **17 choicesets** (`dataverse/choicesets/*.json`) — `action-reason`, `audit-event`,
  `case-link-state`, `case-status`, `case-type`, `chaser`, `evidence-kind`,
  `field-provenance-source-type`, `image-role`, `image-source`,
  `improvement-signal-classification`, `inbound-email-classification`, `inspection-decision-mode`,
  `inspection-location-policy`, `intake-channel`, `provider-automation-mode`, `review-state`
  (integer codes like `audit-event.box_folder_created = 100000019` that EVA/contracts depend on —
  **preserve exactly**).
- **15 one-to-many + 2 N:N** (`dataverse/relationships.json` — keyed `oneToMany`[15] / `manyToMany`[2]).
  **4 are `Cascade`-delete** (`cr1bd_case_evidence`, `cr1bd_case_fieldlevelprovenance`,
  `cr1bd_case_chaser`, `cr1bd_case_note`); the other 11 one-to-many are `RemoveLink`. The 2 N:N are
  `cr1bd_repairer_workprovider` and `cr1bd_imagesource_workprovider`.
- **Dedup alternate key** on inbound-email `sourcemessageid` (Internet Message-ID).
- **28 environment variables** (`dataverse/environment-variables.json`) — **20 Boolean gates,
  6 String config vars, 2 Secret (KV-ref)**: `cr1bd_EVA_CLIENT_ID` / `cr1bd_EVA_CLIENT_SECRET`
  (see [`10`](./10-settings-migration.md) for the full list).
- **2 security roles** (`dataverse/roles/*.json`, excluding `_role.schema.json`) — admin + user,
  depth-based table privileges, audit append-only-except-delete.
- **2 solutions** — `CollisionSpike` (schema, `fb532f91-…`) + `CollisionSpikeFlows` (`41c87a85-…`),
  publisher prefix `cr1bd`.

### Orchestration **[PP]** — `flows/definitions/`
- **17 flow definitions** (`flows/definitions/*.json`). `flow-state.json` ships every flow `state=off`;
  in the live tenant only **3 are activated** (`CS Intake`, `CS Provider Match`, `CS Case Resolve`).
- **M1 intake chain (7):** `intake` (orchestrator, Outlook `OnNewEmailV3`, concurrency 1) →
  `provider-match` → `case-resolve` → `classify-persist` → `parse` → `status-evaluate` → `enrich`.
- **`intake-shared-mailbox` (1):** parameterised per-inbox variant of `intake` on the
  `SharedMailboxOnNewEmailV2` trigger (`mailboxAddress` = `IntakeMailbox`); one copy per inbox.
- **9 gated/offline flows:** `finalize-eva-box`, `chaser-draft`, `chaser-send`, `jobsheet-import`,
  `triage-classify`, `box-folder-create`, `box-file-request-copy`, `box-blob-purge`, `case-disposition`.

### Custom connectors **[PP]** — `functions/*/openapi/`, `ocr/openapi/`, `connectors/`
- **7 connectors**, all wrapping Functions with **function-key auth** (`x-functions-key` on the
  connection): `cr1bd_ceparser` (ParseDocument, ClassifyEmail) · `cr1bd_dvsaenrich` (EnrichDvsaMot) ·
  `cr1bd_evasentry` (EVA Sentry submit) · `cr1bd_evavalidation` (ValidateCase) — these 4 OpenAPI defs
  live under `functions/<fn>/openapi/<fn>-connector.json`. `cr1bd_box_rest`
  (`functions/box-webhook/openapi/`) · `cr1bd_ocr` (`ocr/openapi/`, OcrPdf + PlateOcr) ·
  `CE Location Assist` (`connectors/location-suggest/apiDefinition.swagger.json`, SuggestLocation) —
  authored offline. **The `connectors/` directory itself holds only `location-suggest`**; the rest are
  colocated with their Function. `cr1bd_ceparser` + `cr1bd_dvsaenrich` are bound live; the other 5 are
  authored/offline.

### Frontend **[PP]** — `mockup-app/`
- Power Apps **Code App** (React 18 + Vite + Fluent v9), app id `da7ba7af-…`, CSP `connect-src 'none'`
  (connectors only). ~11.5k LOC portable; ~2.6k LOC data seam to rewrite. See [`30`](./30-frontend-preservation.md).

### Azure Functions **[AZ]** — `functions/`, `ocr/` (keep, no port)
- **parser** (`cespike-parser-dev-x7xt3d5ovhi7y`) — vendored `cedocumentmapper_v2` engine.
- **enrichment** (`cespkenrich-fn-gi62sd`) — DVSA/DVLA direct via Entra; KV `cespkenrichkvgi62sd` populated.
- **evasentry** (`cespkeva-fn-ufa3ci`) — gated off.
- **evavalidation** (`cespkeval-fn-6c6fxd`) — pure domain logic.
- **box-webhook** (`cespkbox-fn-v76a47`) — gated off, Gate-C-verified.
- **location-suggest** — authored, not yet deployed.
- **ocr** — ACA container `cespkocr-fn-dev-glju3v` (scale-to-zero), gated off.

### Supporting Azure **[AZ]** — keep
- **3 Key Vaults:** `cespkenrichkvgi62sd` (populated), `cespkevakvufa3ci` (empty), `cespkboxkvv76a47` (empty).
- **App Insights/LAW:** `cespike-parser-ai-dev` / `-law-dev` (shared by the 4 FC1 Functions);
  `cespkocr-ai-dev` / `-law-dev` (OCR).
- **Blob:** `cespkevidstdev01` (evidence bytes, soft-delete + versioning).
- **ACR:** `cespkocracraeee76`. **RG:** `rg-collisionspike-dev` (UK South).

### External **[EXT]** — unchanged
- EVA Sentry REST · Box · DVSA MOT + DVLA · Azure AI Vision + Azure Maps (gated) · postcode.io ·
  Outlook shared mailbox (`digital@collisionengineers.co.uk`).

---

## 2. Analogue map (each row → mslearn verify-topic)

| Current component (path) | Tag | Azure target | mslearn topic (exact page title) |
|---|---|---|---|
| Code App shell (`mockup-app/`) | PP | **Static Web Apps** (Free) | "What is Azure Static Web Apps?" |
| Dataverse system-of-record (`dataverse/schema/`, 12 tables) | PP | **Azure DB for PostgreSQL Flexible Server B1ms** | "Use an Azure free account to try Azure Database for PostgreSQL for free"; "Compute options in Azure Database for PostgreSQL" |
| Dataverse auto-OData API (via connectors) | PP | **NEW standalone Flex Consumption Functions HTTP API (BFF)** | "Overview of API support in Azure Static Web Apps" (45s cap, HTTP-only, one backend); "API support in Azure Static Web Apps with Azure Functions" (managed-vs-BYO: managed = HTTP-only, **no managed identity, no Key Vault references** → must be standalone) |
| 17 choicesets (`dataverse/choicesets/`) | PP | Postgres **lookup tables / enums**, integer codes preserved | "PostgreSQL CREATE TYPE / enumerated types" (postgresql.org) |
| 15 one-to-many + 2 N:N, 4 Cascade (`relationships.json`) | PP | **FK + `ON DELETE CASCADE` / `SET NULL`; junction tables for N:N** | "PostgreSQL foreign keys / referential actions" (postgresql.org) |
| Dedup alt-key on `sourcemessageid` | PP | **UNIQUE constraint** | "PostgreSQL unique constraints" (postgresql.org) |
| 2 security roles (`dataverse/roles/`) | PP | **Entra app roles + API authz**, optional **Postgres RLS** | "Add app roles to your application and receive them in the token"; "PostgreSQL row-level security" (postgresql.org) |
| 28 env-vars: 20 Boolean gates + 6 String (`environment-variables.json`) | PP | **Function app-settings** (free); `HOLD_NEW_CASES_BY_DEFAULT` → DB row | "App settings reference for Azure Functions" |
| 2 Secret env-vars (`EVA_CLIENT_ID/SECRET`, KV-ref) | PP | **Keep Key Vault + Functions Key Vault references** | "Use Key Vault references as app settings in Azure App Service and Azure Functions" |
| Dataverse platform audit | PP | **App-written audit** (already `cr1bd_auditevent` table) | — (own table; no platform analogue) |
| Intake chain + Outlook `OnNewEmailV3` (`flows/definitions/intake.definition.json`) | PP | **Durable/queue Functions; Graph change-notification subscription + renewal loop + lifecycle** | "Change notifications for Outlook resources in Microsoft Graph"; "Set up notifications for changes in resource data" (subscription lifetime — Outlook message 10,080 min); "Reduce missing subscriptions and change notifications" (lifecycle) |
| 9 gated flows (EVA/Box/chaser/disposition) | PP | Durable orchestrations / folded into the API | "Programming model overview (durable-functions)"; "Quickstart: Create a TypeScript Durable Functions app" |
| 7 custom connectors (`functions/*/openapi`, `ocr/openapi`, `connectors/`, function-key) | PP | **Drop the connector layer** — API/Durable call the Functions directly (key/managed identity) | "Work with access keys in Azure Functions"; "How to use managed identities for App Service and Azure Functions" |
| PowerProvider `getContext()` (`mockup-app/src/PowerProvider.tsx`) | PP | **Entra via MSAL** (SPA) + JWT validation (API) | "Tutorial: Sign in users in a React single-page app (SPA)"; "Validate tokens" |
| `pac code push` deploy | PP | **SWA deploy** (`az staticwebapp` / SWA CLI / GitHub Actions) | "Deploy to Azure Static Web Apps" |
| Solutions + Pipelines (ALM) | PP | **Bicep + `az` IaC + Git** | "What is Bicep?" |
| 6 Functions + OCR ACA, 3 KV, App Insights/LAW, Blob, ACR, RG | AZ | **unchanged** | — |
| EVA / Box / DVSA / DVLA / Vision / Maps / postcode.io / Outlook | EXT | **unchanged** | — |

A machine-readable mirror of this table is in [`assets/analogue-map.csv`](./assets/analogue-map.csv).

---

## 3. What is genuinely free to move vs what is the real cost

- **Free (≈0 port):** the 6 Functions, the vendored parser engine, every external integration
  (plain REST + standard auth), and ~65–70% of the React app (clean `DataAccess` seam).
- **The real cost (≈30–40% of effort):** replacing **Dataverse** (schema is easy; the *status
  machine / dedup / audit / role* logic it enforced for free is the cost — now [`21`](./21-backend-api-build.md))
  and re-expressing the **17 flow definitions** as Durable Functions + a Graph intake ([`22`](./22-orchestration-migration.md)).

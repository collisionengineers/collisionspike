# Integrations & Gating

How the spike connects to external systems: EVA, the enrichment APIs (DVSA/DVLA), Box, and the document
parser. All non-trivial integrations are **feature-gated** so they can be toggled per environment with no
redeploy.

> **Platform note (LIVE = Azure PaaS).** The integration **domain** below — the EVA Sentry contract,
> DVSA/DVLA enrichment, the Box one-way mirror, the parser — is unchanged. The **mechanism** changed: the
> live system is the Azure stack ([live-environment.md](./live-environment.md)), **not** Power Platform.
> The **SPA (`cespk-spa-dev`, Static Web App)** calls the **TypeScript Data API (`cespk-api-dev`)** over
> **REST + Entra Bearer token**; the **Data API / orchestration (`cespk-orch-dev`)** call the **6 retained
> Python Functions** (parser, enrichment, evavalidation, evasentry, ocr, box-webhook) **directly** by
> function key / managed identity — there is **no Power Platform connector layer**. Feature gates that were
> **Dataverse environment variables** survive as **Function-App / API app-settings** the API + orchestration
> read. Where the text below still says "custom connector" / "Code App" / "Dataverse env-var", read it as
> **historical (the decommissioned Power Platform delivery vehicle)**; the Azure equivalent is called out.

## EVA (legacy case system — "Sentry" API)

- **Full scope (ADR-0005):** EVA integration is in scope, built/validated against the **EVA test
  environment** (it **exists**; credentials in Infisical). The base URL is the **same** for test/prod —
  **credentials** (test vs prod `Client_Id`/`Client_Secret`) route to the test or production server.
  `EVA_API_ENABLED` toggles the Sentry REST API vs the JSON drag-drop path. **Drag-drop is the active
  path for a vendor reason, not merely an "M1 fallback":** Minotaur Software's Sentry API currently
  supports **only ONE principal code** for API submissions — it cannot route different work-provider
  codes, so REST would force **every** case under a single work provider. Minotaur is patching this (no
  ETA); **EVA REST stays gated pending that patch + a parity test**. The **production** cutover is gated
  until prod is confirmed and a parity test passes. (Enrichment — DVSA/DVLA at intake, pre-EVA — is
  **separate** from EVA and is **live in Dev**, gate ON since 2026-06-21.)
- **Image submission:** likely **two requests** (confirm on test) — the 2 preview images, then the
  remaining images — matching the two-preview-then-full-sequence rule.
- **JSON contract:** 12 fields, exact order matching `Final Format Example 02.json`; inspection
  address is **6 newline-separated lines**; dates `DD/MM/YYYY`; `VAT Status` ∈ {"", Yes, No};
  `Mileage Unit` ∈ {"", Miles, Km}. `Work Provider` must be non-empty. `cedocumentmapper_v2.0`
  already produces this (schema-validated).
- **Sentry API (v1.2):** base `https://sentry.evasoftware.co.uk/api/`; JWT via `POST /Connect/token`
  (`expires_in` = 5 **minutes**); submit via `POST /Instruction/Inspection`; plus `/Claim/LocationUpdate`,
  `/Claim/AuthorityStatusUpdate`, `/Note/SubmitNote`, `/Claim/Update`, `/Report/SubmitReport`,
  `GET /Report/GetAvailableReports`, `GET /Report/GetReport`. Idempotency by payload hash. Authoritative
  reference: [eva-sentry-api.md](./eva-sentry-api.md) (from `raw/Sentry API Documentation 1.2 Amended.pdf`).

## Enrichment (DVSA / DVLA)

> **ADR-0006 chosen pattern:** a thin Azure Function REST wrapper. The wrapper authenticates **directly to
> DVSA + DVLA via Entra `client_credentials` + X-API-Key** (the Cloud Run OAuth gateway `ce-mcp-gateway` is
> **retired** — no gateway hop). **LIVE:** the Function `cespkenrich-fn-gi62sd` is deployed and verified;
> its DVSA/DVLA secrets are Key Vault references in `cespkenrichkvgi62sd`. In the Azure stack the
> **orchestration / Data API call this Function directly** (function key); the prior **Power Platform custom
> connector `cr1bd_dvsaenrich`** was only the Power-Automate delivery vehicle and is **decommissioned**.

Scope for the spike (per [intake-workflow.md](../requirements/intake-workflow.md)):

| Need | Connector / tool | Notes |
|---|---|---|
| Mileage estimate | DVSA MOT history API → `current_mileage_estimate` | **only when the instruction/parser has no mileage** (document authoritative, ADR-0006) |
| Vehicle details (make/model/year/tax) | DVLA/DVSA APIs → `get_vehicle_summary` | |
| Valuation evidence (M2, on-demand) | `valuationbot` → `search_comparables` + `capture_advert_pages` | staff-triggered (total-loss/disputed); PDF attached as Evidence, gated `VALUATION_ENABLED` |

**Integration options:**
- **A — REST wrapper (CHOSEN — ADR-0006):** Azure Function `cespkenrich-fn-gi62sd` authenticates
  **directly to DVSA + DVLA via Entra `client_credentials` + X-API-Key** and exposes plain REST
  (`POST /dvsa-mot/get-vehicle-summary`). **In the Azure stack the orchestration / Data API call it
  directly** (function key). *(Historical: it was also imported as the Power Platform custom connector
  `cr1bd_dvsaenrich` — now decommissioned.)* No gateway dependency.
- **B — OAuth gateway custom connector** *(not in M1 — retired fallback):* a custom connector that
  performs the `ce-mcp-gateway` OAuth2 + PKCE handshake and calls the Cloud Run MCP backends
  directly. Obviated by option A's direct Entra auth.
- **C — register Power Platform as a gateway OAuth client** and extend `CE_CONNECTORS`. *(not in M1)*

Gate the whole enrichment path with `ENRICHMENT_API_BASE` + `ENRICHMENT_ENABLED`.

## Frontend → API integration pattern (LIVE)

The SPA (`cespk-spa-dev`) is the **preserved React/Vite app** built from `mockup-app/`. It holds **no
secret and no SDK to any external system** — it signs in with **MSAL/Entra** and calls the **Data API
(`cespk-api-dev`)** over **REST + Bearer token** (`mockup-app/src/data/rest-client.ts`). The Data API (and
orchestration) then reach Postgres, the Python Functions, and external systems **server-side**, holding all
credentials in app-settings / Key Vault. So the **"no secret reaches the browser"** boundary is preserved —
now as a **server-side BFF boundary** rather than the browser CSP rule.

> **Historical (Power Platform):** the deployed **Code App player** ran under `Content-Security-Policy:
> connect-src 'none'`, so every external call had to go through a **Power Platform connector** (SDK) or a
> Power Automate HTTP action — never a raw `fetch()`. That constraint is **gone** in the Azure SPA, which
> `fetch()`es the Data API directly (a same-trust BFF, not an arbitrary external host).

## Document parser (`cedocumentmapper_v2.0`)

- **ADR-0004:** the parser engine is wrapped as an **Azure Function** (`cespike-parser-dev`,
  `POST /api/parse`; gated `PDF_MAPPER_ENABLED`). **LIVE:** the **Data API / orchestration call it
  directly** (function key) to pre-fill the 12 fields for staff review. *(Historical: the Code App reached
  it via the custom connector `cr1bd_ceparser` over the connector SDK — decommissioned.)* The vendored
  engine-core is unchanged (ADR-0018). **PyMuPDF AGPL concern resolved (licensed); no blocker.**
- The CLI remains available for offline/batch use.

## Address normalisation

- **Now:** **postcode.io** (free, UK-only) for postcode validation/normalisation.
- **Later (gated `AZURE_MAPS_ENABLED`):** Azure Maps Search if reverse geocoding / autocomplete /
  non-UK is needed (~$5 per 1,000 geocodes).

## Outbound chasers (channel-aware — ADR-0003)
Behind the global **outbound** kill switch; **human-sent** in the spike. **Email** chasers are
drafted (later sent via the Outlook connector). **WhatsApp is WhatsApp Business only and won't
change** → chasers are drafted for staff to send manually; **no free automated WhatsApp send**.
**Audatex** is **out of scope** (deferred entirely). Model: `Chaser` + `Note` in [data-model.md](./data-model.md).

## Box (Phase-7 additive intake pivot — ADR-0012)

> **Binding decision:** [docs/adr/0012-box-centric-intake-additive-hybrid.md](../adr/0012-box-centric-intake-additive-hybrid.md).
> **Status (2026-06-26):** the Box columns + gates live on the **Postgres** schema (`box_folder_id`,
> `box_file_request_id`, `box_synced_at`, etc.; see [data-model.md](./data-model.md)). The **`box-webhook`
> Function is retained and deployed** (`cespkbox-fn-v76a47`, 9 functions: `box_webhook`, `create_folder`,
> `copy_file_request`, `file_request_lifecycle`, `create_webhook`, `webhook_lifecycle`,
> `get_shared_link_file`, `get_shared_link_folder`, `list_folder`) but **gated OFF** (`BOX_API_ENABLED=false`)
> and **secret-free** (its Key Vault `cespkboxkvv76a47` holds no secrets yet). **Migrated off Dataverse
> (2026-06-27):** the Function was the **one** retained Function still writing to Dataverse + calling a Power
> Automate flow (`STATUS_EVALUATE_FLOW_URL`); its `dataverse_client.py` is **deleted** in favour of
> `data_api_client.py`, which mints a **managed-identity token** for the Data API audience (`DATA_API_URL` +
> `DATA_API_AUDIENCE` app-settings) and calls `/api/internal/*` — including the new
> `GET /api/internal/box/case-by-folder/{folderId}` — so **Postgres (via the Data API) is the system of
> record**. In the Azure stack the **orchestration calls the `box-webhook` Function directly** (function key
> / MI). The always-on
> BUSINESS-account integration (CCG token mint, `FILE.UPLOADED` webhook, template File Request) is the
> deferred long pole, operator-blocked on CCG authorization + a Box Business plan. *(Historical: the
> Power Platform delivery used a custom `cr1bd_box_rest` connector + offline Box flows — decommissioned with
> the rest of the PP layer.)* Phase docs: [docs/plans/phase-7-box-integration/](../plans/phase-7-box-integration/).

Box is an **additive, one-way archival + intake mirror** — **the system of record (Postgres) is
authoritative; Box is written one-way (system of record → Box)**. Box Metadata has no joins, so dedup (ADR-0010), the status machine,
and Case/PO sequencing **never** run off Box. The pivot brings Box **earlier** (a per-Case/PO folder at
**parse-confirm**, not only at EVA-submit) and **deeper** (File-Request image chasers + webhook-driven
intake). It does not replace the M1 `finalize-eva-box` archival; it precedes and augments it.

**Verified platform constraints (the binding pillars).**
- **All Box automation runs through the `box-webhook` Azure Function over Box REST with a service
  identity.** The first-party Box connector is file-only (no folder-create, no shared-links, no webhooks,
  no File Requests, no metadata) and OAuth-only, so it cannot drive the pivot. *(Historical: under Power
  Platform this Function was fronted by a mandatory custom connector `cr1bd_box_rest` because connectors
  can't run the client-credentials grant; in the Azure stack the orchestration calls the Function directly,
  so the connector is gone — but the Function-side pillars below are unchanged.)*
- **The CCG service token is minted inside the Azure Function.** The Box **CCG** token
  (`POST /oauth2/token`, `grant_type=client_credentials`, `box_subject_type=enterprise`, App Access Only,
  scopes `root_readwrite` + `manage_webhook`) is exchanged **inside `functions/box-webhook/`** from the Key
  Vault secret `box-client-secret` — the proven EVA-Sentry / parser facade. No Box client secret ever
  leaves the Function / Key Vault.
- **File Request is copy-from-template only** — no create-from-scratch API. Hand-build **one** template
  File Request once; per case `POST /file_requests/{templateId}/copy` onto the Case/PO folder. Any
  capture-form field is baked into the template.
- **Webhooks are best-effort** — no SLA, at-least-once, droppable, and `FILE.UPLOADED` **also fires on
  moves**. The receiver verifies `BOX-SIGNATURE-PRIMARY`/`SECONDARY` HMAC-SHA256 (dual-key, 10-min replay)
  and disambiguates upload-vs-move. It **processes the persistence — via the Data API → Postgres — on the
  request path** and returns **200 only when settled**, or a **non-2xx (503) on a transient failure so Box
  retries** (Box does **not** retry after a 2xx) — it is **not** "respond 202 then a background fan-out".
  Durable dedup is the **Evidence-existence check on the `box:file:<id>` tag in `source_message_id`** (the
  evidence route dedups Box rows on this; not `box_file_id`, which is a correlation/UI mirror the webhook
  also writes); on accept it stamps `box_file_id` + `accepted_for_eva=true`. A timed `ListFolder`
  reconciliation sweep is **documented but not yet built**
  — a deferred secondary backstop; the primary recovery is **Box's own retry on the non-2xx**.
- **The SPA never calls Box directly** — Box ops go through the **Data API → `box-webhook` Function**
  (server-side, holding the service identity). **Evidence is linked, not embedded:** a **server-minted
  "Open in Box" deep link**. No iframe is built; `BOX_EMBED_ENABLED` stays **reserved/off**. *(Historical:
  under `connect-src 'none'` the Code App invoked the Box connector op directly — see the File-Request
  chaser note below.)*

**Box access is server-side, via the `box-webhook` Function.** Folder-create, File-Request copy,
shared-link, and webhook-lifecycle ops are all CCG-authenticated calls made **inside the Function**; byte
upload to a Case/PO folder (`finalize`) likewise goes through the Function / Box REST. *(Historical: under
Power Platform two Box connections coexisted — a custom `cr1bd_box_rest` for the metadata ops and the
first-party `cr1bd_box` for the byte `CreateFile` path; both are decommissioned.)*

**Box operations** (orchestration activities; folder/sequence behaviour unchanged from ADR-0012):
the folder-create op mints the **UPPERCASE** Case/PO folder at parse-confirm (e.g. EVA `test26001` → Box
`TEST26001`) and stamps `box_folder_id`; the **finalize** step **augments** the pre-existing folder (reads
`BOX_FOLDER_ROOT_ID`) and stamps `box_synced_at` at `box_synced`; a blob-purge step deletes only
**archived (accepted, non-excluded) image** Blob evidence once `box_synced` + grace (non-image transient
bytes are retained — a deferred follow-up).

**File-Request chaser = SPA → Data API → Function.** The SPA asks the Data API to run the File-Request
copy / shared-link op (`CopyFileRequest` / `GetFolderSharedLink`) server-side via the `box-webhook`
Function; that path also persists `box_file_request_id` / `_url` on the case. *(Historical: under
`connect-src 'none'` the Code App invoked the Box REST connector op directly because it couldn't POST to a
flow URL — the 2026-06-21 build-plan decision; superseded by the BFF.)*

**Plan floor = base Box Business** (~$15/user/mo). Base Business covers per-Case/PO folders, File Requests,
webhooks **and CCG** — the whole live intake path. **Metadata (the Business Plus tier, ~$25-33/user/mo) is
OUT OF SCOPE now** — a later optional reliability upgrade for the orphaned image-only path only
(`BOX_METADATA_ENABLED`, reserved). Box Governance retention + Box AI (metered AI Units; Business/Business
Plus include zero) are deferred Phase-C decisions.

**M1 finalization (unchanged baseline, for reference):** the M1 `finalize-eva-box` step still fires in
unison with EVA submission (drag-drop JSON export *or* API submit), copying evidence (images, `.eml`, PDFs,
EVA JSON) into the Case/PO folder in EVA photo order. The Phase-7 pivot moves the folder *creation* earlier
(parse-confirm) so finalize augments rather than creates. The full M1 archival design is
[docs/plans/phase-3-enrichment-and-eva/box-archival-pipeline.md](../plans/phase-3-enrichment-and-eva/box-archival-pipeline.md)
(reconciled DOWN to ADR-0012).

## Feature flags — summary

> These were **Dataverse environment variables**; in the Azure stack they are **Function-App / API
> app-settings** the Data API + orchestration read (the gate semantics and defaults are unchanged). The
> migration mapping of all 28 gates is in
> [`migration/10-settings-migration.md`](../../migration/10-settings-migration.md).

| Variable | Default | Purpose |
|---|---|---|
| `EVA_API_ENABLED` | `false` | JSON export vs Sentry REST submit (stays OFF — REST blocked by Minotaur's one-principal-code limit, pending vendor patch + parity) |
| `EVA_BASE_URL` | prod base | Single EVA base URL (same for test/prod) |
| `EVA_CLIENT_ID` / `EVA_CLIENT_SECRET` | test creds | EVA credentials (secret); **test creds route to the test server** |
| `PDF_MAPPER_ENABLED` | `false` | inline `cedocumentmapper_v2.0` call |
| `ENRICHMENT_ENABLED` / `ENRICHMENT_API_BASE` | `false` / — | DVSA/valuation enrichment |
| `AZURE_MAPS_ENABLED` | `false` | Azure Maps vs postcode.io |
| `VALUATION_ENABLED` | `false` | on-demand valuationbot valuation (M2) |
| `COPILOT_ENABLED` | `false` | expose the Copilot Studio agent |
| `BOX_API_ENABLED` | `false` | **Phase 7** — the unlock: the custom Box REST connector + webhook receiver |
| `BOX_FOLDER_AT_INTAKE_ENABLED` | `false` | **Phase 7 B1** — mint the Case/PO folder at parse-confirm |
| `BOX_FILEREQUEST_ENABLED` | `false` | **Phase 7 B2/B3** — File-Request image chaser + webhook intake |
| `BOX_EMBED_ENABLED` | `false` | **Phase 7 B4 — RESERVED** (link-not-embed; flipping also needs the operator `frame-src` edit) |
| `BOX_METADATA_ENABLED` | `false` | **Phase 7 Wave-2/Phase-C** — Box Metadata-Query (Business Plus; out of scope now) |
| `BOX_FOLDER_ROOT_ID` / `BOX_FILE_REQUEST_TEMPLATE_ID` | `""` | **Phase 7** per-environment config (archive root id · template File-Request id; set at activation) |

> Box secrets are **not** Dataverse env-vars: the Box CCG `client_secret` + the webhook primary/secondary
> signature keys live in **Key Vault** under the **hyphenated** secret names `box-client-secret`,
> `box-webhook-primary-key`, `box-webhook-secondary-key` (which resolve into the `BOX_CLIENT_SECRET` /
> `BOX_WEBHOOK_PRIMARY_KEY` / `BOX_WEBHOOK_SECONDARY_KEY` app settings), read by the `box-webhook` Function
> — never on a connection. `BOX_AI_ENABLED` is deliberately omitted (deferred to Phase C); this Box set is
> not the complete Box feature set.

## API intake channel (deferred research)

> **Status:** not in any current phase — deferred pending operator scoping. See ROADMAP "Later".

An additive intake channel that lets providers/principals POST work directly to an HTTP API endpoint rather than via email. The pattern fits the existing Azure Function stack (parser, enrichment, `box-webhook`): a new Function accepts an authenticated POST, validates the payload, and creates a Dataverse Case directly.

Open questions before a phase plan can be authored:
- **Auth model** — API key (Function host key) vs Entra `client_credentials` per provider (preferred for audit trail).
- **Payload contract** — likely the same 12-field EVA JSON + image multipart, but needs confirming with providers.
- **Idempotency** — a provider-supplied reference ID to feed the ADR-0010 dedup ladder.
- **Provider onboarding** — key issuance / Entra app-registration per provider; operational support burden.

This would be feature-gated (`API_INTAKE_ENABLED`, default `false`) and additive — email intake (Phase 1/2) and Box webhook intake (Phase 7) remain unchanged.

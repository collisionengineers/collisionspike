# Integrations & Gating

How the spike connects to external systems: EVA, the `collisionplugin` enrichment connectors,
Box, and the document parser. All non-trivial integrations are **feature-gated with Dataverse
environment variables** so they can be toggled per environment with no redeploy.

## EVA (legacy case system — "Sentry" API)

- **Full scope (ADR-0005):** EVA integration is in scope, built/validated against the **EVA test
  environment** now. The base URL is the **same** for test/prod — **credentials** (test vs prod
  `Client_Id`/`Client_Secret`) route to the test or production server. `EVA_API_ENABLED` toggles the
  Sentry REST API vs the JSON drag-drop path (drag-drop = M1 path + permanent fallback). The
  **production** cutover is gated until prod is confirmed and a parity test passes.
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

## Enrichment connectors

> **ADR-0006 chosen pattern:** thin Azure Function REST wrapper → Power Platform custom connector.
> **Update 2026-06:** the wrapper authenticates **directly to DVSA + DVLA via Entra
> `client_credentials` + X-API-Key**. The Cloud Run OAuth gateway (`ce-mcp-gateway`) is **retired
> for M1** — there is no gateway hop in the current implementation.

Scope for the spike (per [intake-workflow.md](../requirements/intake-workflow.md)):

| Need | Connector / tool | Notes |
|---|---|---|
| Mileage estimate | DVSA MOT history API → `current_mileage_estimate` | **only when the instruction/parser has no mileage** (document authoritative, ADR-0006) |
| Vehicle details (make/model/year/tax) | DVLA/DVSA APIs → `get_vehicle_summary` | |
| Valuation evidence (M2, on-demand) | `valuationbot` → `search_comparables` + `capture_advert_pages` | staff-triggered (total-loss/disputed); PDF attached as Evidence, gated `VALUATION_ENABLED` |

**Integration options:**
- **A — REST wrapper (CHOSEN — ADR-0006; M1 implementation):** Azure Function `cespkenrich-fn-gi62sd`
  authenticates **directly to DVSA + DVLA via Entra `client_credentials` + X-API-Key** and exposes
  plain REST (`POST /dvsa-mot/get-vehicle-summary`) → imported as Power Platform custom connector
  (connection reference `cr1bd_dvsaenrich`). Simplest for Power Platform; no gateway dependency.
- **B — OAuth gateway custom connector** *(not in M1 — retired fallback):* a custom connector that
  performs the `ce-mcp-gateway` OAuth2 + PKCE handshake and calls the Cloud Run MCP backends
  directly. Obviated by option A's direct Entra auth.
- **C — register Power Platform as a gateway OAuth client** and extend `CE_CONNECTORS`. *(not in M1)*

Gate the whole enrichment path with `ENRICHMENT_API_BASE` + `ENRICHMENT_ENABLED`.

## Code App integration pattern

> **CSP callout:** the deployed Code App player runs with `Content-Security-Policy: connect-src
> 'none'`. All external calls from the Code App **must go through Power Platform connectors** (SDK)
> or Power Automate HTTP actions — **never a raw `fetch()`**. This is why a deployed manual-intake
> parse that calls an external URL directly will fail; the fix is to call via the CE Parser connector
> (`cr1bd_ceparser`).

## Document parser (`cedocumentmapper_v2.0`)

- **M1 (ADR-0004):** wrapped as an **Azure Function** → custom connector `cr1bd_ceparser` (gated
  `PDF_MAPPER_ENABLED`) that the Code App calls **via the connector SDK** (not raw fetch — CSP blocks
  external calls) to pre-fill the 12 fields (staff review). **PyMuPDF AGPL concern resolved
  (licensed); no blocker.**
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
> **Status (2026-06-22):** the Phase-7 Box **Dataverse schema + env-vars ARE applied live** (all `BOX_*`
> gates OFF). The **`box-webhook` Function IS deployed** (`cespkbox-fn-v76a47`, FC1; 9 functions:
> `box_webhook`, `create_folder`, `copy_file_request`, `file_request_lifecycle`, `create_webhook`,
> `webhook_lifecycle`, `get_shared_link_file`, `get_shared_link_folder`, `list_folder`) and **Gate-C
> verified** on the live host (no-key → 401; unsigned → 400; facade gated-off → 503) — but it is **gated
> OFF** (`BOX_API_ENABLED=false`) and **secret-free** (its Key Vault `cespkboxkvv76a47` holds no secrets
> yet). Still pending: the `cr1bd_box_rest` connector is **not imported/bound**, the Box flows remain
> **authored offline (`state=off`)**, no Box connection is bound, the KV secrets are unset, and no `BOX_*`
> gate is flipped. The always-on BUSINESS-account integration (CCG token mint, `FILE.UPLOADED` webhook,
> template File Request) is the deferred long pole, operator-blocked on CCG authorization. Phase docs:
> [docs/plans/phase-7-box-integration/](../plans/phase-7-box-integration/).

Box is an **additive, one-way archival + intake mirror** — **Dataverse stays the system of record; Box is
written one-way (Dataverse → Box)**. Box Metadata has no joins, so dedup (ADR-0010), the status machine,
and Case/PO sequencing **never** run off Box. The pivot brings Box **earlier** (a per-Case/PO folder at
**parse-confirm**, not only at EVA-submit) and **deeper** (File-Request image chasers + webhook-driven
intake). It does not replace the M1 `finalize-eva-box` archival; it precedes and augments it.

**Verified platform constraints (the binding pillars).**
- **A custom Power Platform connector is mandatory.** The first-party Box connector is file-only (no
  folder-create, no shared-links, no webhooks, no File Requests, no metadata) and OAuth-only. All Box
  automation runs through a **custom connector over Box REST** with a service identity.
- **The CCG service token is minted inside the Azure Function, never the connector.** Custom connectors
  cannot run the OAuth2 client-credentials grant (Microsoft Learn). So the connector authenticates by an
  **API-key (an Azure Function host key) on the connection** (declared as `connectionParameters.api_key`),
  and the Box **CCG** token (`POST /oauth2/token`, `grant_type=client_credentials`,
  `box_subject_type=enterprise`, App Access Only, scopes `root_readwrite` + `manage_webhook`) is exchanged
  **inside `functions/box-webhook/`** from the Key Vault secret `box-client-secret` — the proven EVA-Sentry
  / parser facade.
- **File Request is copy-from-template only** — no create-from-scratch API. Hand-build **one** template
  File Request once; per case `POST /file_requests/{templateId}/copy` onto the Case/PO folder. Any
  capture-form field is baked into the template.
- **Webhooks are best-effort** — no SLA, at-least-once, droppable, and `FILE.UPLOADED` **also fires on
  moves**. The receiver verifies `BOX-SIGNATURE-PRIMARY`/`SECONDARY` HMAC-SHA256 (dual-key, 10-min replay)
  and disambiguates upload-vs-move. It **processes the Dataverse fan-out on the request path** and returns
  **200 only when settled**, or a **non-2xx (503) on a transient failure so Box retries** (Box does **not**
  retry after a 2xx) — it is **not** "respond 202 then a background fan-out". Durable dedup is the
  **Evidence-existence check on the `box:file:<id>` tag in `cr1bd_sourcemessageid`** (not `cr1bd_boxfileid`,
  which is a correlation/UI mirror the webhook also writes); on accept it stamps `cr1bd_boxfileid` +
  `cr1bd_acceptedforeva=true`. A timed `ListFolder` reconciliation sweep is **documented but not yet built**
  — a deferred secondary backstop; the primary recovery is **Box's own retry on the non-2xx**.
- **The Code App calls Box only via the connector** (`connect-src 'none'` — it invokes the connector op
  directly, no flow in the path; see the File-Request chaser note below). **Evidence is linked,
  not embedded:** a **server-minted "Open in Box" deep link** (no CSP change). No iframe is built and no
  `frame-src` edit is made; `BOX_EMBED_ENABLED` stays **reserved/off**.

**The connection-reference identity is PINNED** (a parallel ref, not an in-place repoint): a custom
**`cr1bd_box_rest`** (Premium, CCG via the `box-webhook` Function) carries folder-create + File-Request
copy + shared-link + webhook lifecycle, while first-party **`cr1bd_box` (`shared_box`, Standard, interactive
OAuth) is RETAINED** for `finalize-eva-box`'s byte path (`CreateFile`). Two Box connections coexist by
design; the operator binds both at activation.

**Box flows** (authored `state=off`, lint-green; detail in [flows/README.md](../../flows/README.md)):
`box-folder-create` mints the **UPPERCASE** Case/PO folder at parse-confirm (e.g. EVA `test26001` → Box
`TEST26001`) and stamps `cr1bd_boxfolderid`; `finalize-eva-box` now **augments** the pre-existing folder
(keeps the S2 real-bytes `CreateFile` path; reads `cr1bd_BOX_FOLDER_ROOT_ID`) and stamps `cr1bd_boxsyncedat`
at `box_synced`; `box-blob-purge` deletes only **archived (accepted, non-excluded) image** Blob evidence
once `box_synced` + grace (non-image transient bytes are retained — a deferred follow-up).

**File-Request chaser = direct connector, no flow in the path.** Because the Code App runs under
`connect-src 'none'` and cannot POST to a flow Request URL, the Code App calls the Box REST connector op
**directly** (`CopyFileRequest` / `GetFolderSharedLink`) — the pinned 2026-06-21 build-plan decision; at
activation that direct transport also persists `cr1bd_boxfilerequestid`/`url` on the case.
`box-file-request-copy.definition.json` (guarding `empty(folderId) → folder_not_ready`) is an authored
**standby child flow for future operator activation**, **not** currently invoked by the Code App.

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

## Environment variables (feature flags) — summary

| Variable | Default | Purpose |
|---|---|---|
| `EVA_API_ENABLED` | `false` | JSON export vs Sentry REST submit |
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

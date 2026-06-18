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

## Box archival

- **Occurs in unison with EVA submission** (drag-drop JSON export *or* API submit) — one finalisation
  step, **in M1**. Folder named with the **UPPERCASE** Case/PO (EVA uses lowercase): e.g. EVA
  `test26001` → Box `TEST26001`. Copy evidence (images, `.eml`, PDFs, EVA JSON) into the folder.
  Box connector via Power Automate.

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

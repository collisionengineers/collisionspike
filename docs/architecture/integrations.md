# Integrations & Gating

How the spike connects to external systems: EVA, the `collisionplugin` enrichment connectors,
Box, and the document parser. All non-trivial integrations are **feature-gated with Dataverse
environment variables** so they can be toggled per environment with no redeploy.

## EVA (legacy case system — "Sentry" API)

- **Full scope (ADR-0005):** EVA integration is in scope, built/validated against the **EVA test
  environment** now. `EVA_BASE_URL` selects EVA **test** vs **production**; `EVA_API_ENABLED` toggles
  the Sentry REST API vs the JSON drag-drop path (drag-drop is the M1 path + permanent fallback). The
  **production** cutover is gated until EVA prod is confirmed and a parity test passes.
- **JSON contract:** 13 fields, exact order matching `Final Format Example 02.json`; inspection
  address is **6 newline-separated lines**; dates `DD/MM/YYYY`; `VAT Status` ∈ {"", Yes, No};
  `Mileage Unit` ∈ {"", Miles, Km}. `Work Provider` must be non-empty. `cedocumentmapper_v2.0`
  already produces this (schema-validated).
- **Sentry API (v1.2):** base `https://sentry.evasoftware.co.uk/api/`; JWT via `POST /Connect/token`
  (`expires_in` = 5 **minutes**); submit via `POST /Instruction/Inspection`; plus `/Claim/LocationUpdate`,
  `/Claim/AuthorityStatusUpdate`, `/Note/SubmitNote`, `/Claim/Update`, `/Report/SubmitReport`,
  `GET /Report/GetAvailableReports`, `GET /Report/GetReport`. Idempotency by payload hash. Authoritative
  reference: [eva-sentry-api.md](./eva-sentry-api.md) (from `raw/Sentry API Documentation 1.2 Amended.pdf`).

## Enrichment connectors (`collisionplugin`)

The connectors are **MCP servers on Cloud Run (`europe-west2`, project `collisioncc-b7be2`),
private behind Cloud Run IAM and an OAuth gateway (`ce-mcp-gateway`)**. They are **not directly
callable** from Power Platform (no REST surface; 403 unauthenticated).

Scope for the spike (per [intake-workflow.md](../requirements/intake-workflow.md)):

| Need | Connector / tool | Notes |
|---|---|---|
| Mileage estimate | `dvsa-mot` → `current_mileage_estimate(registration)` | from MOT history |
| Vehicle details (make/model/year/tax) | `dvsa-mot` → `get_vehicle_summary(registration)` | DVLA/DVSA |
| Valuation evidence (later) | `valuationbot` → `search_comparables` + `capture_advert_pages` | PDF evidence |

**Integration options (pick one):**
- **A — REST wrapper (CHOSEN — ADR-0006; DVSA in M1):** a thin Azure Function / Container App that authenticates to
  the private Cloud Run backends (service identity) and exposes plain REST (`POST
  /dvsa-mot/get-vehicle-summary`) → import as a Power Platform **custom connector**. Simplest for
  Power Platform; isolates the MCP/OAuth detail.
- **B — OAuth gateway custom connector:** custom connector that performs the `ce-mcp-gateway`
  OAuth2 + PKCE handshake and calls `${CE_PUBLIC_URL}/dvsa-mot/mcp`. No new infra, but Power
  Platform must speak MCP/streamable-HTTP.
- **C — register Power Platform as a gateway OAuth client** and extend `CE_CONNECTORS`.

Gate the whole enrichment path with `ENRICHMENT_API_BASE` + `ENRICHMENT_ENABLED`.

## Document parser (`cedocumentmapper_v2.0`)

- **M1 (ADR-0004):** wrapped as an **Azure Function** → custom connector (gated `PDF_MAPPER_ENABLED`)
  that the Code App calls inline on the instruction to pre-fill the 13 fields (staff review). Resolve
  the **PyMuPDF AGPL** risk as part of M1.
- The CLI remains available for offline/batch use.

## Address normalisation

- **Now:** **postcode.io** (free, UK-only) for postcode validation/normalisation.
- **Later (gated `AZURE_MAPS_ENABLED`):** Azure Maps Search if reverse geocoding / autocomplete /
  non-UK is needed (~$5 per 1,000 geocodes).

## Outbound chasers (channel-aware — ADR-0003)
Behind the global **outbound** kill switch; **human-sent** in the spike. **Email** chasers are
drafted (later sent via the Outlook connector). **WhatsApp is WhatsApp Business only and won't
change** → chasers are drafted for staff to send manually; **no free automated WhatsApp send**.
**Audatex** is await-only. Model: `Chaser` + `Note` in [data-model.md](./data-model.md).

## Box archival

- Folder per **Case/PO**; copy evidence (images, `.eml`, PDFs, EVA JSON) on finalisation. Standard
  Box connector via Power Automate. Stub/defer to align with `collisioncc`.

## Environment variables (feature flags) — summary

| Variable | Default | Purpose |
|---|---|---|
| `EVA_API_ENABLED` | `false` | JSON export vs Sentry REST submit |
| `EVA_BASE_URL` | EVA **test** | EVA test vs production base URL (test env available now) |
| `PDF_MAPPER_ENABLED` | `false` | inline `cedocumentmapper_v2.0` call |
| `ENRICHMENT_ENABLED` / `ENRICHMENT_API_BASE` | `false` / — | DVSA/valuation enrichment |
| `AZURE_MAPS_ENABLED` | `false` | Azure Maps vs postcode.io |
| `COPILOT_ENABLED` | `false` | expose the Copilot Studio agent |

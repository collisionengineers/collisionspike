# Enrichment connectors via a REST wrapper; DVSA mileage + vehicle details in M1

**Status:** Accepted (2026-06-17).

> **Update 2026-06: gateway retired for M1.** The chosen pattern (thin REST wrapper Azure Function →
> custom connector) stands; the implementation calls **DVSA + DVLA directly via Entra
> `client_credentials` + X-API-Key** — there is no Cloud Run OAuth-gateway hop (option B1
> obviated). See `functions/enrichment/README.md` + `docs/architecture/live-environment.md`.

The `collisionplugin` enrichment services (DVSA `dvsa-mot`, `valuationbot`) are **MCP-only**, private
behind the `ce-mcp-gateway` OAuth gateway on Cloud Run, so Power Platform cannot call them directly.
We reach them via a thin **REST wrapper (Azure Function)** that authenticates to the private backends
and exposes plain REST to a Power Platform custom connector — chosen over an OAuth-gateway custom
connector (which would make Power Platform speak MCP/streamable-HTTP) and over registering Power
Platform as a gateway OAuth client. **DVSA enrichment is pulled into M1**: `current_mileage_estimate`
(fills the EVA mileage field **only when the instruction/parser does not provide mileage — the
document is authoritative**) and `get_vehicle_summary` (suggests make/model), gated
`ENRICHMENT_ENABLED` and staff-reviewed. Valuation enrichment (`valuationbot`) follows in M3. Same
Azure-Function wrapper pattern as the parser (ADR-0004).

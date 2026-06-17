# Enrichment connectors via a REST wrapper; DVSA mileage + vehicle details in M1

The `collisionplugin` enrichment services (DVSA `dvsa-mot`, `valuationbot`) are **MCP-only**, private
behind the `ce-mcp-gateway` OAuth gateway on Cloud Run, so Power Platform cannot call them directly.
We reach them via a thin **REST wrapper (Azure Function)** that authenticates to the private backends
and exposes plain REST to a Power Platform custom connector — chosen over an OAuth-gateway custom
connector (which would make Power Platform speak MCP/streamable-HTTP) and over registering Power
Platform as a gateway OAuth client. **DVSA enrichment is pulled into M1**: `current_mileage_estimate`
(fills the EVA mileage field when missing) and `get_vehicle_summary` (suggests make/model), gated
`ENRICHMENT_ENABLED` and staff-reviewed. Valuation enrichment (`valuationbot`) follows in M3. Same
Azure-Function wrapper pattern as the parser (ADR-0004).

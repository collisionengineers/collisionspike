# DVSA enrichment wrapper (`Func_DvsaEnrich`)

A thin Azure Function (Python v2) that exposes plain REST over the private
`collisionplugin` **`dvsa-mot`** connector, which sits behind the `ce-mcp-gateway`
OAuth2 gateway. It suggests vehicle make/model and (conditionally) a current
mileage estimate for a Case during intake. Enrichment is **advisory and
staff-reviewed** — it never blocks intake. Plan reference: phase-1 §5.6.

## Boundary tags

| Activity | Tag |
|---|---|
| Function **code** (`function_app.py`, `gateway_client.py`), `infra/main.bicep`, `openapi/enrichment-connector.json` | **[BUILD]** — authored offline, verified by local `pytest`. Zero tenant/Azure contact. |
| Deploy the Function + Key Vault + import the custom connector | **[DEPLOY-WITH-LOGIN]** |
| Inject the real gateway `client_id` / `client_secret` **values** into Key Vault | **[RESERVED-FOR-USER]** |

This directory contains **no secret values** — only Key Vault *references* and
fake test fixtures.

## Endpoint

```
POST /api/dvsa-mot/enrich
Body: { "vrm": "TE57VRM", "reference"?: "CCPY26050", "document_has_mileage"?: false }
```

Always returns **HTTP 200** with a `warnings[]` array (advisory; never blocks):

```json
{
  "vehicle_model": "FOCUS",
  "make": "FORD",
  "current_mileage": 62400,
  "mileage_unit": "Miles",
  "mileage_confidence": "MEDIUM",
  "warnings": []
}
```

`vehicle_model` maps to the settled 13-field EVA contract
(`contracts/eva-payload.schema.json`); `vrm` is Case-identity and is **not** part
of the EVA payload. Suggestions are written to empty Case fields with
`dvla_dvsa` provenance and reviewed by staff before EVA submission.

## The gateway seam (`gateway_client.py`)

```
Function ──client-credentials──▶ ce-mcp-gateway  POST /token
   (client_id/secret from Key Vault refs, form-encoded)
                                        │  Bearer JWT (~3600s)
   tools/call (JSON-RPC 2.0) ──────────▶ {base}/dvsa-mot/mcp
        get_vehicle_summary            ─▶ structuredContent → cleaned shape
        current_mileage_estimate (guarded)
```

- **Auth shape targeted:** OAuth2 **client-credentials** (RFC 6749 §4.4),
  `application/x-www-form-urlencoded` (the gateway's base64 secret can contain
  `+`, which a raw body would corrupt). The token is cached in-process with a TTL
  (expiry minus a 60s skew). On a tool-call **401** the client refreshes the
  token **exactly once**, retries, then fails soft.
- **Tool calls:** JSON-RPC `tools/call` to `{ENRICHMENT_API_BASE}/dvsa-mot/mcp`;
  the result is read from `result.structuredContent`.
- **Assumption (gateway model):** the as-built `ce-mcp-gateway`
  (`collisionplugin/connectors/mcp-gateway`) implements `authorization_code +
  PKCE` and `refresh_token` for Cowork. This server-to-server wrapper targets the
  **REST-wrapper-over-OAuth-gateway** pattern (integrations.md Option A / ADR-0006)
  and assumes a `client_credentials` token endpoint is exposed for service
  identities (or the gateway is extended per Option C). Swapping the grant is a
  one-method change in `gateway_client._fetch_token`.

## Mileage-guard logic (ADR-0006 — document authoritative)

`current_mileage_estimate` is called **only when `document_has_mileage` is
`false`**. If the parsed instruction already carries a mileage, the MOT estimate
is skipped (and a warning records why) — the document wins, and DVSA quota is not
spent. The request default is `document_has_mileage = true` (safer: do not
override an authoritative document unless told the field is empty). MOT odometer
history is normalised to miles, so `mileage_unit` is always `"Miles"`.

## Secret handling — Key Vault only

`GATEWAY_CLIENT_ID` / `GATEWAY_CLIENT_SECRET` are app settings whose **values are
Key Vault references** (`@Microsoft.KeyVault(SecretUri=...)`), resolved by the
platform via the Function's system-assigned managed identity (granted *Key Vault
Secrets User* in `infra/main.bicep`). The secret is read only inside
`GatewayClient`, sent only in the token request body, and is **never** logged,
echoed in a response, or written to a fixture. `GatewayConfig.__repr__` redacts
both credentials. The token exchange happens at runtime; tests mock it.

## Offline test command

No `func start` / Core Tools needed — handlers are exercised directly with a
fake `HttpRequest`, and all HTTP is mocked with `respx`:

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt   # Windows
python -m pytest -q
```

Tests assert: the mileage path fires **only** when `document_has_mileage` is
false; vehicle summary maps make/model correctly; a 401 refreshes once then
soft-fails with a warning (no exception bubbles); and the secret never appears in
logs or output.

## Files

| File | Purpose |
|---|---|
| `function_app.py` | HTTP trigger + orchestration + field cleaning + mileage guard |
| `gateway_client.py` | OAuth token exchange + MCP `tools/call` seam (lazy, mockable) |
| `host.json` | Functions host config (extension bundle, App Insights) |
| `requirements.txt` / `requirements-dev.txt` | runtime / test deps |
| `local.settings.json.TEMPLATE` | setting **names** only; secrets as KV refs |
| `infra/main.bicep` | Flex Consumption Function + Storage + Key Vault + RBAC |
| `openapi/enrichment-connector.json` | custom-connector OpenAPI 2.0 |
| `tests/` + `tests/fixtures/` | pytest + recorded **fake** gateway responses |

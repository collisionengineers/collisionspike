# EVA Sentry REST submission wrapper (`Func_EvaSentry`)

A thin Azure Function (Python v2) that submits a finalised Case to **EVA "Sentry"
REST v1.2** (`POST /Instruction/Inspection`). It is the **server-side home of the
EVA token lifecycle**: it mints/caches the short-lived `/Connect/token` JWT and
attaches `Authorization: Bearer` to the submission. The `cr1bd_evasentry` custom
connector (function-key auth) fronts it; `finalize-eva-box.definition.json` calls
operation `InstructionInspection`, **gated by the `EVA_API_ENABLED` Dataverse
env-var**. Plan reference: phase-2 §7 (M2.C). Skill: `eva-sentry-api`.

## Why the token lives in the Function, not the connector (decisive)

Microsoft Learn (verified 2026-06-18):

- *"Currently, client credentials grant type is not supported by custom
  connectors."* (connection-parameters)
- *"Custom connectors use the authorization code flow. The implicit and client
  credentials flows don't issue refresh tokens…"* (verify-oauth-configuration)

EVA's `POST /Connect/token` is a `Client_Id`/`Client_Secret` body exchange that
returns a **5-minute** JWT (a client-credentials-style flow with **no**
authorization-code / refresh-token story). A Power Platform custom connector
therefore **cannot** perform EVA auth at the connector layer. The token is minted,
cached (TTL = `expires_in` minutes − 30s buffer), and attached **inside this
Function**; the connector OpenAPI has **no OAuth security definition** — it is
`x-functions-key` only. This matches the repo's existing `cr1bd_evasentry`
connection note (*"Token exchange + bearer live INSIDE the connector"*).

```
Function ──Client_Id/Client_Secret (form-encoded, KV refs)──▶ {EVA_BASE_URL}Connect/token
                                        │  Bearer JWT (~5 min, cached w/ 30s skew)
   POST ────────────────────────────▶ {EVA_BASE_URL}Instruction/Inspection
        Authorization: Bearer ...        Body: 12-field core (+ ordered Impact Images)
                                        │  EVA instruction acknowledgement
```

## Boundary tags

| Activity | Tag |
|---|---|
| Function **code** (`function_app.py`, `eva_client.py`, `payload.py`), `infra/main.bicep`, `openapi/evasentry-connector.json` | **[BUILD]** — authored offline, verified by local `pytest`. Zero tenant/Azure/EVA contact. |
| Deploy the Function + Key Vault + import the custom connector + set `EVA_BASE_URL` | **[DEPLOY-WITH-LOGIN]** |
| Inject the real EVA **test** `Client_Id`/`Client_Secret` into Key Vault; bind `cr1bd_evasentry`; **flip `EVA_API_ENABLED=true` (test only)**; the EVA **production** cutover | **[RESERVED-FOR-USER]** |

This directory contains **no secret values** — only Key Vault *references* and
fake test fixtures. `EVA_API_ENABLED` defaults **false** everywhere (the drag-drop
JSON export is the M1 path **and the permanent fallback**).

## Endpoint

```
POST /api/eva/instruction-inspection
Body: {
  "evaPayload12": "<the 12-field core, as the canonical JSON string>",  // or an object
  "payloadHash"?: "deadbeef",          // idempotency correlation (flow latch is primary)
  "casePo"?: "test26001",              // lowercase Case/PO
  "images"?: [ { "sequenceIndex": 0, "content": "<base64>", "role": "overview" }, ... ]
}
```

Returns **HTTP 200** on a clean submit (or a soft EVA/auth failure), **400** only
on a malformed/invalid payload (which never contacts EVA):

```json
{ "submitted": true, "evaRef": "TEST26001-EVA", "transport": "sentry_rest", "warnings": [] }
```

A soft EVA/auth failure returns `{ "submitted": false, ... "warnings": [...] }` so
the flow can fall back to the drag-drop path without the connector action erroring.

## The modules

### `eva_client.py`
- **Auth:** `POST {EVA_BASE_URL}Connect/token`, `application/x-www-form-urlencoded`,
  body `Client_Id`+`Client_Secret` (note the EVA casing). Response
  `{ access_token, expires_in }` where **`expires_in` is in MINUTES**; the client
  converts to seconds and caches with a **30s** skew. On a 401 to
  `/Instruction/Inspection` it drops the token, refreshes **exactly once**, retries.
- **Submit:** `POST {EVA_BASE_URL}Instruction/Inspection` with `Authorization: Bearer`.
- Patterned on `functions/enrichment/dvsa_client.py` (same cache + 401-retry shape).

### `payload.py` (pure)
- `validate_core_payload` — the **12-field core** membership/format gate, kept in
  lock-step with `contracts/eva-payload.schema.json` (a parity test asserts
  `EVA_PAYLOAD_KEYS` equals the schema's `propertyNames.enum`). The 12 fields are
  validated **before any token is minted**.
- `order_impact_images` — **2 previews first, then the full sequence including
  those two again** (the domain photo-order rule).
- `build_instruction_inspection` — assembles the request body: the 12-field core
  **verbatim** (byte-identical to the drag-drop body for those 12) + ordered
  Impact Images.

> **Open item (plan §13 Q1):** the exact EVA Impact-Image field name(s) and
> whether photos go on `/Instruction/Inspection` as base-64 entries or via a
> separate `SubmitPreviews` call are **unconfirmed against the EVA test server**.
> This builder attaches images under the clearly-marked, easily-renamed
> `impact_images` key. Re-read `docs/reference/Sentry API Documentation 1.2
> Amended.pdf` and capture the accepted shape from the EVA **test** env before the
> connector is finalised.

## Secret handling — Key Vault only

`EVA_CLIENT_ID` / `EVA_CLIENT_SECRET` are app settings whose **values are Key
Vault references** (`@Microsoft.KeyVault(SecretUri=...)`), resolved by the
platform via the Function's system-assigned managed identity (granted *Key Vault
Secrets User* in `infra/main.bicep`). The secret names (`eva-client-id`,
`eva-client-secret`) match the Dataverse secret env-vars in
`dataverse/environment-variables.json`. Secrets are read only inside `EvaClient`,
sent only in the token request body, and are **never** logged, echoed, or written
to a fixture. The bearer token is never logged. `EvaConfig.__repr__` redacts every
credential. `EVA_BASE_URL` is a **non-secret** plain app setting (same for
test/prod — the credentials route the environment, ADR-0005).

## Offline test command

No `func start` / Core Tools needed — handlers are exercised directly with a fake
`HttpRequest`, and all HTTP (the EVA token + instruction endpoints) is mocked with
`respx`:

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt   # Windows
python -m pytest -q
```

Tests assert: the 12-field core is validated before any token mint; `expires_in`
minutes convert to a seconds TTL with the 30s skew; a 401 refreshes once then
self-heals (or soft-fails); image ordering is previews-then-full-sequence;
`EVA_PAYLOAD_KEYS` matches the repo schema; and no secret/token appears in logs or
output.

## Files

| File | Purpose |
|---|---|
| `function_app.py` | HTTP trigger + gate-at-edge + validate + submit orchestration |
| `eva_client.py` | EVA `/Connect/token` mint+cache (server-side) + `Instruction/Inspection` POST |
| `payload.py` | 12-field core validation + Impact-Image ordering + body builder (pure) |
| `host.json` | Functions host config (extension bundle, App Insights) |
| `requirements.txt` / `requirements-dev.txt` | runtime / test deps |
| `local.settings.json.TEMPLATE` | setting **names** only; secrets as KV refs |
| `infra/main.bicep` | Flex Consumption Function + Storage + Key Vault + RBAC |
| `openapi/evasentry-connector.json` | custom-connector OpenAPI 2.0 (function-key; NO OAuth) |
| `tests/` + `tests/fixtures/` | pytest + recorded **fake** token/instruction responses |

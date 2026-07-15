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
   POST ────────────────────────────▶ {EVA_BASE_URL}Instruction/Inspection   (req 1)
        Authorization: Bearer ...        Body: PascalCase core + 2 preview Files
                                        │  -> { "Id": ... }  (claim acknowledgement)
   POST ────────────────────────────▶ {EVA_BASE_URL}Note/SubmitNote          (req 2)
        Authorization: Bearer ...        Body: ALL photos (Files) + VehReg/ClmNo
                                        │  one token mint covers both requests
```

**Two-request photo submission** (confirmed against `docs/reference/Sentry API
Documentation 1.2 Amended.pdf`, pp.13,21-23): EVA wants the 2 preview photos
first (overview with the full registration visible + main-damage closeup), then
**all** photos in sequence including those two again. Photos are EVA **`Files`**
entries `{Name, Extension, Data(base64)}` — the previews ride on
`/Instruction/Inspection` (which creates the claim and returns `Id`), the full
ordered set then rides on `/Note/SubmitNote`, matched to the claim by
`VehReg` (+ `ClmNo`/`EvaRef`). (EVA's `ImpactImage` is the directional
impact-diagram on `/Report/SubmitReport`, **not** photo submission.)

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
  "casePo"?: "test26001",              // lowercase Case/PO -> Instruction ExternalRef
  "vrm"?: "AB12CDE",                   // -> VehReg (claim key for the Note photo request)
  "clmNo"?: "CLM20251022001",          // -> ClmNo (claim key)
  "images"?: [ { "sequenceIndex": 0, "content": "<base64>", "role": "overview",
                 "registrationVisible": true }, ... ]
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
- `split_preview_and_rest` — splits sorted images into `(previews, all_in_seq)`
  for the two requests: 2 previews first, then **all** photos in sequence
  including those two again (the domain photo-order rule).
- `build_files` — maps image entries to EVA `Files` `{Name, Extension, Data}`.
- `core_to_instruction` — maps the 12 snake_case fields to the PascalCase
  `Instruction/Inspection` request model (`InsName`, `VehDesc`, `Cause`,
  `VatStat`, `ClmTelNo`, `ClmEmail`, `DtIncident`, …) and attaches the preview
  `Files`. Fields with no first-class slot (`date_of_instruction`, `mileage`,
  `mileage_unit`) are preserved in `NotesStr` so no datum is dropped.
- `build_note_submitnote` — the second-request body (full photo set + `VehReg`/
  `ClmNo` claim keys).
- `overview_registration_warnings` — advisory check that the first preview is an
  `overview` whose **registration is visible** (warns, never hard-blocks).
- `order_impact_images` — DEPRECATED single-list concatenation, kept for the
  connector's optional pre-ordered array / back-compat.

> **Resolved (was plan §13 Q1):** re-read `docs/reference/Sentry API Documentation
> 1.2 Amended.pdf` (pp.5-13, 21-23). Photos are EVA **`Files`** entries
> `{Name, Extension, Data}` carried inline on `/Instruction/Inspection` (the 2
> previews) and on `/Note/SubmitNote` (the full set, matched by `VehReg`+`ClmNo`)
> — the **two-request** photo submission. The earlier `impact_images` key was a
> misnomer (`ImpactImage` is the report impact-diagram on `/Report/SubmitReport`).
> The exact PascalCase mapping is implemented in `core_to_instruction`; verify the
> field choices + the `Files` acceptance on the EVA **test** env at cutover.

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
`HttpRequest`, and all HTTP (the EVA token, instruction, and note endpoints) is
mocked with `respx`:

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt   # Windows
python -m pytest -q
```

Tests assert (42 cases): the 12-field core is validated before any token mint;
`expires_in` minutes convert to a seconds TTL with the 30s skew; **one** mint
covers both photo requests; a 401 refreshes once then self-heals (or soft-fails);
the **two-request** photo submission (2 previews on Instruction, full set on
Note, matched by VehReg/ClmNo) with a failed Note degrading to a warning; the
core->PascalCase Instruction mapping; the overview-registration advisory;
idempotency-by-payload-hash short-circuits a repeat; `EVA_PAYLOAD_KEYS` matches
the repo schema; and no secret/token appears in logs or output.

## Files

| File | Purpose |
|---|---|
| `function_app.py` | HTTP trigger + gate-at-edge + validate + two-request submit orchestration + idempotency cache |
| `eva_client.py` | EVA `/Connect/token` mint+cache (server-side) + `Instruction/Inspection` + `Note/SubmitNote` POSTs |
| `payload.py` | 12-field core validation + preview/photo split + `Files` builder + core->Instruction PascalCase mapping (pure) |
| `host.json` | Functions host config (extension bundle, App Insights) |
| `requirements.txt` / `requirements-dev.txt` | runtime / test deps |
| `local.settings.json.TEMPLATE` | setting **names** only; secrets as KV refs |
| `infra/main.bicep` | Flex Consumption Function + Storage + Key Vault + RBAC |
| `openapi/evasentry-connector.json` | custom-connector OpenAPI 2.0 (function-key; NO OAuth) |
| `tests/` + `tests/fixtures/` | pytest + recorded **fake** token/instruction responses |

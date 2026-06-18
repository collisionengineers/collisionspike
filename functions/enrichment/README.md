# DVSA enrichment wrapper (`Func_DvsaEnrich`)

A thin Azure Function (Python v2) that exposes plain REST for vehicle enrichment.
It calls the **DVSA MOT History API directly** (Microsoft Entra
`client_credentials` + `X-API-Key`) and the **DVLA Vehicle Enquiry API directly**
(API-key REST) — **no gateway, all-Microsoft**. It suggests vehicle make/model
and (conditionally) a current mileage estimate for a Case during intake.
Enrichment is **advisory and staff-reviewed** — it never blocks intake. Plan
reference: phase-1 §5.6.

## Architecture — direct DVSA/DVLA (blocker B1 obviated)

Previously this wrapper routed every call through the `collisionplugin`
`ce-mcp-gateway` (an OAuth-MCP gateway on **Google Cloud Run**) to reach the
`dvsa-mot` MCP connector. That cross-cloud hop is **gone**. The DVSA MOT History
API is itself **Microsoft-Entra-authenticated** (`login.microsoftonline.com`,
`client_credentials`), so an Azure Function has no reason to detour through GCP.
The product owner's decision: go all-Microsoft. **Blocker B1 (gateway exposure /
OAuth client-credentials availability) is therefore obviated** — there is no
gateway in the path at all.

```
Function ──client_credentials──▶ https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
   (DVSA client_id/secret + scope from Key Vault refs, form-encoded)
                                        │  Bearer JWT (~3600s, cached)
   GET ─────────────────────────▶ {DVSA_API_BASE}/v1/trade/vehicles/registration/{reg}
        Authorization: Bearer ...        Headers: X-API-Key (KV ref)
                                        │  DVSA vehicle JSON (make/model/motTests[])
   analysis.py (pure) ──────────▶ vehicle_summary + current_mileage_estimate

   Fallback (make only, new vehicles with no MOT):
   POST ────────────────────────▶ {DVLA_API_BASE}/v1/vehicles   (x-api-key)
```

## Boundary tags

| Activity | Tag |
|---|---|
| Function **code** (`function_app.py`, `dvsa_client.py`, `dvla_client.py`, `analysis.py`), `infra/main.bicep`, `openapi/enrichment-connector.json` | **[BUILD]** — authored offline, verified by local `pytest`. Zero tenant/Azure/DVSA contact. |
| Deploy the Function + Key Vault + import the custom connector | **[DEPLOY-WITH-LOGIN]** |
| Inject the real DVSA / DVLA secret **values** into Key Vault | **[RESERVED-FOR-USER]** |

This directory contains **no secret values** — only Key Vault *references* and
fake test fixtures. There is **no Google Cloud** anywhere in this path.

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

`vehicle_model` maps to the settled EVA contract (`contracts/eva-payload.schema.json`);
`vrm` is Case-identity and is **not** part of the EVA payload. Suggestions are
written to empty Case fields with `dvla_dvsa` provenance and reviewed by staff
before EVA submission.

## The clients

### `dvsa_client.py` (primary)
- **Auth:** OAuth2 **client_credentials** (RFC 6749 §4.4) against
  `https://login.microsoftonline.com/{DVSA_TENANT_ID}/oauth2/v2.0/token`, form-
  encoded with `scope=DVSA_SCOPE` (default `https://tapi.dvsa.gov.uk/.default`).
  The token is cached in-process with a TTL (expiry minus a 60s skew). On a 401
  the client drops the token, refreshes **exactly once**, and retries.
- **Lookup:** `GET {DVSA_API_BASE}/v1/trade/vehicles/registration/{reg}` with
  `Authorization: Bearer` **and** `X-API-Key`. Retry-safe DVSA error codes
  (`MOTH-FB-02`, `MOTH-RL-02`, `MOTH-UN-01`) get bounded exponential backoff with
  jitter (max 4 retries); a 404 maps to a soft "no MOT record" warning.

### `dvla_client.py` (make-only fallback)
- `POST {DVLA_API_BASE}/v1/vehicles` with the `x-api-key` header and a
  `{ "registrationNumber": "<reg>" }` body. Used **only** when DVSA returns no
  make (e.g. a vehicle too new to have an MOT). DVLA has no model field, so it
  fills `make` only. Skipped silently when `DVLA_API_KEY` is absent.

### `analysis.py` (pure, ported)
A faithful Python port of `collisionplugin/.../analysis.ts` — the M1 subset:
`vehicle_summary`, `mot_status`, `mileage_history`, `detect_mileage_anomalies`,
and the **`current_mileage_estimate`** algorithm. No I/O. The heavier
valuation / clone-risk / DVLA cross-check helpers are intentionally not ported.

## Mileage-guard logic (ADR-0006 — document authoritative)

The mileage estimate is computed **only when `document_has_mileage` is `false`**.
If the parsed instruction already carries a mileage, the MOT estimate is skipped
(and a warning records why) — the document wins. The request default is
`document_has_mileage = true` (safer: do not override an authoritative document
unless told the field is empty). MOT odometer history is normalised to miles, so
`mileage_unit` is always `"Miles"`.

### The estimate algorithm (ported from `currentMileageEstimate`)
1. Take readable odometer readings (`odometerResultType == "READ"`), normalise KM
   to miles, sort oldest→newest, and keep only readings on/before the assessment
   date.
2. Build consecutive intervals; mark each **clean** unless it shows a mileage
   **decrease** or an **implausible increase** (>200 mi/day over a >30-day gap) —
   the same thresholds as `detect_mileage_anomalies`.
3. Prefer the most recent up-to-2 clean intervals (≈ last 3 readings); else fall
   back to all clean intervals. Derive an annual rate = `(Σdelta / Σdays) × 365.25`.
4. Project from the last reading to the assessment date; round the central
   estimate and the 0.75×/1.25× band to the nearest 100 miles. The floor never
   drops below the last recorded reading.
5. Confidence: `VERY_LOW` if >5 yr since last reading or no usable intervals;
   `HIGH` if the recent clean window was used, ≥3 readings, no anomalies, and
   ≤1 yr since last; `LOW` if >2 yr or the recent window was dirty; else `MEDIUM`.

## Secret handling — Key Vault only

`DVSA_CLIENT_ID` / `DVSA_CLIENT_SECRET` / `DVSA_API_KEY` / `DVLA_API_KEY` are app
settings whose **values are Key Vault references** (`@Microsoft.KeyVault(SecretUri=...)`),
resolved by the platform via the Function's system-assigned managed identity
(granted *Key Vault Secrets User* in `infra/main.bicep`). Secrets are read only
inside the clients, sent only in the token request body / request headers, and
are **never** logged, echoed in a response, or written to a fixture.
`DvsaConfig.__repr__` / `DvlaConfig.__repr__` redact every credential. Token
exchange happens at runtime; tests mock it. `DVSA_TENANT_ID`, `DVSA_SCOPE`,
`DVSA_API_BASE`, `DVLA_API_BASE` are **non-secret** plain app settings.

## Offline test command

No `func start` / Core Tools needed — handlers are exercised directly with a fake
`HttpRequest`, and all HTTP (Entra token, DVSA, DVLA) is mocked with `respx`:

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt   # Windows
python -m pytest -q
```

Tests assert: the mileage path is computed only when `document_has_mileage` is
false; DVSA make/model map correctly; the DVLA fallback fires only when DVSA has
no make; a 401 refreshes the token once then self-heals (or soft-fails); the
ported estimate reproduces the TS fixture (62400 / MEDIUM); KM normalisation and
clocking suppression behave; and no secret/token appears in logs or output.

## Files

| File | Purpose |
|---|---|
| `function_app.py` | HTTP trigger + orchestration + field cleaning + mileage guard |
| `dvsa_client.py` | Entra client_credentials token + DVSA MOT History GET (lazy, mockable) |
| `dvla_client.py` | DVLA Vehicle Enquiry POST (make-only fallback, lazy, mockable) |
| `analysis.py` | pure ported MOT analysis (summary + mileage estimate) |
| `host.json` | Functions host config (extension bundle, App Insights) |
| `requirements.txt` / `requirements-dev.txt` | runtime / test deps |
| `local.settings.json.TEMPLATE` | setting **names** only; secrets as KV refs |
| `infra/main.bicep` | Flex Consumption Function + Storage + Key Vault + RBAC |
| `openapi/enrichment-connector.json` | custom-connector OpenAPI 2.0 |
| `tests/` + `tests/fixtures/` | pytest + recorded **fake** DVSA/DVLA/token responses |

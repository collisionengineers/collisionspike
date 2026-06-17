# Parser Function (`Func_Parse`) — cedocumentmapper_v2 HTTP wrapper

Azure Function (Python v2 programming model) that wraps the sibling
`cedocumentmapper_v2` document parser behind a single HTTP route and returns the
**settled 13-field snake_case EVA extraction**, validated against the keystone
schema `contracts/eva-payload.schema.json`.

This is the **single parser surface** for collisionspike (ADR-0004): parsing is
never re-derived in Power Fx or anywhere else — the flow and the Code App call
this route.

## What it does

`POST /parse`

Request body:
```json
{ "document": "<base64>", "filename": "instruction.pdf", "provider_hint": "optional-provider-id-or-name" }
```

Response:
```json
{
  "extraction": {
    "work_provider":        { "value": "...", "confidence": 0.95, "source": "wp_header" },
    "vehicle_model":        { "value": "...", "confidence": 0.8,  "source": "model_label" },
    "claimant_name":        { "value": "...", "confidence": null, "source": "absent" },
    "claimant_telephone":   { "value": "",    "confidence": null, "source": "absent" },
    "claimant_email":       { "value": "",    "confidence": null, "source": "absent" },
    "date_of_loss":         { "value": "01/02/2026", "confidence": 0.82, "source": "date_loss" },
    "date_of_instruction":  { "value": "05/02/2026", "confidence": 0.82, "source": "date_instruction" },
    "accident_circumstances": { "value": "...", "confidence": 0.6, "source": "circumstances_para" },
    "inspection_address":   { "value": "line1\n...\n...\n...\n...\nEX1 2MP", "confidence": 0.7, "source": "address_block" },
    "vat_status":           { "value": "Yes",  "confidence": 0.9, "source": "vat_flag" },
    "mileage":              { "value": "42000","confidence": 0.75,"source": "mileage_regex" },
    "mileage_unit":         { "value": "Miles","confidence": 0.9, "source": "mileage_unit_label" },
    "engineer_allocation":  { "value": "",    "confidence": null, "source": "absent" }
  },
  "vrm":       { "value": "AB12CDE", "confidence": 0.9, "source": "vrm_regex" },
  "reference": { "value": "DEMO-0001", "confidence": 0.88, "source": "ref_regex" },
  "issues":    [],
  "contract_version": "cedocumentparser_v2.0_eva_json"
}
```

- The 13 `extraction` keys are always present, **in EVA contract order**, each a
  `{ value, confidence, source, warnings? }` cell. Fields the parser does not
  supply are present-but-empty with `source: "absent"`.
- **`vrm` and `reference` are Case-identity** (for case-resolve/dedup, plan §5.3)
  and are surfaced **separately** — they are intentionally **NOT** in the EVA
  payload.
- The flat 13-field payload is validated against
  `contracts/eva-payload.schema.json`. A schema-invalid (i.e. incomplete) parse
  still returns **200** with each violation listed in `issues` (the case routes
  to `needs_review` / `missing_required_fields` downstream — the parser pre-fills,
  staff complete).

Status codes: `200` parsed (extraction may be incomplete; see `issues`);
`400` bad input (missing/invalid `document`/`filename`, bad base64, bad JSON,
unsupported extension); `502` the parser dependency failed.

## Auth boundary

The `/parse` route is **anonymous at the Function level by design**. The Power
Platform custom connector / API gateway fronts authentication — the Function
host is never exposed directly. Do not add Function keys expecting the connector
to carry them; auth is the gateway's job.

## Gating (`PDF_MAPPER_ENABLED`)

`PDF_MAPPER_ENABLED` gates the parser, but the gate is enforced **upstream** in
the Power Automate flow branch (it reads the Dataverse environment variable and
only calls `/parse` when enabled). **This Function does not read the gate — it
just works when called.**

## The sibling seam (`parser_adapter.py`)

`parser_adapter.py` is the **only** module that imports `cedocumentmapper_v2`. It
is imported **lazily** (inside `run_parser`) so the test suite runs without the
sibling package or its native deps (PyMuPDF [licensed/approved], Tesseract,
python-docx) installed.

The exact sibling public API targeted (read from the sibling source on
2026-06-17):

```python
from cedocumentmapper_v2.application import DocumentMapperService
svc = DocumentMapperService()
document, record = svc.process_document(path)   # path: str|Path; reader picked by SUFFIX
result_dict = svc.record_to_dict(record)        # {provider, fields{<key>:{value,confidence,rule_id,...}}, issues}
```

`process_document` takes a **file path** and dispatches a reader by file suffix
(`.pdf/.docx/.doc/.eml/.msg`), so the adapter writes the decoded bytes to a temp
file carrying `filename`'s extension before calling it. There is no bytes-in
public entry point today.

**Contract reconciliation** (the adapter's job): the sibling's native field set
is the *legacy* 13, not the settled EVA 13. The adapter renames
`incident_date → date_of_loss`, `instruction_date → date_of_instruction`; drops
`inspection_date` from the EVA payload; routes `vrm`/`reference` to Case-identity;
and defaults the three EVA fields the parser does not yet emit
(`claimant_telephone`, `claimant_email`, `engineer_allocation`) to empty.

> **Confirm with document-parser-engineer:** whether the sibling will rename its
> native keys to the EVA set, add the three missing EVA fields, and/or expose a
> bytes-in entry point. Until then `parser_adapter.EVA_KEY_FROM_PARSER_KEY` is
> the authoritative mapping and the only place to change it.

## Files

| File | Purpose |
|---|---|
| `function_app.py` | HTTP trigger `POST /parse`; input validation, mapping, schema validation, error envelopes. |
| `parser_adapter.py` | The only seam to `cedocumentmapper_v2`; lazy import; native→EVA field mapping. |
| `schema_validation.py` | Loads + validates against `contracts/eva-payload.schema.json`; structured errors. |
| `host.json` | Functions host config. |
| `requirements.txt` | Runtime deps (`azure-functions`, `jsonschema`); sibling referenced via path (NOT vendored). |
| `requirements-dev.txt` | `pytest`. |
| `local.settings.json.TEMPLATE` | App-setting **names** only; secrets shown as Key Vault reference syntax. **No secret values.** |
| `infra/main.bicep` | Linux Python Function App + Storage + plan + App Insights; app settings as Key Vault references; parameterized. |
| `openapi/parser-connector.json` | Power Platform custom-connector OpenAPI 2.0 (swagger) for `POST /parse`. |
| `tests/` | Offline pytest (handler called directly with a fake `HttpRequest`; `run_parser` monkeypatched). |

## Build / Deploy / Reserved boundary

Per the phase-1 plan §2:

- **[BUILD]** (done here, fully offline, no tenant contact) — all Function code,
  `infra/main.bicep`, and `openapi/parser-connector.json`. Verified by local
  `pytest` (and `az bicep build` / OpenAPI lint at the integrate step).
- **[DEPLOY-WITH-LOGIN]** — deploying the Function App / Storage / plan and
  importing the custom connector. Run under the user's interactive login;
  **non-inbox** only. Not performed here.
- **[RESERVED-FOR-USER]** — injecting any real **secret value** into Key Vault.
  This Function holds no secrets of its own today; the Bicep wires a *future*
  secret only as a `@Microsoft.KeyVault(...)` reference. No literal secret exists
  in code, Bicep, app settings, tests, or fixtures.

## Offline test command

```powershell
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pytest
```

Tests monkeypatch `parser_adapter.run_parser`, so `cedocumentmapper_v2` /
PyMuPDF / Tesseract are **not** required to run them. No network, no `func start`,
no tenant.

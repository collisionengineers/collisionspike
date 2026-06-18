# Parser Function (`Func_Parse`) — cedocumentmapper_v2 HTTP wrapper

Azure Function (Python v2 programming model) that wraps the sibling
`cedocumentmapper_v2` document parser behind a single HTTP route and returns the
**settled 12-field snake_case EVA extraction**, validated against the keystone
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
    "mileage_unit":         { "value": "Miles","confidence": 0.9, "source": "mileage_unit_label" }
  },
  "vrm":       { "value": "AB12CDE", "confidence": 0.9, "source": "vrm_regex" },
  "reference": { "value": "DEMO-0001", "confidence": 0.88, "source": "ref_regex" },
  "issues":    [],
  "contract_version": "cedocumentparser_v2.0_eva_json"
}
```

- The 12 `extraction` keys are always present, **in EVA contract order**, each a
  `{ value, confidence, source, warnings? }` cell. Fields the parser does not
  supply are present-but-empty with `source: "absent"`.
- **`vrm` and `reference` are Case-identity** (for case-resolve/dedup, plan §5.3)
  and are surfaced **separately** — they are intentionally **NOT** in the EVA
  payload.
- The flat 12-field payload is validated against
  `contracts/eva-payload.schema.json`. A schema-invalid (i.e. incomplete) parse
  still returns **200** with each violation listed in `issues` (the case routes
  to `needs_review` / `missing_required_fields` downstream — the parser pre-fills,
  staff complete).

Status codes: `200` parsed (extraction may be incomplete; see `issues`);
`400` bad input (missing/invalid `document`/`filename`, bad base64, bad JSON,
unsupported extension); `502` the parser dependency failed.

## Auth boundary

The `/parse` route uses **FUNCTION-level auth** (`auth_level=func.AuthLevel.FUNCTION`
in `function_app.py`). The Power Platform custom connector carries the function key
as the `x-functions-key` header (stored on the **connection**, never embedded in the
connector definition); the Function host is not exposed directly to callers. A request
without a valid key returns **401**.

> Verified live 2026-06-18 on the deployed Function `cespike-parser-dev` (FC1, UK South):
> no key → 401; bad input → 400; valid request → 200 with the 12-field extraction.
> (An earlier draft of this note said "anonymous" — that was wrong; the route has always
> shipped function-level auth.)

## Gating (`PDF_MAPPER_ENABLED`)

`PDF_MAPPER_ENABLED` gates the parser, but the gate is enforced **upstream** in
the Power Automate flow branch (it reads the Dataverse environment variable and
only calls `/parse` when enabled). **This Function does not read the gate — it
just works when called.**

## Engine packaging — VENDORED for Flex Consumption (FC1)

The engine ships **vendored** into this package as the top-level directory
`./cedocumentmapper_v2/` (a copy of the sibling repo's `src/cedocumentmapper_v2`).
On the FC1 worker the app root is on `sys.path`, so `import cedocumentmapper_v2`
resolves directly — no `pip install` of the engine, no wheel, no `PYTHONPATH`
tweak. The FC1 remote Oryx build (`--build-remote true`) installs the engine's
runtime deps from `requirements.txt` on Linux.

Why vendor source (not a wheel): it is the simplest robust shape for an FC1
remote build — one importable directory next to `function_app.py`, the same way
`parser_adapter.py` is loaded. A wheel would need a build/host/feed step for no
benefit here.

Two files from the sibling are **omitted** from the vendored copy because they
are the only modules that import GUI/Windows deps and are never on the runtime
path: `ui/host.py` (`import webview`) and `cli.py`. `ui/__init__.py` only
references `host` lazily via `__getattr__`, and `service.py` imports just
`ui.paths` (stdlib-only, with `ctypes` Windows calls guarded behind
`sys.platform == "win32"`), so dropping `host.py` is safe. The `.doc` Word-COM
path (`pythoncom`/`win32com`) and the desktop `_convert_doc_to_docx` are lazy +
guarded, so they never import on Linux; `.doc` still reads via the
olefile/text-scrape fallback. **No engine source was modified** — the desktop app
is untouched.

`providers.json` (the provider catalogue) is vendored inside the package as
`cedocumentmapper_v2/providers.json`. The adapter pins the service to that seed
and to a **writable temp app-data dir** (`<tmp>/cedocumentmapper_v2_appdata`),
because the engine's desktop default writes its migrated catalogue into
`~/CE Document Mapper`, which is read-only/absent on FC1. This is a wrapper-side
construction only (`DocumentMapperService(app_data_dir=..., seed_path=...)`).

### OCR on FC1 (Tesseract optional — scanned-image PDFs unavailable)

`pytesseract` is installed but is only a thin **wrapper** — it imports fine with
no `tesseract` binary present. `readers/pdf.configure_tesseract()` probes
`shutil.which("tesseract")` and returns `False` gracefully when absent; the OCR
fallback only fires for image-only PDFs and, if invoked without a binary, is
caught per-page and noted. **FC1 (Flex Consumption) cannot run a custom
container, so the tesseract binary cannot be provided — OCR of scanned-image PDFs
is therefore unavailable here.** Text-based PDFs, DOCX, DOC (text-scrape), EML and
MSG all work. Scanned-image OCR is deferred to the later Azure Container Apps step
("B-full"), where a container image can bundle the binary.

## The sibling seam (`parser_adapter.py`)

`parser_adapter.py` is the **only** module that imports `cedocumentmapper_v2`. It
is imported **lazily** (inside `run_parser`) so the test suite runs without the
engine deps installed even though the engine is vendored alongside.

The exact sibling public API targeted (read from the sibling source on
2026-06-17):

```python
from cedocumentmapper_v2.application import DocumentMapperService
# Pinned to the vendored seed + a writable temp app-data dir (FC1-safe):
svc = DocumentMapperService(app_data_dir=<tmp>, seed_path=<vendored providers.json>)
document, record = svc.process_document(path)   # path: str|Path; reader picked by SUFFIX
result_dict = svc.record_to_dict(record)        # {provider, fields{<key>:{value,confidence,rule_id,...}}, issues}
```

`process_document` takes a **file path** and dispatches a reader by file suffix
(`.pdf/.docx/.doc/.eml/.msg`), so the adapter writes the decoded bytes to a temp
file carrying `filename`'s extension before calling it. There is no bytes-in
public entry point today.

**Contract reconciliation** (the adapter's job): the sibling's native field set
is the *legacy* set, not the settled EVA 12. The adapter renames
`incident_date → date_of_loss`, `instruction_date → date_of_instruction`; drops
`inspection_date` from the EVA payload; routes `vrm`/`reference` to Case-identity;
and defaults the two EVA fields the parser does not yet emit
(`claimant_telephone`, `claimant_email`) to empty. (Engineer allocation is NOT an
EVA submission field — assigned inside EVA after submission; not in the contract.)

> **Confirm with document-parser-engineer:** whether the sibling will rename its
> native keys to the EVA set, add the two missing EVA fields, and/or expose a
> bytes-in entry point. Until then `parser_adapter.EVA_KEY_FROM_PARSER_KEY` is
> the authoritative mapping and the only place to change it.

## Files

| File | Purpose |
|---|---|
| `function_app.py` | HTTP trigger `POST /parse`; input validation, mapping, schema validation, error envelopes. |
| `parser_adapter.py` | The only seam to `cedocumentmapper_v2`; lazy import; pins service to vendored seed + writable temp app-data; native→EVA field mapping. |
| `cedocumentmapper_v2/` | **Vendored engine** (sibling `src/cedocumentmapper_v2`, minus `ui/host.py` + `cli.py`); includes `providers.json`. Importable on the FC1 worker. |
| `schema_validation.py` | Loads + validates against `contracts/eva-payload.schema.json`; structured errors. |
| `host.json` | Functions host config. |
| `requirements.txt` | Linux/FC1 runtime deps: `azure-functions`, `jsonschema`, + the vendored engine's deps (PyMuPDF, pypdf[image], Pillow, python-docx, extract-msg, olefile, pytesseract). **No GUI/Windows deps; engine itself is vendored, not pip-installed.** |
| `requirements-dev.txt` | `pytest`. |
| `.funcignore` | Excludes venvs/caches/tests/infra/openapi from the deploy zip. |
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

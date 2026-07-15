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
  "vin":       { "value": "WVGZZZ1TZFW030347", "confidence": 0.9, "source": "vin_label" },
  "audit":     { "value": false, "signals": [], "source": "instruction_text" },
  "issues":    [],
  "contract_version": "cedocumentparser_v2.0_eva_json"
}
```

- The 12 `extraction` keys are always present, **in EVA contract order**, each a
  `{ value, confidence, source, warnings? }` cell. Fields the parser does not
  supply are present-but-empty with `source: "absent"`.
- **`vrm`, `reference`, and optional `vin` are Case-identity fields** surfaced
  **separately** — they are intentionally **NOT** in the EVA payload. VIN remains
  absent/empty when the detected layout does not supply a labelled VIN.
- **`audit`** is the audit case-type signal (`{ value: bool, signals: [...],
  source }`) — `true` when the instruction text marks a second, independent CE
  inspection auditing a third-party engineer's original report (content-derived;
  `signals` lists the phrases that fired, so the call is auditable). Like
  `vrm`/`reference` it is surfaced **separately** and is **NOT** an EVA field. See
  the `collisionspike` ADR-0014 / inspection-address-corpus sibling docs.
- The flat 12-field payload is validated against
  `contracts/eva-payload.schema.json`. A schema-invalid (i.e. incomplete) parse
  still returns **200** with each violation listed in `issues` (the case routes
  to `needs_review` / `missing_required_fields` downstream — the parser pre-fills,
  staff complete).

Status codes: `200` parsed (extraction may be incomplete; see `issues`);
`400` bad input (missing/invalid `document`/`filename`, bad base64, bad JSON,
unsupported extension); `422` the supplied document is unreadable (corrupt/
truncated — a client fault the flow routes to review); `500` unexpected internal
error (defensive); `502` the parser dependency failed (engine not importable /
reader binary missing — safe for the flow to retry).

## Auth boundary

The `/parse` route uses **FUNCTION-level auth** (`auth_level=func.AuthLevel.FUNCTION`
in `function_app.py`). The Power Platform custom connector carries the function key
as the `x-functions-key` header (stored on the **connection**, never embedded in the
connector definition); the Function host is not exposed directly to callers. A request
without a valid key returns **401**.

> Verified live 2026-06-18 on the deployed Function `cespike-parser-dev-…` (FC1, UK South):
> no key → 401; bad input → 400; valid request → 200 with the 12-field extraction.
> (An earlier draft of this note said "anonymous" — that was wrong; the route has always
> shipped function-level auth.)

## Gating (`PDF_MAPPER_ENABLED`)

`PDF_MAPPER_ENABLED` gates the parser, but the gate is enforced **upstream** in
the orchestration Function App (it reads the Azure app-setting and only calls
`/parse` when enabled). **This Function does not read the gate — it just works
when called.**

## Engine packaging — VENDORED for Flex Consumption (FC1)

The engine ships **vendored** into this package as the top-level directory
`./cedocumentmapper_v2/` (a re-cut copy of the sibling repo's
`src/cedocumentmapper_v2`). On the FC1 worker the app root is on `sys.path`, so
`import cedocumentmapper_v2` resolves directly — no `pip install` of the engine,
no wheel, no `PYTHONPATH` tweak. The FC1 remote Oryx build (`--build-remote true`)
installs the engine's runtime deps from `requirements.txt` on Linux.

Why vendor source (not a wheel): it is the simplest robust shape for an FC1
remote build — one importable directory next to `function_app.py`, the same way
`parser_adapter.py` is loaded. A wheel would need a build/host/feed step for no
benefit here.

### Authoring rule — sibling is the source of truth, this copy is pinned

The sibling repo **`collisionengineers/cedocumentmapper_v2.0`** is the
**authoring source of truth** for the engine. `functions/parser/cedocumentmapper_v2/`
is a **pinned vendored copy** re-cut from it by the command in
[`cedocumentmapper_v2/PROVENANCE.md`](./cedocumentmapper_v2/PROVENANCE.md). **All
engine edits land in the sibling first** and are then re-vendored — the vendored
copy is **never hand-edited**. As of `engine-v2.1` every earlier reconciliation
is upstream and the cloud engine is a pure mirror of its declared sibling
boundary.

The machine-readable `cedocumentmapper_v2/VENDOR_LOCK.json` records the
annotated release tag, full peeled commit, boundary, complete content digest,
and provider-catalogue digest. The dependency-free verifier
`scripts/verify_vendor_pin.py` runs on every PR and push. It always checks the
offline lock; when the sibling clone is available it also reads the locked Git
objects directly, independent of the sibling's checked-out branch, and compares
the source/vendored path sets in both directions. Pushes and same-repository PRs
receive that full source proof through a dedicated read-only sibling deploy key;
fork PRs receive the offline check only. The pytest guard invokes the same
verifier.

The explicitly omitted sibling surface is desktop/dev-only: `cli.py`,
`__main__.py`, `ui/host.py`, `extraction/`, `eval/`, and the two authoring-only
resource schemas. `ui/paths.py` remains vendored because the service imports its
stdlib-only path helpers. Full boundary detail is in `PROVENANCE.md`.

`providers.json` (the provider catalogue) is vendored inside the package as
`cedocumentmapper_v2/providers.json` and is the **pinned seed** for the deployed
Function. The adapter pins the service to it and to a **writable temp app-data dir**
(`<tmp>/cedocumentmapper_v2_appdata`), because the engine's desktop default writes
its migrated catalogue into `~/CE Document Mapper`, which is read-only/absent on
FC1. A re-cut must **not** clobber this seed with the sibling's unless the seed has
intentionally changed. The vendor lock verifies it separately and as part of the
complete tree digest. This is a wrapper-side construction only
(`DocumentMapperService(app_data_dir=..., seed_path=...)`).

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
result_dict = svc.record_to_dict(record)        # {provider, fields{<key>:{value,...}}, issues, notes}
```

`process_document` takes a **file path** and dispatches a reader by file suffix
(`.pdf/.docx/.doc/.eml/.msg`), so the adapter writes the decoded bytes to a temp
file carrying `filename`'s extension before calling it. There is no bytes-in
public entry point today.

**Contract reconciliation** (the adapter's job): the sibling's native field set
is the *legacy* set, not the settled EVA 12. The adapter renames
`incident_date → date_of_loss`, `instruction_date → date_of_instruction`; drops
`inspection_date` from the EVA payload; routes `vrm`/`reference` to Case-identity;
and passes through `claimant_telephone` / `claimant_email` (which the parser now
emits natively as of ROADMAP B2 — UK phone + email regex scoped to claimant/insured
context, with provenance; left empty when not derivable, never invented). (Engineer
allocation is NOT an EVA submission field — assigned inside EVA after submission; not
in the contract.)

> **Confirm with document-parser-engineer:** whether the sibling will rename its
> native keys to the EVA set and/or expose a bytes-in entry point (the claimant
> telephone/email fields are already emitted natively as of ROADMAP B2). Until then
> `parser_adapter.EVA_KEY_FROM_PARSER_KEY` is
> the authoritative mapping and the only place to change it.

## Files

| File | Purpose |
|---|---|
| `function_app.py` | HTTP trigger `POST /parse`; input validation, mapping, schema validation, error envelopes. |
| `parser_adapter.py` | The only seam to `cedocumentmapper_v2`; lazy import; pins service to vendored seed + writable temp app-data; native→EVA field mapping. |
| `cedocumentmapper_v2/` | **Vendored engine** — a pinned pure-mirror re-cut of the sibling's declared cloud boundary. Includes the pinned `providers.json`, `VENDOR_LOCK.json`, and `PROVENANCE.md`. Importable on the FC1 worker. |
| `schema_validation.py` | Loads + validates against `contracts/eva-payload.schema.json`; structured errors. |
| `host.json` | Functions host config. |
| `requirements.txt` | Linux/FC1 runtime deps: `azure-functions`, `jsonschema`, + the vendored engine's deps (PyMuPDF, pypdf[image], Pillow, python-docx, extract-msg, olefile, pytesseract). **No GUI/Windows deps; engine itself is vendored, not pip-installed.** |
| `requirements-dev.txt` | `pytest`. |
| `.funcignore` | Excludes venvs/caches/tests/infra/openapi from the deploy zip. |
| `local.settings.json.TEMPLATE` | App-setting **names** only; secrets shown as Key Vault reference syntax. **No secret values.** |
| `infra/main.bicep` | Linux Python Function App + Storage + plan + App Insights; app settings as Key Vault references; parameterized. |
| `openapi/parser-connector.json` | Power Platform custom-connector OpenAPI 2.0 (swagger) for `POST /parse`. |
| `tests/` | Offline pytest (handler called directly with a fake `HttpRequest`; `run_parser` monkeypatched). Plus the always-on immutable vendor-pin guard (`test_engine_vendored_in_sync.py`) and an **engine smoke** slice (`test_engine_smoke.py` + `fixtures/instructions` + `fixtures/expected`, gated by `pytest.importorskip("fitz")`). |

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

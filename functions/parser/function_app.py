"""function_app — Collision Engineers parser Function (Azure Functions Python v2).

HTTP trigger ``POST /parse``. Accepts a base64-encoded instruction document,
runs it through the sibling ``cedocumentmapper_v2`` parser (via parser_adapter,
the only seam), maps the result onto the settled 13-field snake_case EVA
contract with per-field ``{value, confidence, source, warnings?}``, surfaces
``vrm``/``reference`` SEPARATELY (Case-identity, NOT in the EVA payload),
validates the flat 13-field payload against ``contracts/eva-payload.schema.json``,
and returns a structured envelope.

[BUILD] — authored offline; no Azure/tenant contact (tests mock the parser seam).

AUTH: FUNCTION-level (a function key is required) for defence-in-depth — the
Power Platform custom connector / API gateway also fronts the endpoint, but the
host is never left open. The connector passes the key as the ``x-functions-key``
header. (See README "Auth boundary".)

GATING: ``PDF_MAPPER_ENABLED`` is enforced UPSTREAM, in the Power Automate flow
branch (the flow checks the Dataverse env var and only calls this route when
enabled). The Function just works when called; it does not read the gate.

Response envelope:
    {
      "extraction":       { <13 EVA keys in order>: {value, confidence, source, warnings?} },
      "vrm":              {value, confidence, source, warnings?} | null,
      "reference":        {value, confidence, source, warnings?} | null,
      "issues":           [ {field, severity?, code, message} ],
      "contract_version": "cedocumentparser_v2.0_eva_json"
    }

Status codes:
    200  parsed + schema-valid (or schema-invalid surfaced in issues, see below)
    400  bad input (missing/!base64 document, missing/unsupported filename, bad JSON)
    502  parser dependency failed (ParserError)
"""

from __future__ import annotations

import base64
import binascii
import json
import logging
from typing import Any

import azure.functions as func

import parser_adapter
from parser_adapter import ParserError
from schema_validation import SchemaValidationError, validate_eva_payload

app = func.FunctionApp()

_LOG = logging.getLogger("ce.parser")

CONTRACT_VERSION = parser_adapter.CONTRACT_VERSION


@app.function_name(name="parse")
@app.route(route="parse", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)
def parse(req: func.HttpRequest) -> func.HttpResponse:
    """POST /parse — see module docstring."""
    # --- 1. Parse + validate the request body (400 on any input problem) ----
    try:
        body = req.get_json()
    except ValueError:
        return _error(400, "bad_request", "Request body must be valid JSON.")

    if not isinstance(body, dict):
        return _error(400, "bad_request", "Request body must be a JSON object.")

    document_b64 = body.get("document")
    filename = body.get("filename")
    provider_hint = body.get("provider_hint")

    if not document_b64 or not isinstance(document_b64, str):
        return _error(400, "missing_document", "'document' (base64 string) is required.")
    if not filename or not isinstance(filename, str):
        return _error(400, "missing_filename", "'filename' (string with extension) is required.")
    if provider_hint is not None and not isinstance(provider_hint, str):
        return _error(400, "bad_provider_hint", "'provider_hint' must be a string when provided.")

    try:
        document_bytes = base64.b64decode(document_b64, validate=True)
    except (binascii.Error, ValueError):
        return _error(400, "bad_base64", "'document' is not valid base64.")
    if not document_bytes:
        return _error(400, "empty_document", "Decoded 'document' is empty.")

    # --- 2. Run the parser via the adapter seam (502 on parser failure) ------
    try:
        parser_result = parser_adapter.run_parser(document_bytes, filename, provider_hint)
    except ValueError as exc:
        # Adapter rejected the input (e.g. unsupported extension) -> client error.
        return _error(400, "unsupported_document", str(exc))
    except ParserError as exc:
        _LOG.exception("parser failed")
        return _error(502, "parser_failed", str(exc))

    # --- 3. Map to the 13-field EVA contract + Case-identity fields ----------
    mapped = parser_adapter.to_eva_extraction(parser_result)
    extraction = mapped["extraction"]
    issues: list[dict[str, Any]] = list(mapped.get("issues", []))

    # --- 4. Validate the FLAT 13-field payload against the keystone schema ---
    flat_payload = {key: cell.get("value", "") for key, cell in extraction.items()}
    try:
        validate_eva_payload(flat_payload)
    except SchemaValidationError as exc:
        # Not a hard failure: an incomplete extraction is normal (parser pre-fills,
        # staff complete the case). We return 200 but surface each schema issue so
        # the flow / Code App can route the case to needs_review / missing fields.
        for issue in exc.issues:
            issues.append(
                {
                    "field": issue["field"],
                    "severity": "error",
                    "code": issue["code"],
                    "message": issue["message"],
                }
            )

    response: dict[str, Any] = {
        "extraction": extraction,
        "vrm": mapped.get("vrm"),
        "reference": mapped.get("reference"),
        "issues": issues,
        "contract_version": CONTRACT_VERSION,
    }
    return _json(200, response)


def _json(status: int, payload: dict[str, Any]) -> func.HttpResponse:
    return func.HttpResponse(
        body=json.dumps(payload, ensure_ascii=False),
        status_code=status,
        mimetype="application/json",
    )


def _error(status: int, code: str, message: str) -> func.HttpResponse:
    """Structured error envelope. ``issues`` mirrors the success shape so callers parse one schema."""
    return _json(
        status,
        {
            "extraction": None,
            "vrm": None,
            "reference": None,
            "issues": [{"field": "(request)", "severity": "error", "code": code, "message": message}],
            "contract_version": CONTRACT_VERSION,
        },
    )

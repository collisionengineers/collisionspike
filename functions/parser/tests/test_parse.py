"""Offline pytest suite for the parser Function.

Run from functions/parser/:
    python -m pytest

These tests monkeypatch ``parser_adapter.run_parser`` so the sibling
``cedocumentmapper_v2`` package and its heavy native deps (PyMuPDF / Tesseract)
are NOT required. No network, no tenant, no ``func start``: the HTTP handler is
called directly with a hand-built ``azure.functions.HttpRequest``.

Coverage:
  * happy path -> 200, schema-VALID 12-field payload in CONTRACT ORDER
  * vrm / reference are surfaced separately and are NOT in the payload
  * bad base64 -> 400
  * parser raises ParserError -> 502
  * deliberately-incomplete extraction -> 200 but schema issues surfaced clearly
"""

from __future__ import annotations

import base64
import json
import os

import azure.functions as func
import pytest

import function_app
import parser_adapter
from parser_adapter import ParserError, EVA_FIELD_ORDER

FIXTURE_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def _load_fixture(name: str) -> dict:
    with open(os.path.join(FIXTURE_DIR, name), "r", encoding="utf-8") as fh:
        return json.load(fh)


def _make_request(body: dict | None, raw_body: bytes | None = None) -> func.HttpRequest:
    """Build a fake HttpRequest for the /parse route."""
    payload = raw_body if raw_body is not None else json.dumps(body).encode("utf-8")
    return func.HttpRequest(
        method="POST",
        url="http://localhost/api/parse",
        headers={"Content-Type": "application/json"},
        body=payload,
    )


def _valid_request_body() -> dict:
    """A well-formed request body. The document bytes are irrelevant because
    run_parser is monkeypatched; they just have to be valid base64 + a supported
    extension."""
    return {
        "document": base64.b64encode(b"%PDF-1.4 fake bytes").decode("ascii"),
        "filename": "instruction.pdf",
    }


# --------------------------------------------------------------------------- #
# Happy path                                                                  #
# --------------------------------------------------------------------------- #
def test_happy_path_returns_valid_ordered_12_field_payload(monkeypatch):
    record = _load_fixture("parser_record_complete.json")
    monkeypatch.setattr(parser_adapter, "run_parser", lambda *a, **k: record)

    resp = function_app.parse(_make_request(_valid_request_body()))
    assert resp.status_code == 200

    data = json.loads(resp.get_body())
    extraction = data["extraction"]

    # Exactly the 12 settled keys, in contract order.
    assert list(extraction.keys()) == list(EVA_FIELD_ORDER)
    assert len(extraction) == 12

    # Renamed parser fields landed on the EVA keys.
    assert extraction["date_of_loss"]["value"] == "01/02/2026"          # incident_date
    assert extraction["date_of_instruction"]["value"] == "05/02/2026"   # instruction_date
    assert extraction["work_provider"]["value"] == "Demo Provider"

    # EVA fields the parser does not emit are present-but-empty (not missing).
    assert extraction["claimant_telephone"]["value"] == ""
    assert extraction["claimant_email"]["value"] == ""

    # Per-field provenance shape.
    assert extraction["mileage"]["confidence"] == 0.75
    assert extraction["mileage"]["source"] == "mileage_regex"

    # The flat 12-field payload is schema-VALID -> no schema issues surfaced.
    assert data["issues"] == []
    assert data["contract_version"] == "cedocumentparser_v2.0_eva_json"

    # The flat payload validates directly against the keystone schema too.
    from schema_validation import validate_eva_payload

    flat = {k: cell["value"] for k, cell in extraction.items()}
    validate_eva_payload(flat)  # must not raise


def test_claimant_telephone_and_email_populate_when_derivable(monkeypatch):
    """ROADMAP B2: when the parser DERIVES claimant telephone/email from the
    document text, they flow through to the EVA fields (populated + provenanced),
    and the 12-field contract order/membership is unchanged."""
    record = _load_fixture("parser_record_with_contact.json")
    monkeypatch.setattr(parser_adapter, "run_parser", lambda *a, **k: record)

    resp = function_app.parse(_make_request(_valid_request_body()))
    assert resp.status_code == 200

    data = json.loads(resp.get_body())
    extraction = data["extraction"]

    # Contract membership + order unchanged (still exactly the 12 settled keys).
    assert list(extraction.keys()) == list(EVA_FIELD_ORDER)
    assert len(extraction) == 12

    # The two B2 fields are now POPULATED (normalised) with provenance.
    assert extraction["claimant_telephone"]["value"] == "07700900123"
    assert extraction["claimant_telephone"]["source"] == "fallback_telephone_claimant_label"
    assert extraction["claimant_telephone"]["confidence"] == 0.85

    assert extraction["claimant_email"]["value"] == "sample.claimant@example.co.uk"
    assert extraction["claimant_email"]["source"] == "fallback_email_claimant_label"
    assert extraction["claimant_email"]["confidence"] == 0.85

    # Populated contact details do not break the keystone schema (both are free
    # strings in the contract) and surface no schema issues.
    assert data["issues"] == []
    from schema_validation import validate_eva_payload

    flat = {k: cell["value"] for k, cell in extraction.items()}
    validate_eva_payload(flat)  # must not raise


def test_vrm_and_reference_are_surfaced_but_not_in_payload(monkeypatch):
    record = _load_fixture("parser_record_complete.json")
    monkeypatch.setattr(parser_adapter, "run_parser", lambda *a, **k: record)

    resp = function_app.parse(_make_request(_valid_request_body()))
    data = json.loads(resp.get_body())

    # vrm / reference surfaced at the top level (Case-identity).
    assert data["vrm"]["value"] == "AB12CDE"
    assert data["reference"]["value"] == "DEMO-0001"

    # ...and are NOT among the 12 EVA payload keys.
    assert "vrm" not in data["extraction"]
    assert "reference" not in data["extraction"]
    # inspection_date (native parser field) is also dropped from the EVA payload.
    assert "inspection_date" not in data["extraction"]


# --------------------------------------------------------------------------- #
# Bad input -> 400                                                            #
# --------------------------------------------------------------------------- #
def test_bad_base64_returns_400(monkeypatch):
    # run_parser should never even be reached; make it explode if it is.
    monkeypatch.setattr(
        parser_adapter, "run_parser", lambda *a, **k: pytest.fail("parser must not run on bad base64")
    )

    body = {"document": "this is not valid base64!!!", "filename": "instruction.pdf"}
    resp = function_app.parse(_make_request(body))
    assert resp.status_code == 400

    data = json.loads(resp.get_body())
    assert data["issues"][0]["code"] == "bad_base64"
    assert data["extraction"] is None


def test_missing_document_returns_400():
    resp = function_app.parse(_make_request({"filename": "instruction.pdf"}))
    assert resp.status_code == 400
    assert json.loads(resp.get_body())["issues"][0]["code"] == "missing_document"


def test_missing_filename_returns_400():
    body = {"document": base64.b64encode(b"x").decode("ascii")}
    resp = function_app.parse(_make_request(body))
    assert resp.status_code == 400
    assert json.loads(resp.get_body())["issues"][0]["code"] == "missing_filename"


def test_non_json_body_returns_400():
    resp = function_app.parse(_make_request(None, raw_body=b"not json at all"))
    assert resp.status_code == 400
    assert json.loads(resp.get_body())["issues"][0]["code"] == "bad_request"


def test_unsupported_extension_returns_400(monkeypatch):
    # Real adapter run_parser raises ValueError for unsupported suffix; the
    # handler maps ValueError -> 400. Use the real _suffix_for via run_parser.
    def fake_run_parser(document_bytes, filename, provider_hint=None):
        # mimic the adapter's own guard
        return parser_adapter._suffix_for(filename)  # raises ValueError

    monkeypatch.setattr(parser_adapter, "run_parser", fake_run_parser)
    body = {"document": base64.b64encode(b"x").decode("ascii"), "filename": "notes.txt"}
    resp = function_app.parse(_make_request(body))
    assert resp.status_code == 400
    assert json.loads(resp.get_body())["issues"][0]["code"] == "unsupported_document"


# --------------------------------------------------------------------------- #
# Parser failure -> 502                                                       #
# --------------------------------------------------------------------------- #
def test_parser_exception_returns_502(monkeypatch):
    def boom(*a, **k):
        raise ParserError("PyMuPDF blew up reading the PDF")

    monkeypatch.setattr(parser_adapter, "run_parser", boom)
    resp = function_app.parse(_make_request(_valid_request_body()))
    assert resp.status_code == 502

    data = json.loads(resp.get_body())
    assert data["issues"][0]["code"] == "parser_failed"
    assert "PyMuPDF" in data["issues"][0]["message"]


# --------------------------------------------------------------------------- #
# Incomplete extraction -> 200 with clear schema issues                       #
# --------------------------------------------------------------------------- #
def test_incomplete_extraction_surfaces_schema_issues(monkeypatch):
    record = _load_fixture("parser_record_incomplete.json")
    monkeypatch.setattr(parser_adapter, "run_parser", lambda *a, **k: record)

    resp = function_app.parse(_make_request(_valid_request_body()))
    # An incomplete parse is NOT a server error: staff complete the case. 200.
    assert resp.status_code == 200

    data = json.loads(resp.get_body())
    extraction = data["extraction"]

    # Still exactly 12 keys in order even when the parse is thin.
    assert list(extraction.keys()) == list(EVA_FIELD_ORDER)

    # work_provider / vehicle_model are blank (schema-required non-empty) and the
    # malformed date_of_loss violates the DD/MM/YYYY pattern -> schema issues.
    issues = data["issues"]
    assert issues, "expected schema issues for an incomplete extraction"
    fields_flagged = {i["field"] for i in issues}
    # work_provider and vehicle_model both fail minLength=1.
    assert "work_provider" in fields_flagged
    assert "vehicle_model" in fields_flagged
    # date_of_loss fails the date pattern.
    assert "date_of_loss" in fields_flagged

    # Each issue is structured: code + message always present; field may be None
    # for parser-level (non-field) issues but present for schema issues.
    for issue in issues:
        assert "field" in issue
        assert issue["code"]
        assert issue["message"]

    # The schema-derived issues specifically all carry a field name.
    schema_issues = [i for i in issues if i.get("severity") == "error" and i["field"] in fields_flagged]
    assert all(i["field"] for i in schema_issues)


def test_incomplete_extraction_payload_actually_fails_schema(monkeypatch):
    """Belt-and-braces: the projected flat payload genuinely fails the schema."""
    record = _load_fixture("parser_record_incomplete.json")
    mapped = parser_adapter.to_eva_extraction(record)
    flat = {k: cell["value"] for k, cell in mapped["extraction"].items()}

    from schema_validation import SchemaValidationError, validate_eva_payload

    with pytest.raises(SchemaValidationError) as exc_info:
        validate_eva_payload(flat)
    offending = {i["field"] for i in exc_info.value.issues}
    assert "work_provider" in offending

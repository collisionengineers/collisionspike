"""Regression suite for the parser Function's tolerant base64 decode.

An upstream transport may wrap an already base64-encoded ``document`` value.
``function_app._decode_document`` therefore decodes once and, only when the result
is itself strict base64, decodes exactly once more. The second result is accepted
only when it has a known document signature, and every recovery is logged.

These tests pin the tolerant contract:

  1. unit — ``_decode_document`` returns the real bytes for a SINGLE-encoded
     PDF/.docx/.doc, RECOVERS a DOUBLE-encoded binary doc, single-decodes
     text (never spuriously double-decoded), and still raises on corrupt base64;
  2. end-to-end — ``function_app.parse`` returns 200 and hands the parser the
     REAL document bytes for both single- and double-encoded input.

Real fixtures come from the sibling parser's instruction corpus
(``cedocumentmapper_v2.0/docs/Instructions/``). The path can be overridden with
``CE_INSTRUCTIONS_DIR``; if neither resolves, the corpus-backed tests SKIP (so a
checkout without the sibling repo still passes) while the synthetic tests always
run.
"""

from __future__ import annotations

import base64
import binascii
import json
import os
from pathlib import Path

import azure.functions as func
import pytest

import function_app
import parser_adapter

# --------------------------------------------------------------------------- #
# Locate the real instruction corpus (sibling repo), overridable via env.      #
# --------------------------------------------------------------------------- #
_DEFAULT_INSTRUCTIONS = (
    Path(__file__).resolve().parents[5]
    / "cedocumentmapper_v2.0"
    / "docs"
    / "Instructions"
)
_INSTRUCTIONS_DIR = Path(os.environ.get("CE_INSTRUCTIONS_DIR", _DEFAULT_INSTRUCTIONS))


def _fixture(name: str) -> bytes:
    path = _INSTRUCTIONS_DIR / name
    if not path.is_file():
        pytest.skip(f"instruction corpus fixture not present: {path}")
    return path.read_bytes()


# Representative real documents — one per reader/magic.
_PDF_NAME = "BLACK 01.pdf"          # %PDF
_DOCX_NAME = "ALISON WORD 01.docx"  # PK\x03\x04 (OOXML ZIP)
_DOC_NAME = "ALS 01.DOC"            # \xd0\xcf\x11\xe0 (OLE binary .doc)


def _single(data: bytes) -> str:
    """How a CORRECT caller encodes: one base64 layer."""
    return base64.b64encode(data).decode("ascii")


def _double(data: bytes) -> str:
    """A double-encoding caller/gateway: base64(base64(bytes)). Recovered by the Function."""
    return base64.b64encode(base64.b64encode(data)).decode("ascii")


# --------------------------------------------------------------------------- #
# Unit: _decode_document strictly single-decodes.                              #
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "fixture_name, magic",
    [
        (_PDF_NAME, b"%PDF"),
        (_DOCX_NAME, b"PK\x03\x04"),
        (_DOC_NAME, b"\xd0\xcf\x11\xe0"),
    ],
)
def test_single_encoded_binary_doc_decodes_to_real_bytes(fixture_name, magic):
    raw = _fixture(fixture_name)
    out = function_app._decode_document(_single(raw))
    assert out == raw
    assert out.startswith(magic)


@pytest.mark.parametrize(
    "fixture_name, magic",
    [
        (_PDF_NAME, b"%PDF"),
        (_DOCX_NAME, b"PK\x03\x04"),
        (_DOC_NAME, b"\xd0\xcf\x11\xe0"),
    ],
)
def test_double_encoded_binary_doc_is_recovered(fixture_name, magic):
    """A double-encoded document IS recovered: the decoder peels the redundant
    second base64 layer and returns the REAL bytes (magic intact)."""
    raw = _fixture(fixture_name)
    out = function_app._decode_document(_double(raw))
    assert out == raw
    assert out.startswith(magic)


def test_single_encoded_textlike_payload_is_decoded_once():
    """A single-encoded .eml/.txt body decodes to its original text — one layer."""
    eml = (
        b"From: claimant@example.co.uk\r\n"
        b"Subject: Engineer Instruction\r\n\r\n"
        b"Please inspect the vehicle, reg BC23JZE.\r\n"
    )
    out = function_app._decode_document(_single(eml))
    assert out == eml


# --------------------------------------------------------------------------- #
# Unit: genuinely-corrupt base64 still raises (handler maps these to 400).      #
# --------------------------------------------------------------------------- #
def test_corrupt_base64_still_raises():
    with pytest.raises((binascii.Error, ValueError)):
        function_app._decode_document("this is not valid base64!!!")


def test_empty_string_decodes_empty():
    # Empty in -> empty out; the handler separately rejects this as
    # empty_document (400). _decode_document itself must not blow up.
    assert function_app._decode_document("") == b""


# --------------------------------------------------------------------------- #
# End-to-end: parse() — single -> 200; double -> 200 (RECOVERED, not surfaced). #
# The decoder peels the redundant base64 layer so the parser seam receives the   #
# REAL document bytes; see test_parse_handler_double_encoded_pdf_recovered_200.  #
# --------------------------------------------------------------------------- #
def _make_request(body: dict) -> func.HttpRequest:
    return func.HttpRequest(
        method="POST",
        url="http://localhost/api/parse",
        headers={"Content-Type": "application/json"},
        body=json.dumps(body).encode("utf-8"),
    )


def _capture_bytes_parser(captured: dict):
    """A fake run_parser that records the bytes it was handed and returns a
    minimal valid record so parse() completes with 200."""

    def _fake(document_bytes, filename, provider_hint=None):
        captured["bytes"] = document_bytes
        captured["filename"] = filename
        return {"provider": {}, "fields": {}, "issues": []}

    return _fake


@pytest.mark.parametrize(
    "fixture_name, magic",
    [
        (_PDF_NAME, b"%PDF"),
        (_DOCX_NAME, b"PK\x03\x04"),
        (_DOC_NAME, b"\xd0\xcf\x11\xe0"),
    ],
)
def test_parse_handler_passes_single_encoded_bytes_to_parser(monkeypatch, fixture_name, magic):
    """A single-encoded binary doc reaches the parser seam as the EXACT original
    bytes (magic intact) and the request completes 200."""
    raw = _fixture(fixture_name)
    captured: dict = {}
    monkeypatch.setattr(parser_adapter, "run_parser", _capture_bytes_parser(captured))

    suffix = Path(fixture_name).suffix or ".pdf"
    resp = function_app.parse(
        _make_request({"document": _single(raw), "filename": f"instruction{suffix}"})
    )

    assert captured.get("bytes") == raw
    assert captured["bytes"].startswith(magic)
    assert resp.status_code == 200


def test_parse_handler_double_encoded_pdf_recovered_200(monkeypatch):
    """A DOUBLE-encoded document IS recovered: the parser seam receives the REAL
    PDF bytes (magic intact) and the request completes 200 — the gateway's
    redundant second base64 layer is peeled, not surfaced as an error."""
    raw = _fixture(_PDF_NAME)
    captured: dict = {}
    monkeypatch.setattr(parser_adapter, "run_parser", _capture_bytes_parser(captured))

    resp = function_app.parse(
        _make_request({"document": _double(raw), "filename": "instruction.pdf"})
    )

    assert captured.get("bytes") == raw
    assert captured["bytes"].startswith(b"%PDF")
    assert resp.status_code == 200


def test_parse_handler_single_decodes_textlike_eml(monkeypatch):
    """A single-encoded .eml-like payload reaches the parser as its ORIGINAL
    text (single-decoded only)."""
    eml = (
        b"From: claimant@example.co.uk\r\n"
        b"Subject: Engineer Instruction\r\n\r\n"
        b"Reg BC23JZE; please inspect.\r\n"
    )
    captured: dict = {}
    monkeypatch.setattr(parser_adapter, "run_parser", _capture_bytes_parser(captured))

    resp = function_app.parse(
        _make_request({"document": _single(eml), "filename": "instruction.eml"})
    )

    assert captured.get("bytes") == eml
    assert resp.status_code == 200

"""Tests for the parser /explode-eml route (ADR-0022 R2 retro reconstruction).

WRAPPER-ONLY route (Python stdlib ``email``) — no cedocumentmapper_v2 engine, no
PyMuPDF. Fixtures are built in-memory with ``email.message.EmailMessage`` so the
suite needs no binary samples.
"""

from __future__ import annotations

import base64
import json
import sys
from email.message import EmailMessage
from pathlib import Path

import azure.functions as func

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import function_app  # noqa: E402


def _make_request(body: dict | None, raw_body: bytes | None = None) -> func.HttpRequest:
    payload = raw_body if raw_body is not None else json.dumps(body).encode("utf-8")
    return func.HttpRequest(
        method="POST",
        url="http://localhost/api/explode-eml",
        headers={"Content-Type": "application/json"},
        body=payload,
    )


def _call(body: dict | None, raw_body: bytes | None = None) -> tuple[int, dict]:
    resp = function_app.explode_eml(_make_request(body, raw_body))
    return resp.status_code, json.loads(resp.get_body())


def _eml_request(raw: bytes, filename: str = "original.eml") -> dict:
    return {"document": base64.b64encode(raw).decode("ascii"), "filename": filename}


def _instruction_eml() -> bytes:
    msg = EmailMessage()
    msg["Subject"] = "New Instruction - KA08 XTR"
    msg["From"] = "claims@pch-ltd.com"
    msg["To"] = "info@collisionengineers.co.uk"
    msg["Date"] = "Mon, 02 Mar 2026 09:15:00 +0000"
    msg["Message-ID"] = "<orig-123@pch-ltd.com>"
    msg.set_content("Please inspect KA08 XTR. Our Ref 575689.")
    msg.add_attachment(
        b"%PDF-1.7 fake instruction bytes",
        maintype="application",
        subtype="pdf",
        filename="instruction letter.pdf",
    )
    # A footer logo well under the signature floor — must be SKIPPED, not evidence.
    msg.add_attachment(
        b"\x89PNG tiny logo",
        maintype="image",
        subtype="png",
        filename="image001.png",
    )
    return msg.as_bytes()


def test_explodes_headers_body_and_attachments():
    status, out = _call(_eml_request(_instruction_eml()))
    assert status == 200
    assert out["subject"] == "New Instruction - KA08 XTR"
    assert out["from"].endswith("claims@pch-ltd.com")
    assert out["message_id"] == "<orig-123@pch-ltd.com>"
    assert out["date_iso"].startswith("2026-03-02T09:15:00")
    assert "Our Ref 575689" in out["body_text"]
    assert [a["filename"] for a in out["attachments"]] == ["instruction letter.pdf"]
    pdf = out["attachments"][0]
    assert pdf["content_type"] == "application/pdf"
    assert base64.b64decode(pdf["content_base64"]).startswith(b"%PDF-1.7")
    assert pdf["size"] == len(base64.b64decode(pdf["content_base64"]))
    assert len(pdf["sha256"]) == 64
    # The signature-sized raster is skipped with a named reason (TKT-047 doctrine).
    assert {"filename": "image001.png", "reason": "signature_image"} in out["skipped"]
    assert out["contract_version"] == "explode_eml_v1"


def test_html_only_body_is_stripped_to_text():
    msg = EmailMessage()
    msg["Subject"] = "Update"
    msg["From"] = "a@b.c"
    msg.set_content("<p>Claim <b>206848.001</b> update</p>", subtype="html")
    status, out = _call(_eml_request(msg.as_bytes()))
    assert status == 200
    assert "206848.001" in out["body_text"]
    assert "<p>" not in out["body_text"]


def test_nested_rfc822_reemitted_as_eml():
    inner = EmailMessage()
    inner["Subject"] = "Original instruction"
    inner["Message-ID"] = "<inner@x>"
    inner.set_content("the real instruction")

    outer = EmailMessage()
    outer["Subject"] = "FW: case"
    outer.set_content("see attached")
    outer.add_attachment(inner)  # message/rfc822 part

    status, out = _call(_eml_request(outer.as_bytes()))
    assert status == 200
    assert len(out["attachments"]) == 1
    att = out["attachments"][0]
    assert att["content_type"] == "message/rfc822"
    assert att["filename"].endswith(".eml")
    nested = base64.b64decode(att["content_base64"])
    assert b"Original instruction" in nested and b"<inner@x>" in nested


def test_missing_message_id_yields_empty_string_not_error():
    msg = EmailMessage()
    msg["Subject"] = "No id"
    msg.set_content("x")
    status, out = _call(_eml_request(msg.as_bytes()))
    assert status == 200
    assert out["message_id"] == ""


def test_oversized_attachment_is_skipped_not_fatal(monkeypatch):
    monkeypatch.setattr(function_app, "_EML_ATTACHMENT_MAX_BYTES", 10)
    msg = EmailMessage()
    msg["Subject"] = "big"
    msg.set_content("x")
    msg.add_attachment(b"0123456789ABCDEF", maintype="application", subtype="pdf", filename="big.pdf")
    status, out = _call(_eml_request(msg.as_bytes()))
    assert status == 200
    assert out["attachments"] == []
    assert {"filename": "big.pdf", "reason": "too_large"} in out["skipped"]


def test_request_validation_errors_are_typed():
    status, out = _call({"filename": "x.eml"})
    assert (status, out["issues"][0]["code"]) == (400, "missing_document")

    status, out = _call({"document": "@@not-base64@@"})
    assert (status, out["issues"][0]["code"]) == (400, "bad_base64")

    status, out = _call({"document": base64.b64encode(b"   ").decode("ascii")})
    assert (status, out["issues"][0]["code"]) == (422, "eml_unreadable")

    status, out = _call(None, raw_body=b"not json")
    assert (status, out["issues"][0]["code"]) == (400, "invalid_json")

"""Tests for the /explode-eml Outlook ``.msg`` branch (remediation CHANGE 15).

Box archives hold original instruction emails as RFC-822 ``.eml`` OR Outlook OLE
``.msg``; the route must unpack both into the SAME explode_eml_v1 shape.

Fixture: ``fixtures/SYNTHETIC_RETRO_MSG_01.msg`` — a genuine minimal OLE
compound document authored once by ``fixtures/make_synthetic_msg.py`` (pywin32
``StgCreateDocfile`` + hand-assembled MS-OXMSG property streams; extract_msg
cannot WRITE .msg files). Synthetic data only: from test@example.com, to
engineers@collisionengineers.co.uk, subject 'Synthetic retro msg fixture',
short body, one note.txt attachment. Regenerate (Windows-only) with:

    python tests/fixtures/make_synthetic_msg.py tests/fixtures/SYNTHETIC_RETRO_MSG_01.msg

The embedded-Outlook-item and RTF/HTML body fallback seams are unit-tested via a
monkeypatched ``extract_msg.Message`` (authoring a nested .msg fixture is not
worth the format surface).
"""

from __future__ import annotations

import base64
import json
import sys
from email.message import EmailMessage
from pathlib import Path

import azure.functions as func
import extract_msg

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import function_app  # noqa: E402

MSG_FIXTURE = HERE / "fixtures" / "SYNTHETIC_RETRO_MSG_01.msg"
OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"


def _make_request(body: dict) -> func.HttpRequest:
    return func.HttpRequest(
        method="POST",
        url="http://localhost/api/explode-eml",
        headers={"Content-Type": "application/json"},
        body=json.dumps(body).encode("utf-8"),
    )


def _call(body: dict) -> tuple[int, dict]:
    resp = function_app.explode_eml(_make_request(body))
    return resp.status_code, json.loads(resp.get_body())


def _request(raw: bytes, filename: str | None = "original.msg") -> dict:
    body = {"document": base64.b64encode(raw).decode("ascii")}
    if filename is not None:
        body["filename"] = filename
    return body


def test_fixture_is_a_real_ole_msg():
    raw = MSG_FIXTURE.read_bytes()
    assert raw.startswith(OLE_MAGIC)


def test_explodes_msg_headers_body_and_attachments():
    status, out = _call(_request(MSG_FIXTURE.read_bytes()))
    assert status == 200
    assert out["subject"] == "Synthetic retro msg fixture"
    assert "test@example.com" in out["from"]
    assert "engineers@collisionengineers.co.uk" in out["to"]
    assert out["date_iso"].startswith("2026-03-02T09:15:00")
    assert out["message_id"] == "<synthetic-retro-msg-fixture@example.com>"
    assert out["in_reply_to"] == "<synthetic-parent@example.com>"
    assert "<synthetic-root@example.com>" in out["references"]
    assert "Ref 999999" in out["body_text"]
    assert [a["filename"] for a in out["attachments"]] == ["note.txt"]
    att = out["attachments"][0]
    assert att["content_type"] == "text/plain"
    content = base64.b64decode(att["content_base64"])
    assert content == b"synthetic attachment payload\n"
    assert att["size"] == len(content)
    assert len(att["sha256"]) == 64
    assert out["skipped"] == []
    assert out["contract_version"] == "explode_eml_v1"


def test_msg_detected_by_ole_magic_without_filename():
    """Routing must not depend on the caller passing a filename."""
    status, out = _call(_request(MSG_FIXTURE.read_bytes(), filename=None))
    assert status == 200
    assert out["subject"] == "Synthetic retro msg fixture"


def test_msg_named_but_not_ole_is_typed_422():
    """A .msg filename with non-OLE bytes routes to the msg branch and fails
    typed — never a raw 500."""
    status, out = _call(_request(b"From: a@b.c\r\n\r\nnot an ole file", filename="mislabeled.msg"))
    assert status == 422
    assert out["issues"][0]["code"] == "msg_unreadable"
    assert out["contract_version"] == "explode_eml_v1"


def test_corrupt_ole_msg_is_typed_422():
    status, out = _call(_request(OLE_MAGIC + b"\x00" * 128))
    assert status == 422
    assert out["issues"][0]["code"] == "msg_unreadable"


def test_eml_path_still_works_when_filename_says_eml():
    """Regression: the RFC-822 branch is untouched by the .msg routing."""
    msg = EmailMessage()
    msg["Subject"] = "Plain eml"
    msg["From"] = "a@b.c"
    msg.set_content("still fine")
    status, out = _call(
        {"document": base64.b64encode(msg.as_bytes()).decode("ascii"), "filename": "original.eml"}
    )
    assert status == 200
    assert out["subject"] == "Plain eml"
    assert "still fine" in out["body_text"]


def test_msg_attachment_caps_apply(monkeypatch):
    """The shared size discipline covers the .msg branch too."""
    monkeypatch.setattr(function_app, "_EML_ATTACHMENT_MAX_BYTES", 10)
    status, out = _call(_request(MSG_FIXTURE.read_bytes()))
    assert status == 200
    assert out["attachments"] == []
    assert {"filename": "note.txt", "reason": "too_large"} in out["skipped"]


class _FakeEmbedded:
    """Stands in for an embedded Outlook item (extract_msg MSGFile)."""

    def exportBytes(self) -> bytes:  # noqa: N802 - extract_msg API name
        return OLE_MAGIC + b"embedded synthetic"


class _FakeAttachment:
    def __init__(self, name: str, data: object):
        self.longFilename = name
        self.shortFilename = name
        self.displayName = name
        self.mimetype = None
        self.data = data


class _FakeMsg:
    subject = "Fake"
    sender = "test@example.com"
    to = "engineers@collisionengineers.co.uk"
    date = None
    messageId = "<fake@example.com>"
    inReplyTo = ""
    header = None
    body = ""
    htmlBody = "<html><body><p>Claim <b>123456</b> update</p></body></html>"

    def __init__(self, raw: object):
        self.attachments = [
            _FakeAttachment("Forwarded instruction", _FakeEmbedded()),
            _FakeAttachment("mystery-part", object()),
        ]

    def close(self) -> None:
        pass


def test_embedded_msg_reemitted_and_html_body_stripped(monkeypatch):
    """Embedded Outlook items come back as raw .msg bytes (parity with nested
    message/rfc822 -> .eml); unexportable parts are skipped, not fatal. An
    empty plain body falls back to text-stripped HTML."""
    monkeypatch.setattr(extract_msg, "Message", _FakeMsg)
    status, out = _call(_request(OLE_MAGIC + b"routed to fake"))
    assert status == 200
    assert "123456" in out["body_text"]
    assert "<p>" not in out["body_text"]
    assert [a["filename"] for a in out["attachments"]] == ["Forwarded instruction.msg"]
    att = out["attachments"][0]
    assert att["content_type"] == "application/vnd.ms-outlook"
    assert base64.b64decode(att["content_base64"]).startswith(OLE_MAGIC)
    assert {"filename": "mystery-part", "reason": "unsupported_part"} in out["skipped"]

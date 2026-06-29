"""Route-level tests for the box/folders/{folderId}/files upload facade.

The route is a thin wrapper (gate -> validate -> base64-decode -> delegate to
BoxClient.upload_file, which the client/scope tests cover in depth). These pin the
wrapper itself: the BOX_API_ENABLED gate, request validation, base64 decoding, and
that it delegates the decoded bytes to the client unchanged. No Box/network.
"""

from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))

import function_app  # noqa: E402


def _req(folder_id: str, body_obj: dict) -> "function_app.func.HttpRequest":
    return function_app.func.HttpRequest(
        method="POST",
        url=f"/api/box/folders/{folder_id}/files",
        body=json.dumps(body_obj).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        route_params={"folderId": folder_id},
    )


def test_upload_route_gated_off_returns_503(monkeypatch):
    monkeypatch.delenv("BOX_API_ENABLED", raising=False)
    resp = function_app.upload_file(_req("777", {"filename": "a.eml", "contentBase64": "QQ=="}))
    assert resp.status_code == 503  # a gated-off Box op is NEVER a phantom 200


def test_upload_route_missing_fields_returns_400(monkeypatch):
    monkeypatch.setenv("BOX_API_ENABLED", "true")
    resp = function_app.upload_file(_req("777", {"filename": "a.eml"}))
    assert resp.status_code == 400


def test_upload_route_bad_base64_returns_400(monkeypatch):
    monkeypatch.setenv("BOX_API_ENABLED", "true")
    resp = function_app.upload_file(_req("777", {"filename": "a.eml", "contentBase64": "!!!not-b64"}))
    assert resp.status_code == 400


def test_upload_route_happy_path_delegates_decoded_bytes(monkeypatch):
    monkeypatch.setenv("BOX_API_ENABLED", "true")
    captured: dict = {}

    class FakeBox:
        def upload_file(self, folder_id, filename, content, content_type=None):
            captured.update(
                folder_id=folder_id, filename=filename, content=content, content_type=content_type
            )
            return {"id": "F1", "name": filename, "type": "file", "outcome": "created"}

        def close(self):
            pass

    monkeypatch.setattr(function_app, "BoxClient", lambda *a, **k: FakeBox())

    payload = base64.b64encode(b"raw-eml-bytes").decode("ascii")
    resp = function_app.upload_file(
        _req("777", {"filename": "message.eml", "contentBase64": payload, "contentType": "message/rfc822"})
    )
    assert resp.status_code == 200
    data = json.loads(resp.get_body())
    assert data["id"] == "F1"
    # The wrapper handed the DECODED bytes + folder/filename/content-type to the client.
    assert captured["folder_id"] == "777"
    assert captured["filename"] == "message.eml"
    assert captured["content"] == b"raw-eml-bytes"
    assert captured["content_type"] == "message/rfc822"

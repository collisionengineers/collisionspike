"""Route-level tests for the box/folders/{folderId}/files upload facade.

The route is a thin wrapper (gate -> validate -> lane-dispatch -> delegate to
BoxClient, which the client/scope tests cover in depth). These pin the wrapper
itself: the BOX_API_ENABLED gate, request validation, base64 decoding, the
TKT-142 dual-lane body contract ({ filename, contentBase64 | blobPath }), the
pre-decode base64 cap (413), the blobPath guard, and that each lane delegates
to the client unchanged. No Box/network (respx mocks the blob lane's MSI +
storage GETs).
"""

from __future__ import annotations

import base64
import hashlib
import json
import sys
import time
from pathlib import Path

import httpx
import pytest
import respx

FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))

import blob_source  # noqa: E402
import function_app  # noqa: E402


def _req(folder_id: str, body_obj: dict) -> "function_app.func.HttpRequest":
    return function_app.func.HttpRequest(
        method="POST",
        url=f"/api/box/folders/{folder_id}/files",
        body=json.dumps(body_obj).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        route_params={"folderId": folder_id},
    )


def _shared_link_req(folder_id: str, body_obj: dict | None) -> "function_app.func.HttpRequest":
    return function_app.func.HttpRequest(
        method="PUT",
        url=f"/api/box/folders/{folder_id}/shared-link",
        body=(json.dumps(body_obj).encode("utf-8") if body_obj is not None else b""),
        headers={"Content-Type": "application/json"},
        route_params={"folderId": folder_id},
    )


def _scope_req(folder_id: str) -> "function_app.func.HttpRequest":
    return function_app.func.HttpRequest(
        method="POST",
        url="/api/box/scope/write-check",
        body=json.dumps({"folderId": folder_id}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )


def test_write_scope_route_returns_the_facade_root(monkeypatch):
    monkeypatch.setenv("BOX_API_ENABLED", "true")

    class FakeBox:
        def verify_write_scope(self, folder_id):
            assert folder_id == "case-folder"
            return "392761581105"

        def close(self):
            pass

    monkeypatch.setattr(function_app, "BoxClient", lambda *a, **k: FakeBox())
    resp = function_app.verify_write_scope(_scope_req("case-folder"))
    assert resp.status_code == 200
    assert json.loads(resp.get_body()) == {"writable": True, "rootId": "392761581105"}


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


def test_upload_route_enforces_required_write_root_before_bytes_leave(monkeypatch):
    monkeypatch.setenv("BOX_API_ENABLED", "true")
    captured: dict = {}

    class FakeBox:
        def verify_write_scope(self, folder_id):
            captured["verified"] = folder_id
            return "392761581105"

        def upload_file(self, folder_id, filename, content, content_type=None):
            captured["uploaded"] = folder_id
            return {"id": "F1", "outcome": "created"}

        def close(self):
            pass

    monkeypatch.setattr(function_app, "BoxClient", lambda *a, **k: FakeBox())
    resp = function_app.upload_file(_req("case-folder", {
        "filename": "photo.jpg",
        "contentBase64": base64.b64encode(b"image").decode("ascii"),
        "contentType": "image/jpeg",
        "requiredWriteRootId": "392761581105",
    }))
    assert resp.status_code == 200
    assert captured == {"verified": "case-folder", "uploaded": "case-folder"}


def test_upload_route_refuses_wrong_required_write_root_without_upload(monkeypatch):
    monkeypatch.setenv("BOX_API_ENABLED", "true")
    uploaded = False

    class FakeBox:
        def verify_write_scope(self, _folder_id):
            return "wrong-root"

        def upload_file(self, *_args, **_kwargs):
            nonlocal uploaded
            uploaded = True
            return {"id": "unexpected"}

        def close(self):
            pass

    monkeypatch.setattr(function_app, "BoxClient", lambda *a, **k: FakeBox())
    resp = function_app.upload_file(_req("case-folder", {
        "filename": "photo.jpg",
        "contentBase64": base64.b64encode(b"image").decode("ascii"),
        "requiredWriteRootId": "392761581105",
    }))
    assert resp.status_code == 400
    assert uploaded is False


def test_autonomous_upload_rechecks_scope_and_refuses_folder_moved_after_first_upload(monkeypatch):
    monkeypatch.setenv("BOX_API_ENABLED", "true")
    checks = 0
    uploads = 0

    class FakeBox:
        def verify_write_scope(self, _folder_id):
            nonlocal checks
            checks += 1
            if checks == 2:
                raise function_app.BoxScopeError("folder moved outside root")
            return "392761581105"

        def upload_file(self, *_args, **_kwargs):
            nonlocal uploads
            uploads += 1
            return {"id": f"F{uploads}", "outcome": "created"}

        def close(self):
            pass

    monkeypatch.setattr(function_app, "BoxClient", lambda *a, **k: FakeBox())
    body = {
        "filename": "photo.jpg",
        "contentBase64": base64.b64encode(b"image").decode("ascii"),
        "requiredWriteRootId": "392761581105",
    }
    assert function_app.upload_file(_req("case-folder", body)).status_code == 200
    assert function_app.upload_file(_req("case-folder", body)).status_code == 400
    assert checks == 2
    assert uploads == 1


# ==========================================================================
# TKT-142 — dual-lane body contract, base64 cap, blobPath lane
# ==========================================================================

def test_upload_route_both_variants_returns_400(monkeypatch):
    monkeypatch.setenv("BOX_API_ENABLED", "true")
    resp = function_app.upload_file(
        _req("777", {"filename": "a.eml", "contentBase64": "QQ==", "blobPath": "cases/a.eml"})
    )
    assert resp.status_code == 400
    assert "exactly ONE" in json.loads(resp.get_body())["error"]


def test_upload_route_neither_variant_returns_400(monkeypatch):
    monkeypatch.setenv("BOX_API_ENABLED", "true")
    resp = function_app.upload_file(_req("777", {"filename": "a.eml"}))
    assert resp.status_code == 400


def test_upload_route_base64_oversize_413_before_decode(monkeypatch):
    monkeypatch.setenv("BOX_API_ENABLED", "true")
    monkeypatch.setenv("BOX_UPLOAD_BASE64_MAX_CHARS", "16")
    # DELIBERATELY invalid base64: if the route tried to decode it, we would see
    # a 400 — the 413 proves the LENGTH check fires before b64decode ever runs.
    resp = function_app.upload_file(
        _req("777", {"filename": "huge.eml", "contentBase64": "!" * 64})
    )
    assert resp.status_code == 413
    err = json.loads(resp.get_body())["error"]
    assert "blobPath" in err  # names the honest alternative


def test_upload_route_base64_within_cap_still_decodes(monkeypatch):
    monkeypatch.setenv("BOX_API_ENABLED", "true")
    monkeypatch.setenv("BOX_UPLOAD_BASE64_MAX_CHARS", "1024")

    class FakeBox:
        def upload_file(self, folder_id, filename, content, content_type=None):
            return {"id": "F1", "name": filename, "type": "file", "outcome": "created"}

        def close(self):
            pass

    monkeypatch.setattr(function_app, "BoxClient", lambda *a, **k: FakeBox())
    payload = base64.b64encode(b"small").decode("ascii")
    resp = function_app.upload_file(_req("777", {"filename": "a.eml", "contentBase64": payload}))
    assert resp.status_code == 200


@pytest.mark.parametrize(
    "bad_path",
    [
        "../other-container/steal.pdf",
        "/absolute/path.pdf",
        "https://evil.example.com/steal",
        "cases/../x.pdf",
        "",
    ],
)
def test_upload_route_blob_path_guard_rejects_400(monkeypatch, bad_path):
    monkeypatch.setenv("BOX_API_ENABLED", "true")
    # No respx active: a traversal/absolute path must be refused BEFORE any
    # storage request is built (a real request here would error loudly).
    resp = function_app.upload_file(_req("777", {"filename": "a.pdf", "blobPath": bad_path}))
    assert resp.status_code == 400


def test_upload_route_blob_config_missing_returns_502(monkeypatch):
    monkeypatch.setenv("BOX_API_ENABLED", "true")
    monkeypatch.delenv("EVIDENCE_BLOB_ACCOUNT", raising=False)
    resp = function_app.upload_file(
        _req("777", {"filename": "a.pdf", "blobPath": "cases/a.pdf"})
    )
    assert resp.status_code == 502


def _wire_blob_env(monkeypatch):
    monkeypatch.setenv("BOX_API_ENABLED", "true")
    monkeypatch.setenv("EVIDENCE_BLOB_ACCOUNT", "teststorage01")
    monkeypatch.setenv("EVIDENCE_BLOB_CONTAINER", "evidence")
    monkeypatch.setenv("IDENTITY_ENDPOINT", "http://localhost:8081/msi/token")
    monkeypatch.setenv("IDENTITY_HEADER", "FAKE-IDENTITY-HEADER")
    blob_source._TOKEN_CACHE.clear()


def _mock_blob_msi() -> None:
    respx.get("http://localhost:8081/msi/token").mock(
        return_value=httpx.Response(
            200,
            json={"access_token": "FAKE-MSI", "expires_on": str(int(time.time()) + 3600)},
        )
    )


@respx.mock
def test_upload_route_blob_lane_streams_to_box(monkeypatch):
    _wire_blob_env(monkeypatch)
    _mock_blob_msi()
    data = b"large-eml-bytes" * 100
    respx.get(
        "https://teststorage01.blob.core.windows.net/evidence/cases/ae1c0c84/message.eml"
    ).mock(return_value=httpx.Response(200, content=data))

    captured: dict = {}

    class FakeBox:
        def upload_file_stream(self, folder_id, filename, fileobj, *, size, sha1_hex,
                               content_type=None):
            captured.update(
                folder_id=folder_id, filename=filename, size=size, sha1=sha1_hex,
                content=fileobj.read(), content_type=content_type,
            )
            return {"id": "F9", "type": "file", "name": filename,
                    "outcome": "created", "lane": "direct"}

        def close(self):
            pass

    monkeypatch.setattr(function_app, "BoxClient", lambda *a, **k: FakeBox())
    resp = function_app.upload_file(
        _req("777", {"filename": "message.eml", "blobPath": "cases/ae1c0c84/message.eml",
                     "contentType": "message/rfc822"})
    )
    assert resp.status_code == 200
    out = json.loads(resp.get_body())
    # Today's contract fields survive; the honest extras ride alongside.
    assert out["id"] == "F9"
    assert out["outcome"] == "created"
    assert out["lane"] == "direct"
    assert out["bytes"] == len(data)
    assert out["sha256"] == hashlib.sha256(data).hexdigest()
    # The client received the STREAMED bytes + the spool-computed size/sha1.
    assert captured["folder_id"] == "777"
    assert captured["filename"] == "message.eml"
    assert captured["content"] == data
    assert captured["size"] == len(data)
    assert captured["sha1"] == hashlib.sha1(data).hexdigest()
    assert captured["content_type"] == "message/rfc822"


@respx.mock
def test_upload_route_blob_not_found_returns_404(monkeypatch):
    _wire_blob_env(monkeypatch)
    _mock_blob_msi()
    respx.get(
        "https://teststorage01.blob.core.windows.net/evidence/cases/nope.pdf"
    ).mock(return_value=httpx.Response(404))
    resp = function_app.upload_file(
        _req("777", {"filename": "nope.pdf", "blobPath": "cases/nope.pdf"})
    )
    assert resp.status_code == 404


def test_shared_link_route_rejects_open_access(monkeypatch):
    monkeypatch.setenv("BOX_API_ENABLED", "true")
    resp = function_app.get_shared_link_folder(
        _shared_link_req("777", {"shared_link": {"access": "open"}})
    )
    assert resp.status_code == 400


def test_shared_link_route_empty_body_does_not_default_to_open(monkeypatch):
    monkeypatch.setenv("BOX_API_ENABLED", "true")
    captured: dict = {}

    class FakeBox:
        def get_shared_link(self, item_type, item_id, body):
            captured.update(item_type=item_type, item_id=item_id, body=body)
            return {"id": item_id, "shared_link": None}

        def close(self):
            pass

    monkeypatch.setattr(function_app, "BoxClient", lambda *a, **k: FakeBox())
    resp = function_app.get_shared_link_folder(_shared_link_req("777", None))
    assert resp.status_code == 200
    assert captured == {"item_type": "folders", "item_id": "777", "body": {}}

"""Immutable deployed-parser fingerprint route (TKT-150)."""

from __future__ import annotations

import json

import azure.functions as func

import function_app


def _request() -> func.HttpRequest:
    return func.HttpRequest(
        method="GET",
        url="http://localhost/api/fingerprint",
        headers={},
        body=b"",
    )


def test_fingerprint_matches_the_committed_vendor_lock():
    lock = json.loads(function_app._VENDOR_LOCK_PATH.read_text(encoding="utf-8"))
    response = function_app.fingerprint(_request())

    assert response.status_code == 200
    assert json.loads(response.get_body()) == {
        "contract": "ce-parser-fingerprint-v1",
        "repository": lock["repository"],
        "ref": lock["ref"],
        "commit": lock["commit"],
        "vendored_file_count": lock["vendoredFileCount"],
        "content_sha256": lock["contentSha256"],
        "providers_sha256": lock["providersSha256"],
    }


def test_fingerprint_fails_closed_when_the_lock_is_unreadable(monkeypatch, tmp_path):
    missing = tmp_path / "missing-vendor-lock.json"
    monkeypatch.setattr(function_app, "_VENDOR_LOCK_PATH", missing)

    response = function_app.fingerprint(_request())

    assert response.status_code == 500
    assert json.loads(response.get_body()) == {"error": "fingerprint_unavailable"}

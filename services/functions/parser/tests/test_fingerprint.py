"""Deployed-parser content-identity fingerprint route."""

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


def test_fingerprint_matches_the_committed_engine_fingerprint():
    fingerprint_data = json.loads(
        function_app._ENGINE_FINGERPRINT_PATH.read_text(encoding="utf-8")
    )
    response = function_app.fingerprint(_request())

    assert response.status_code == 200
    assert json.loads(response.get_body()) == {
        "contract": "ce-parser-fingerprint-v1",
        "vendored_file_count": fingerprint_data["vendoredFileCount"],
        "content_sha256": fingerprint_data["contentSha256"],
    }


def test_fingerprint_fails_closed_when_unavailable(monkeypatch, tmp_path):
    missing = tmp_path / "missing-engine-fingerprint.json"
    monkeypatch.setattr(function_app, "_ENGINE_FINGERPRINT_PATH", missing)

    response = function_app.fingerprint(_request())

    assert response.status_code == 500
    assert json.loads(response.get_body()) == {"error": "fingerprint_unavailable"}

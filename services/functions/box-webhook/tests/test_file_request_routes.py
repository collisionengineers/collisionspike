"""Offline route-contract tests for TKT-156 File Request lifecycle scoping."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))

import function_app  # noqa: E402


class _FakeBox:
    def __init__(self) -> None:
        self.calls = []

    def get_file_request(self, file_request_id, *, expected_folder_id=None):
        self.calls.append(("get", file_request_id, expected_folder_id))
        return {"id": file_request_id, "folder": {"id": expected_folder_id}}

    def update_file_request(self, file_request_id, body, *, expected_folder_id):
        self.calls.append(("update", file_request_id, expected_folder_id, body))
        return {"id": file_request_id, "folder": {"id": expected_folder_id}, **body}

    def delete_file_request(self, file_request_id, *, expected_folder_id):
        self.calls.append(("delete", file_request_id, expected_folder_id))
        return {"deleted": True}


@pytest.fixture(autouse=True)
def _enabled(monkeypatch):
    monkeypatch.setenv("BOX_API_ENABLED", "true")


def _request(method: str, body: dict | None = None, folder_id: str | None = "398564730902"):
    query = f"?folderId={folder_id}" if folder_id is not None else ""
    return function_app.func.HttpRequest(
        method=method,
        url=f"https://example.test/api/box/file-requests/9001{query}",
        params={"folderId": folder_id} if folder_id is not None else {},
        route_params={"fileRequestId": "9001"},
        body=json.dumps(body or {}).encode(),
    )


def test_lifecycle_requires_expected_case_folder():
    response = function_app.file_request_lifecycle(_request("GET", folder_id=None))
    assert response.status_code == 400


def test_get_passes_expected_folder_to_the_scope_validating_client(monkeypatch):
    fake = _FakeBox()
    monkeypatch.setattr(function_app, "_run_box_op", lambda operation: function_app._json_response(operation(fake)))
    response = function_app.file_request_lifecycle(_request("GET"))
    assert response.status_code == 200
    assert fake.calls == [("get", "9001", "398564730902")]


def test_update_allows_only_reactivation_fields(monkeypatch):
    fake = _FakeBox()
    monkeypatch.setattr(function_app, "_run_box_op", lambda operation: function_app._json_response(operation(fake)))
    bad = function_app.file_request_lifecycle(
        _request("PUT", {"status": "active", "title": "attacker supplied"})
    )
    assert bad.status_code == 400
    assert fake.calls == []

    good = function_app.file_request_lifecycle(
        _request("PUT", {"status": "active", "expires_at": "2026-08-13T12:00:00Z"})
    )
    assert good.status_code == 200
    assert fake.calls == [(
        "update",
        "9001",
        "398564730902",
        {"status": "active", "expires_at": "2026-08-13T12:00:00Z"},
    )]

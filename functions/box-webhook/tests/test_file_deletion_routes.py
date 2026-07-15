"""Offline route-contract tests for TKT-160 exact-file deletion."""

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

    def validate_file_deletion(self, file_id, *, expected_folder_id):
        self.calls.append(("validate", file_id, expected_folder_id))
        return {"id": file_id, "status": "present"}

    def delete_file(self, file_id, *, expected_folder_id):
        self.calls.append(("delete", file_id, expected_folder_id))
        return {"id": file_id, "status": "deleted"}


@pytest.fixture(autouse=True)
def _enabled(monkeypatch):
    monkeypatch.setenv("BOX_API_ENABLED", "true")


def _request(method: str, folder_id: str | None = "398564730902"):
    query = f"?folderId={folder_id}" if folder_id is not None else ""
    return function_app.func.HttpRequest(
        method=method,
        url=f"https://example.test/api/box/files/photo-1{query}",
        params={"folderId": folder_id} if folder_id is not None else {},
        route_params={"fileId": "photo-1"},
        body=json.dumps({}).encode(),
    )


def test_file_route_requires_expected_case_folder():
    assert function_app.file_deletion(_request("GET", None)).status_code == 400


def test_get_is_validation_only(monkeypatch):
    fake = _FakeBox()
    monkeypatch.setattr(
        function_app,
        "_run_box_op",
        lambda operation: function_app._json_response(operation(fake)),
    )
    response = function_app.file_deletion(_request("GET"))
    assert response.status_code == 200
    assert fake.calls == [("validate", "photo-1", "398564730902")]


def test_delete_passes_only_file_and_expected_folder(monkeypatch):
    fake = _FakeBox()
    monkeypatch.setattr(
        function_app,
        "_run_box_op",
        lambda operation: function_app._json_response(operation(fake)),
    )
    response = function_app.file_deletion(_request("DELETE"))
    assert response.status_code == 200
    assert fake.calls == [("delete", "photo-1", "398564730902")]

"""Offline tests for the Layer-2 scope lock (BOX_ALLOWED_ROOT_ID).

[BUILD] — ZERO network, NO real secrets. Box token + REST mocked with respx.

The lock refuses any typed op whose target is outside the allowed root, BEFORE the
write reaches Box. The root passes free (no lookup); a descendant is confirmed once
via a cached path_collection GET; an out-of-scope id raises BoxScopeError. When
BOX_ALLOWED_ROOT_ID is unset the lock is a no-op (so the rest of the suite, which
uses parent "0", is unaffected).

    python -m pytest -q tests/test_scope_lock.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import httpx
import pytest
import respx

FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))

import box_client as bc  # noqa: E402
from box_client import BoxClient, BoxConfig, BoxScopeError  # noqa: E402

API_BASE = "https://api.box.com"
TOKEN_URL = f"{API_BASE}/oauth2/token"
ROOT = "392761581105"


@pytest.fixture(autouse=True)
def _clear_scope_cache():
    bc._SCOPE_VERIFIED.clear()
    yield
    bc._SCOPE_VERIFIED.clear()


def _client(allowed_root: str = ROOT) -> BoxClient:
    cfg = BoxConfig(
        client_id="cid",
        client_secret="sek",  # noqa: S106
        enterprise_id="1",
        api_base=API_BASE,
        allowed_root_id=allowed_root,
    )
    return BoxClient(config=cfg)


def _mock_token() -> None:
    respx.post(TOKEN_URL).mock(
        return_value=httpx.Response(200, json={"access_token": "T", "expires_in": 3599})
    )


@respx.mock
def test_create_folder_under_root_passes_without_scope_lookup():
    _mock_token()
    post = respx.post(f"{API_BASE}/2.0/folders").mock(
        return_value=httpx.Response(201, json={"id": "c1", "type": "folder", "name": "X"})
    )
    # No path_collection GET is mocked: a root parent must short-circuit (== root).
    out = _client().create_folder("X", ROOT)
    assert out["id"] == "c1"
    assert post.called


@respx.mock
def test_create_folder_out_of_scope_parent_raises_and_does_not_post():
    _mock_token()
    respx.get(f"{API_BASE}/2.0/folders/999").mock(
        return_value=httpx.Response(200, json={"id": "999", "path_collection": {"entries": [{"id": "0"}]}})
    )
    post = respx.post(f"{API_BASE}/2.0/folders").mock(return_value=httpx.Response(201, json={"id": "c"}))
    with pytest.raises(BoxScopeError):
        _client().create_folder("X", "999")
    assert not post.called  # refused before the write reaches Box


@respx.mock
def test_descendant_passes_via_path_collection_and_is_cached():
    _mock_token()
    scope_get = respx.get(f"{API_BASE}/2.0/folders/555").mock(
        return_value=httpx.Response(
            200, json={"id": "555", "path_collection": {"entries": [{"id": "0"}, {"id": ROOT}]}}
        )
    )
    respx.get(f"{API_BASE}/2.0/folders/555/items").mock(return_value=httpx.Response(200, json={"entries": []}))
    c = _client()
    c.list_folder("555")
    c.list_folder("555")  # second call hits the module cache — no second scope GET
    assert scope_get.call_count == 1


@respx.mock
def test_shared_link_out_of_scope_file_raises():
    _mock_token()
    respx.get(f"{API_BASE}/2.0/files/777").mock(
        return_value=httpx.Response(200, json={"id": "777", "path_collection": {"entries": [{"id": "0"}]}})
    )
    with pytest.raises(BoxScopeError):
        _client().get_shared_link("files", "777", {"shared_link": {"access": "open"}})


@respx.mock
def test_webhook_off_root_target_raises():
    _mock_token()
    respx.get(f"{API_BASE}/2.0/folders/888").mock(
        return_value=httpx.Response(200, json={"id": "888", "path_collection": {"entries": [{"id": "0"}]}})
    )
    with pytest.raises(BoxScopeError):
        _client().create_webhook({"id": "888", "type": "folder"}, "https://x/api/box-webhook", ["FILE.UPLOADED"])


@respx.mock
def test_lock_disabled_when_root_unset():
    _mock_token()
    respx.post(f"{API_BASE}/2.0/folders").mock(return_value=httpx.Response(201, json={"id": "c"}))
    out = _client(allowed_root="").create_folder("X", "999")  # no lock -> proceeds
    assert out["id"] == "c"

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
from box_client import BoxClient, BoxConfigError, BoxScopeError  # noqa: E402
from jwt_testkit import jwt_box_config  # noqa: E402

API_BASE = "https://api.box.com"
TOKEN_URL = f"{API_BASE}/oauth2/token"
ROOT = "392761581105"


@pytest.fixture(autouse=True)
def _clear_scope_cache():
    bc._SCOPE_VERIFIED.clear()
    bc._SCOPE_VERIFIED_RO.clear()
    yield
    bc._SCOPE_VERIFIED.clear()
    bc._SCOPE_VERIFIED_RO.clear()


def _client(allowed_root: str = ROOT) -> BoxClient:
    return BoxClient(config=jwt_box_config(allowed_root_id=allowed_root))


def _client_with_upload_base(upload_base: str) -> BoxClient:
    return BoxClient(config=jwt_box_config(allowed_root_id=ROOT, upload_base=upload_base))


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
def test_delete_file_revalidates_exact_case_folder_and_rw_root():
    _mock_token()
    folder = "case-1"
    respx.get(f"{API_BASE}/2.0/folders/{folder}").mock(
        return_value=httpx.Response(
            200, json={"id": folder, "path_collection": {"entries": [{"id": "0"}, {"id": ROOT}]}}
        )
    )
    file_get = respx.get(f"{API_BASE}/2.0/files/photo-1").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "photo-1",
                "name": "photo.jpg",
                "parent": {"id": folder},
                "path_collection": {"entries": [{"id": "0"}, {"id": ROOT}, {"id": folder}]},
            },
        )
    )
    deleted = respx.delete(f"{API_BASE}/2.0/files/photo-1").mock(
        return_value=httpx.Response(204)
    )
    assert _client().delete_file("photo-1", expected_folder_id=folder)["status"] == "deleted"
    assert file_get.call_count == 1
    assert deleted.call_count == 1


def test_delete_file_fails_closed_when_rw_root_is_unset():
    with pytest.raises(BoxScopeError, match="configured read-write root"):
        _client("").validate_file_deletion("photo-1", expected_folder_id="case-1")


@respx.mock
def test_delete_file_refuses_sibling_before_delete():
    _mock_token()
    folder = "case-1"
    respx.get(f"{API_BASE}/2.0/folders/{folder}").mock(
        return_value=httpx.Response(
            200, json={"id": folder, "path_collection": {"entries": [{"id": ROOT}]}}
        )
    )
    respx.get(f"{API_BASE}/2.0/files/photo-1").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "photo-1",
                "parent": {"id": "different-case"},
                "path_collection": {"entries": [{"id": ROOT}, {"id": "different-case"}]},
            },
        )
    )
    deleted = respx.delete(f"{API_BASE}/2.0/files/photo-1").mock(return_value=httpx.Response(204))
    with pytest.raises(BoxScopeError):
        _client().delete_file("photo-1", expected_folder_id=folder)
    assert not deleted.called


@respx.mock
def test_delete_file_missing_is_idempotent_after_folder_scope_validation():
    _mock_token()
    folder = "case-1"
    respx.get(f"{API_BASE}/2.0/folders/{folder}").mock(
        return_value=httpx.Response(
            200, json={"id": folder, "path_collection": {"entries": [{"id": ROOT}]}}
        )
    )
    respx.get(f"{API_BASE}/2.0/files/missing").mock(return_value=httpx.Response(404))
    deleted = respx.delete(f"{API_BASE}/2.0/files/missing").mock(return_value=httpx.Response(204))
    assert _client().delete_file("missing", expected_folder_id=folder)["status"] == "missing"
    assert not deleted.called


@respx.mock
def test_delete_file_never_accepts_readonly_archive_root():
    _mock_token()
    readonly = "legacy-root"
    folder = "legacy-case"
    respx.get(f"{API_BASE}/2.0/folders/{folder}").mock(
        return_value=httpx.Response(
            200, json={"id": folder, "path_collection": {"entries": [{"id": readonly}]}}
        )
    )
    client = BoxClient(
        config=jwt_box_config(allowed_root_id=ROOT, readonly_root_ids=(readonly,))
    )
    with pytest.raises(BoxScopeError):
        client.delete_file("photo-1", expected_folder_id=folder)


@respx.mock
def test_webhook_off_root_target_raises():
    _mock_token()
    respx.get(f"{API_BASE}/2.0/folders/888").mock(
        return_value=httpx.Response(200, json={"id": "888", "path_collection": {"entries": [{"id": "0"}]}})
    )
    with pytest.raises(BoxScopeError):
        _client().create_webhook({"id": "888", "type": "folder"}, "https://x/api/box-webhook", ["FILE.UPLOADED"])


@respx.mock
def test_copy_file_request_refuses_template_outside_root_before_copy():
    _mock_token()
    respx.get(f"{API_BASE}/2.0/file_requests/template-1").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "template-1",
                "folder": {"id": "outside-template", "type": "folder"},
                "status": "active",
                "url": "/f/template",
            },
        )
    )
    respx.get(f"{API_BASE}/2.0/folders/outside-template").mock(
        return_value=httpx.Response(
            200,
            json={"id": "outside-template", "path_collection": {"entries": [{"id": "0"}]}},
        )
    )
    copied = respx.post(f"{API_BASE}/2.0/file_requests/template-1/copy").mock(
        return_value=httpx.Response(200, json={"id": "never"})
    )
    with pytest.raises(BoxScopeError):
        _client().copy_file_request("template-1", ROOT)
    assert not copied.called


@respx.mock
def test_file_request_lifecycle_requires_the_expected_case_folder_before_update():
    _mock_token()
    respx.get(f"{API_BASE}/2.0/file_requests/9001").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "9001",
                "folder": {"id": "other-case", "type": "folder"},
                "status": "inactive",
                "url": "/f/token",
            },
        )
    )
    updated = respx.put(f"{API_BASE}/2.0/file_requests/9001").mock(
        return_value=httpx.Response(200, json={})
    )
    with pytest.raises(BoxScopeError):
        _client().update_file_request(
            "9001",
            {"status": "active"},
            expected_folder_id="expected-case",
        )
    assert not updated.called


@respx.mock
def test_file_request_reuse_ignores_a_stale_scope_cache_after_folder_move():
    _mock_token()
    # Simulate a warm worker which verified the case folder before an admin moved it.
    bc._SCOPE_VERIFIED.add("case-folder")
    respx.get(f"{API_BASE}/2.0/file_requests/9001").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "9001",
                "folder": {"id": "case-folder", "type": "folder"},
                "status": "active",
                "url": "/f/token",
            },
        )
    )
    scope_get = respx.get(f"{API_BASE}/2.0/folders/case-folder").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "case-folder",
                "path_collection": {"entries": [{"id": "0"}]},
            },
        )
    )
    with pytest.raises(BoxScopeError):
        _client().get_file_request("9001", expected_folder_id="case-folder")
    assert scope_get.called


@respx.mock
def test_lock_disabled_when_root_unset():
    _mock_token()
    respx.post(f"{API_BASE}/2.0/folders").mock(return_value=httpx.Response(201, json={"id": "c"}))
    out = _client(allowed_root="").create_folder("X", "999")  # no lock -> proceeds
    assert out["id"] == "c"


def test_strict_write_scope_refuses_when_root_unset():
    with pytest.raises(BoxScopeError, match="requires BOX_ALLOWED_ROOT_ID"):
        _client(allowed_root="").verify_write_scope("999")


@respx.mock
def test_strict_write_scope_attests_root_and_descendant_but_refuses_outside():
    assert _client().verify_write_scope(ROOT) == ROOT

    _mock_token()
    respx.get(f"{API_BASE}/2.0/folders/555").mock(
        return_value=httpx.Response(
            200, json={"id": "555", "path_collection": {"entries": [{"id": ROOT}]}}
        )
    )
    assert _client().verify_write_scope("555") == ROOT

    respx.get(f"{API_BASE}/2.0/folders/999").mock(
        return_value=httpx.Response(
            200, json={"id": "999", "path_collection": {"entries": [{"id": "0"}]}}
        )
    )
    with pytest.raises(BoxScopeError):
        _client().verify_write_scope("999")


@respx.mock
def test_strict_write_scope_rechecks_cached_folder_and_observes_a_move_outside_root():
    """Regression: a folder verified under the root and then moved must be refused.

    The ordinary guard may cache the first ancestry result; the autonomous strict
    attestation must bypass that cache immediately before every upload.
    """
    _mock_token()
    scope_get = respx.get(f"{API_BASE}/2.0/folders/557").mock(
        side_effect=[
            httpx.Response(
                200,
                json={"id": "557", "path_collection": {"entries": [{"id": ROOT}]}},
            ),
            httpx.Response(
                200,
                json={"id": "557", "path_collection": {"entries": [{"id": "0"}]}},
            ),
        ]
    )
    client = _client()
    assert client.verify_write_scope("557") == ROOT
    bc._SCOPE_VERIFIED.add("557")  # prove the strict path does not trust this cache
    with pytest.raises(BoxScopeError):
        client.verify_write_scope("557")
    assert scope_get.call_count == 2


# --- UploadFile is scope-locked too (the archive mirror must stay in the test root) ---

UPLOAD_URL = "https://upload.box.com/api/2.0/files/content"


@respx.mock
def test_upload_under_root_passes_without_scope_lookup():
    _mock_token()
    up = respx.post(UPLOAD_URL).mock(
        return_value=httpx.Response(201, json={"entries": [{"id": "f", "name": "a.pdf"}]})
    )
    out = _client().upload_file(ROOT, "a.pdf", b"bytes")  # parent == root short-circuits
    assert out["id"] == "f"
    assert up.called


@respx.mock
def test_upload_out_of_scope_folder_raises_and_does_not_upload():
    _mock_token()
    respx.get(f"{API_BASE}/2.0/folders/999").mock(
        return_value=httpx.Response(200, json={"id": "999", "path_collection": {"entries": [{"id": "0"}]}})
    )
    up = respx.post(UPLOAD_URL).mock(return_value=httpx.Response(201, json={"entries": [{"id": "f"}]}))
    with pytest.raises(BoxScopeError):
        _client().upload_file("999", "a.pdf", b"bytes")
    assert not up.called  # refused before the bytes reach Box


@respx.mock
def test_upload_descendant_passes_via_path_collection():
    _mock_token()
    respx.get(f"{API_BASE}/2.0/folders/555").mock(
        return_value=httpx.Response(
            200, json={"id": "555", "path_collection": {"entries": [{"id": "0"}, {"id": ROOT}]}}
        )
    )
    up = respx.post(UPLOAD_URL).mock(
        return_value=httpx.Response(201, json={"entries": [{"id": "f"}]})
    )
    out = _client().upload_file("555", "a.pdf", b"bytes")  # case subfolder under the root
    assert out["id"] == "f"
    assert up.called


@respx.mock
@pytest.mark.parametrize(
    "upload_base",
    [
        "http://upload.box.com",
        "https://upload.box.com.evil.example",
        "https://example.com",
    ],
)
def test_upload_base_must_be_https_box_host(upload_base):
    up = respx.post(f"{upload_base}/api/2.0/files/content").mock(
        return_value=httpx.Response(201, json={"entries": [{"id": "f"}]})
    )
    with pytest.raises(BoxConfigError):
        _client_with_upload_base(upload_base).upload_file(ROOT, "a.pdf", b"bytes")
    assert not up.called


# --- READ-ONLY archive roots (ADR-0022 R2): reads pass, writes REFUSE ---------------

RO_ROOT = "777000111222"


def _ro_client() -> BoxClient:
    return BoxClient(config=jwt_box_config(allowed_root_id=ROOT, readonly_root_ids=(RO_ROOT,)))


def _mock_scope_probe(item_type: str, item_id: str, ancestor_id: str) -> None:
    respx.get(f"{API_BASE}/2.0/{item_type}/{item_id}").mock(
        return_value=httpx.Response(
            200,
            json={"id": item_id, "path_collection": {"entries": [{"id": "0"}, {"id": ancestor_id}]}},
        )
    )


@respx.mock
def test_ro_root_itself_is_listable():
    _mock_token()
    listing = respx.get(f"{API_BASE}/2.0/folders/{RO_ROOT}/items").mock(
        return_value=httpx.Response(200, json={"entries": []})
    )
    _ro_client().list_folder(RO_ROOT)  # an RO root short-circuits the readable guard
    assert listing.called


@respx.mock
def test_ro_descendant_read_passes_but_write_refuses():
    """THE load-bearing matrix: the same RO-rooted folder id may be listed but never
    uploaded into — and the RO verification must not poison the write cache."""
    _mock_token()
    _mock_scope_probe("folders", "555", RO_ROOT)
    respx.get(f"{API_BASE}/2.0/folders/555/items").mock(
        return_value=httpx.Response(200, json={"entries": []})
    )
    up = respx.post(UPLOAD_URL).mock(
        return_value=httpx.Response(201, json={"entries": [{"id": "f"}]})
    )
    c = _ro_client()
    c.list_folder("555")  # read: allowed (verified under the RO root)
    assert "555" in bc._SCOPE_VERIFIED_RO
    assert "555" not in bc._SCOPE_VERIFIED  # the split — RO never enters the RW cache
    with pytest.raises(BoxScopeError):
        c.upload_file("555", "a.pdf", b"bytes")  # write: refused
    assert not up.called


@respx.mock
def test_rw_descendant_read_populates_rw_cache():
    _mock_token()
    _mock_scope_probe("folders", "556", ROOT)
    respx.get(f"{API_BASE}/2.0/folders/556/items").mock(
        return_value=httpx.Response(200, json={"entries": []})
    )
    _ro_client().list_folder("556")
    assert "556" in bc._SCOPE_VERIFIED  # genuinely RW-rooted — writes may reuse it


@respx.mock
def test_read_outside_every_root_refuses():
    _mock_token()
    _mock_scope_probe("folders", "999", "313131")  # under neither root
    with pytest.raises(BoxScopeError):
        _ro_client().list_folder("999")


@respx.mock
def test_search_roots_must_be_configured_roots():
    _mock_token()
    c = _ro_client()
    with pytest.raises(BoxScopeError):
        c.search_content("CCPY26050", ["313131"])  # a root we never configured
    with pytest.raises(BoxScopeError):
        c.search_content("CCPY26050", [])


@respx.mock
def test_search_post_filters_out_of_root_hits():
    _mock_token()
    respx.get(f"{API_BASE}/2.0/search").mock(
        return_value=httpx.Response(
            200,
            json={
                "total_count": 2,
                "entries": [
                    {
                        "id": "f1", "name": "instruction.eml", "type": "file",
                        "path_collection": {"entries": [{"id": "0"}, {"id": RO_ROOT}, {"id": "case1", "name": "CCPY26050"}]},
                    },
                    {
                        "id": "f2", "name": "leak.eml", "type": "file",
                        # ancestor_folder_ids treated as ADVISORY — this hit claims no root ancestry
                        "path_collection": {"entries": [{"id": "0"}, {"id": "424242"}]},
                    },
                ],
            },
        )
    )
    out = _ro_client().search_content("CCPY26050", [RO_ROOT])
    assert [e["id"] for e in out["entries"]] == ["f1"]
    assert out["filtered_out"] == 1


@respx.mock
def test_download_of_ro_file_passes_write_of_same_refuses():
    _mock_token()
    # One mock serves BOTH the scope probe (fields=id,path_collection) and the
    # metadata pre-fetch (fields=id,name,size,sha1) — a superset body.
    respx.get(f"{API_BASE}/2.0/files/f9").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "f9", "name": "orig.eml", "size": 5, "sha1": "abc",
                "path_collection": {"entries": [{"id": "0"}, {"id": RO_ROOT}]},
            },
        )
    )
    respx.get(f"{API_BASE}/2.0/files/f9/content").mock(
        return_value=httpx.Response(
            302, headers={"Location": "https://dl.boxcloud.com/d/1/f9"}
        )
    )
    respx.get("https://dl.boxcloud.com/d/1/f9").mock(
        return_value=httpx.Response(200, content=b"bytes")
    )
    out = _ro_client().download_file("f9")
    assert out["content"] == b"bytes"
    assert out["name"] == "orig.eml"
    assert "f9" in bc._SCOPE_VERIFIED_RO and "f9" not in bc._SCOPE_VERIFIED

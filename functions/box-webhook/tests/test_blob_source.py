"""TKT-142 — the evidence-blob source (strict path guard, MSI mint, spooled fetch).

[BUILD] — ZERO network, NO secrets. The MSI endpoint and the blob GET are mocked
with respx. The SSRF/path-traversal guard is pinned hard: nothing that could
re-point the URL survives validation, and validation runs BEFORE any request.
"""

from __future__ import annotations

import hashlib
import sys
import time
from pathlib import Path

import httpx
import pytest
import respx

FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))

import blob_source  # noqa: E402
from blob_source import (  # noqa: E402
    BlobConfigError,
    BlobPathError,
    BlobSourceError,
    fetch_blob_to_spool,
    mint_storage_token,
    validate_blob_path,
)

MSI_ENDPOINT = "http://localhost:8081/msi/token"
FAKE_MSI_TOKEN = "FAKE.storage.msi-token.not-real"  # noqa: S105
ACCOUNT = "teststorage01"
BLOB_BASE = f"https://{ACCOUNT}.blob.core.windows.net/evidence"


@pytest.fixture(autouse=True)
def _blob_env(monkeypatch):
    monkeypatch.setenv("EVIDENCE_BLOB_ACCOUNT", ACCOUNT)
    monkeypatch.setenv("EVIDENCE_BLOB_CONTAINER", "evidence")
    monkeypatch.setenv("IDENTITY_ENDPOINT", MSI_ENDPOINT)
    monkeypatch.setenv("IDENTITY_HEADER", "FAKE-IDENTITY-HEADER")
    blob_source._TOKEN_CACHE.clear()
    yield
    blob_source._TOKEN_CACHE.clear()


def _mock_msi(expires_in_s: int = 3600) -> respx.Route:
    return respx.get(MSI_ENDPOINT).mock(
        return_value=httpx.Response(
            200,
            json={
                "access_token": FAKE_MSI_TOKEN,
                "expires_on": str(int(time.time()) + expires_in_s),
                "resource": "https://storage.azure.com/",
                "token_type": "Bearer",
            },
        )
    )


# ==========================================================================
# validate_blob_path — the SSRF / path-traversal guard
# ==========================================================================

@pytest.mark.parametrize(
    "bad_path",
    [
        "",                                   # empty
        "   ",                                # whitespace only
        "/abs/file.pdf",                      # leading slash
        "..",                                 # bare traversal
        "../secrets.pdf",                     # leading traversal
        "cases/../other-container/x.pdf",     # embedded traversal
        "cases/./x.pdf",                      # dot segment
        "cases//x.pdf",                       # empty segment
        "cases\\x.pdf",                       # backslash
        "https://evil.example.com/steal",     # absolute URL
        "c:/windows/system32",                # drive-colon absolute
        "cases/x.pdf?sig=abc",                # query metacharacter
        "cases/x.pdf#frag",                   # fragment metacharacter
        "a" * 1025,                           # over the blob-name ceiling
    ],
)
def test_validate_blob_path_rejects(bad_path):
    with pytest.raises(BlobPathError) as ei:
        validate_blob_path(bad_path)
    assert ei.value.status == 400


def test_validate_blob_path_rejects_non_string():
    with pytest.raises(BlobPathError):
        validate_blob_path(42)  # type: ignore[arg-type]


def test_validate_blob_path_accepts_relative_names():
    assert validate_blob_path("cases/ae1c0c84/message.eml") == "cases/ae1c0c84/message.eml"
    assert validate_blob_path("  padded.pdf  ") == "padded.pdf"
    assert validate_blob_path("with space/IMG 1.jpg") == "with space/IMG 1.jpg"


# ==========================================================================
# MSI token mint — cache + refresh margin + config
# ==========================================================================

@respx.mock
def test_msi_token_is_cached_across_mints():
    route = _mock_msi()
    with httpx.Client() as c:
        t1 = mint_storage_token(c)
        t2 = mint_storage_token(c)
    assert t1 == t2 == FAKE_MSI_TOKEN
    assert route.call_count == 1  # one mint serves both
    # The identity header rode the request; the token value never left it.
    assert route.calls.last.request.headers["X-IDENTITY-HEADER"] == "FAKE-IDENTITY-HEADER"
    assert route.calls.last.request.url.params["api-version"] == "2019-08-01"
    assert route.calls.last.request.url.params["resource"] == "https://storage.azure.com/"


@respx.mock
def test_msi_token_refreshes_inside_expiry_margin():
    # A cached token expiring INSIDE the refresh margin is re-minted, not reused.
    route = _mock_msi()
    blob_source._TOKEN_CACHE["https://storage.azure.com/"] = (
        "stale-token",
        time.time() + 30,  # 30s left < the 300s margin
    )
    with httpx.Client() as c:
        token = mint_storage_token(c)
    assert token == FAKE_MSI_TOKEN
    assert route.call_count == 1


def test_msi_token_missing_endpoint_is_config_error(monkeypatch):
    monkeypatch.delenv("IDENTITY_ENDPOINT", raising=False)
    with httpx.Client() as c:
        with pytest.raises(BlobConfigError):
            mint_storage_token(c)


@respx.mock
def test_msi_token_non_200_raises():
    respx.get(MSI_ENDPOINT).mock(return_value=httpx.Response(500))
    with httpx.Client() as c:
        with pytest.raises(BlobSourceError) as ei:
            mint_storage_token(c)
    assert ei.value.status == 500


# ==========================================================================
# fetch_blob_to_spool — streaming, hashing, spool overflow, error mapping
# ==========================================================================

@respx.mock
def test_fetch_blob_streams_hashes_and_overflows_spool():
    _mock_msi()
    # Bigger than the spool cap so the payload provably overflows to disk.
    data = b"e" * (blob_source._SPOOL_MAX_BYTES + 4096)
    blob = respx.get(f"{BLOB_BASE}/cases/abc/huge.eml").mock(
        return_value=httpx.Response(200, content=data)
    )
    payload = fetch_blob_to_spool("cases/abc/huge.eml")
    try:
        assert payload.size == len(data)
        assert payload.sha1 == hashlib.sha1(data).hexdigest()
        assert payload.sha256 == hashlib.sha256(data).hexdigest()
        assert payload.file.read() == data  # positioned at 0 for the upload
        req = blob.calls.last.request
        assert req.headers["Authorization"] == f"Bearer {FAKE_MSI_TOKEN}"
        assert req.headers["x-ms-version"] == blob_source._XMS_VERSION
    finally:
        payload.close()


@respx.mock
def test_fetch_blob_percent_encodes_the_path():
    _mock_msi()
    data = b"img"
    blob = respx.get(f"{BLOB_BASE}/cases/a%20b/IMG%201.jpg").mock(
        return_value=httpx.Response(200, content=data)
    )
    payload = fetch_blob_to_spool("cases/a b/IMG 1.jpg")
    try:
        assert blob.called
        assert payload.size == 3
    finally:
        payload.close()


@respx.mock
def test_fetch_blob_404_maps_to_not_found():
    _mock_msi()
    respx.get(f"{BLOB_BASE}/cases/abc/missing.pdf").mock(return_value=httpx.Response(404))
    with pytest.raises(BlobSourceError) as ei:
        fetch_blob_to_spool("cases/abc/missing.pdf")
    assert ei.value.status == 404


@respx.mock
def test_fetch_blob_401_forces_one_token_remint_then_succeeds():
    msi = _mock_msi()
    blob = respx.get(f"{BLOB_BASE}/cases/abc/a.pdf")
    blob.side_effect = [httpx.Response(401), httpx.Response(200, content=b"pdf")]
    payload = fetch_blob_to_spool("cases/abc/a.pdf")
    try:
        assert payload.size == 3
        assert msi.call_count == 2  # initial mint + ONE forced refresh
        assert blob.call_count == 2
    finally:
        payload.close()


@respx.mock
def test_fetch_blob_empty_body_is_refused():
    _mock_msi()
    respx.get(f"{BLOB_BASE}/cases/abc/empty.bin").mock(
        return_value=httpx.Response(200, content=b"")
    )
    with pytest.raises(BlobSourceError) as ei:
        fetch_blob_to_spool("cases/abc/empty.bin")
    assert ei.value.status == 400


def test_fetch_blob_missing_account_is_config_error(monkeypatch):
    monkeypatch.delenv("EVIDENCE_BLOB_ACCOUNT", raising=False)
    with pytest.raises(BlobConfigError):
        fetch_blob_to_spool("cases/abc/a.pdf")


def test_fetch_blob_validates_path_before_any_request():
    # respx is NOT active here: a traversal path must be refused before any
    # outbound request is even built (a real request would error loudly).
    with pytest.raises(BlobPathError):
        fetch_blob_to_spool("../other-container/steal.pdf")

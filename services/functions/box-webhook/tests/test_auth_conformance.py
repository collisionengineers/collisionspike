"""Auth/retry behavioural conformance for the box-webhook clients (TKT-268 / PLAN-011).

Pins ONLY the behaviours each client claims in services/functions/auth-conformance-inventory.json via the
shared _authconf harness, and proves the probes fail closed against the negative fakes.
"""

from __future__ import annotations

import time

import httpx
import pytest

import blob_source
import box_client
import data_api_client
from box_client import BoxAuthError, BoxClient, BoxError
from data_api_client import DataApiClient, DataApiError
from jwt_testkit import jwt_box_config

from _authconf import fakes
from _authconf.conformance import (
    ClientSpec,
    assert_bounded_transient_retry,
    assert_expiry_aware_reuse,
    claims_for,
    run_claimed,
)

BOX_PATH = "services/functions/box-webhook/box_client.py"
BLOB_PATH = "services/functions/box-webhook/blob_source.py"
DATA_API_PATH = "services/functions/box-webhook/data_api_client.py"

_BOX_MINT_URL = "https://api.box.com/oauth2/token"
_BOX_DATA_URL = "https://api.box.com/2.0/folders/9/items"
_MSI_URL = "http://localhost:8081/msi/token"
_BLOB_URL = "https://teststorage01.blob.core.windows.net/evidence/cases/abc/a.pdf"
_STORAGE_RESOURCE = "https://storage.azure.com/"
_DATA_BASE = "https://api.test.example"
_DATA_URL = f"{_DATA_BASE}/api/internal/box/case-by-folder/777"


def _box_spec() -> ClientSpec:
    return ClientSpec(
        inventory_path=BOX_PATH,
        make_client=lambda: BoxClient(config=jwt_box_config()),
        call=lambda c: c.list_folder("9"),
        close=lambda c: c.close(),
        register_mint=lambda router, h: router.post(_BOX_MINT_URL).mock(side_effect=h),
        register_data=lambda router, h: router.get(_BOX_DATA_URL).mock(side_effect=h),
        mint_ok=lambda: httpx.Response(200, json={"access_token": "FAKE.box.token", "expires_in": 3599}),
        data_ok=lambda: httpx.Response(200, json={"total_count": 0, "entries": []}),
        auth_error=BoxAuthError,
        transient_error=BoxError,
        transient_status=503,
        nontransient_status=400,
        max_attempts=5,
        # Advance the module monotonic clock so the cached token's deadline is now in the past.
        expire=lambda _c, mp: mp.setattr(box_client.time, "monotonic", lambda: 10**9),
        neutralise_backoff=lambda mp: mp.setattr(BoxClient, "_backoff", staticmethod(lambda attempt: None)),
    )


def _blob_spec() -> ClientSpec:
    def _consume(_client):
        payload = blob_source.fetch_blob_to_spool("cases/abc/a.pdf")
        payload.file.close()
        return payload

    return ClientSpec(
        inventory_path=BLOB_PATH,
        make_client=lambda: None,
        call=_consume,
        register_mint=lambda router, h: router.get(_MSI_URL).mock(side_effect=h),
        register_data=lambda router, h: router.get(_BLOB_URL).mock(side_effect=h),
        mint_ok=lambda: httpx.Response(
            200,
            json={
                "access_token": "FAKE.storage.token",
                "expires_on": str(int(time.time()) + 3600),
                "resource": _STORAGE_RESOURCE,
                "token_type": "Bearer",
            },
        ),
        data_ok=lambda: httpx.Response(200, content=b"pdf-bytes"),
        auth_error=blob_source.BlobSourceError,
        # Seed the module cache with a near-expiry entry (inside the 300s refresh margin) so it re-mints.
        expire=lambda _c, _mp: blob_source._TOKEN_CACHE.__setitem__(_STORAGE_RESOURCE, ("stale", time.time() + 30)),
    )


def _data_api_spec() -> ClientSpec:
    def _capture_sleep(mp):
        delays: list[float] = []
        mp.setattr(data_api_client.time, "sleep", lambda d: delays.append(d))
        return delays

    return ClientSpec(
        inventory_path=DATA_API_PATH,
        make_client=lambda: DataApiClient(base_url=_DATA_BASE, token_provider=lambda: "FAKE-MI-TOKEN"),
        call=lambda c: c.resolve_case_by_folder("777"),
        close=lambda c: c.close(),
        register_data=lambda router, h: router.get(_DATA_URL).mock(side_effect=h),
        data_ok=lambda: httpx.Response(200, json={"caseId": "CASE-1"}),
        auth_error=DataApiError,
        transient_error=DataApiError,
        transient_status=503,
        nontransient_status=404,
        max_attempts=5,
        neutralise_backoff=lambda mp: mp.setattr(data_api_client.time, "sleep", lambda _s: None),
        capture_sleep=_capture_sleep,
    )


@pytest.fixture()
def _blob_env(monkeypatch):
    monkeypatch.setenv("EVIDENCE_BLOB_ACCOUNT", "teststorage01")
    monkeypatch.setenv("EVIDENCE_BLOB_CONTAINER", "evidence")
    monkeypatch.setenv("IDENTITY_ENDPOINT", _MSI_URL)
    monkeypatch.setenv("IDENTITY_HEADER", "FAKE-IDENTITY-HEADER")
    blob_source._TOKEN_CACHE.clear()
    yield
    blob_source._TOKEN_CACHE.clear()


@pytest.mark.parametrize("claim", claims_for(BOX_PATH))
def test_box_client_conformance(claim, monkeypatch):
    run_claimed(_box_spec(), claim, monkeypatch)


@pytest.mark.parametrize("claim", claims_for(BLOB_PATH))
def test_blob_source_conformance(claim, monkeypatch, _blob_env):
    run_claimed(_blob_spec(), claim, monkeypatch)


@pytest.mark.parametrize("claim", claims_for(DATA_API_PATH))
def test_data_api_client_conformance(claim, monkeypatch):
    run_claimed(_data_api_spec(), claim, monkeypatch)


def test_probes_reject_the_ignore_expiry_fake(monkeypatch):
    with pytest.raises(AssertionError):
        assert_expiry_aware_reuse(fakes.ignore_expiry_spec(), monkeypatch)


def test_probes_reject_the_retry_nontransient_fake(monkeypatch):
    with pytest.raises(AssertionError):
        assert_bounded_transient_retry(fakes.retry_nontransient_spec(), monkeypatch)

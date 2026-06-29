"""Offline tests for the Box CCG client (token-mint cache + refresh-on-401).

[BUILD] — ZERO network, NO real secrets. The Box token endpoint + REST calls are
mocked with respx (httpx transport mocking).

Covered:
* CCG token mint shape (grant_type=client_credentials, box_subject_type=enterprise).
* Token is CACHED across calls (one mint serves many requests).
* A 401 on a REST call refreshes the token exactly once, then retries.
* 429 / 5xx back off + retry (bounded); persistent 429 raises BoxError.
* CreateFolder 409 item_name_in_use is idempotent (reads the conflict id back).
* The client_secret / token never appear in logs or in the typed results.

Run from the function folder:

    python -m pytest -q
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from urllib.parse import parse_qs

import httpx
import jwt
import pytest
import respx

FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))

from box_client import BoxClient, BoxConfig, BoxError  # noqa: E402
from jwt_testkit import (  # noqa: E402
    TEST_CLIENT_ID,
    TEST_ENTERPRISE_ID,
    TEST_KID,
    TEST_PUBLIC_PEM,
    jwt_box_config,
)

# Must be an https *.box.com host: box_client pins the CREDENTIAL token-mint
# host (the client_secret is POSTed to it), so a non-Box base is refused.
API_BASE = "https://api.box.com"
TOKEN_URL = f"{API_BASE}/oauth2/token"

FAKE_SECRET = "bX+fake/box/secret+VALUE=="  # noqa: S105
FAKE_TOKEN = "FAKE.box.access-token.not-real"  # noqa: S105
FAKE_TOKEN_2 = "FAKE.box.access-token.refreshed"  # noqa: S105


def _client() -> BoxClient:
    # App Access Only Service Account via JWT (the live auth method), signed by the
    # throwaway test keypair so the mint runs fully offline.
    return BoxClient(config=jwt_box_config())


def _mock_token(token: str = FAKE_TOKEN, expires_in: int = 3599) -> respx.Route:
    return respx.post(TOKEN_URL).mock(
        return_value=httpx.Response(200, json={"access_token": token, "expires_in": expires_in})
    )


def _no_backoff(monkeypatch):
    monkeypatch.setattr(BoxClient, "_backoff", staticmethod(lambda attempt: None))


# ==========================================================================
# Token mint shape + caching
# ==========================================================================

@respx.mock
def test_token_mint_shape_is_jwt_bearer():
    """The mint posts a jwt-bearer grant whose assertion is a real RS512-signed JWT
    with the Box Service-Account claims (sub=enterpriseID, box_sub_type=enterprise)."""
    token_route = _mock_token()
    c = _client()
    assert c.get_token() == FAKE_TOKEN

    req = token_route.calls.last.request
    assert req.method == "POST"
    assert req.headers["content-type"] == "application/x-www-form-urlencoded"
    form = parse_qs(req.content.decode("utf-8"))
    assert form["grant_type"] == ["urn:ietf:params:oauth:grant-type:jwt-bearer"]
    assert form["client_id"] == [TEST_CLIENT_ID]
    assert "assertion" in form

    assertion = form["assertion"][0]
    header = jwt.get_unverified_header(assertion)
    assert header["alg"] == "RS512"
    assert header["kid"] == TEST_KID
    claims = jwt.decode(
        assertion,
        TEST_PUBLIC_PEM,
        algorithms=["RS512"],
        audience=f"{API_BASE}/oauth2/token",
    )
    assert claims["iss"] == TEST_CLIENT_ID
    assert claims["sub"] == TEST_ENTERPRISE_ID
    assert claims["box_sub_type"] == "enterprise"
    assert len(claims["jti"]) >= 16
    assert 0 < claims["exp"] - claims["iat"] <= 60
    c.close()


@respx.mock
def test_token_mint_corrects_clock_skew_and_retries(monkeypatch):
    """A 400 carrying a Date header far from our clock triggers ONE rebuild around
    Box's time, then succeeds (host-clock-drift resilience)."""
    from datetime import datetime, timedelta, timezone
    from email.utils import format_datetime

    _no_backoff(monkeypatch)
    future = datetime.now(timezone.utc) + timedelta(minutes=10)
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(
                400,
                json={"error": "invalid_grant"},
                headers={"Date": format_datetime(future)},
            )
        return httpx.Response(200, json={"access_token": FAKE_TOKEN, "expires_in": 3599})

    respx.post(TOKEN_URL).mock(side_effect=handler)
    c = _client()
    assert c.get_token() == FAKE_TOKEN
    assert calls["n"] == 2  # one skew-rejected, one corrected success
    c.close()


@respx.mock
def test_token_is_cached_across_calls():
    token_route = _mock_token()
    c = _client()
    c.get_token()
    c.get_token()
    c.get_token()
    # One mint serves all three (cache holds it for ~lifetime).
    assert token_route.call_count == 1
    c.close()


@respx.mock
def test_force_refresh_mints_again():
    token_route = _mock_token()
    c = _client()
    c.get_token()
    c.get_token(force_refresh=True)
    assert token_route.call_count == 2
    c.close()


@respx.mock
def test_unauthorized_client_raises_box_auth_error():
    from box_client import BoxAuthError

    respx.post(TOKEN_URL).mock(
        return_value=httpx.Response(401, json={"error": "unauthorized_client"})
    )
    c = _client()
    with pytest.raises(BoxAuthError):
        c.get_token()
    c.close()


@respx.mock
def test_token_mint_429_backs_off_then_succeeds(monkeypatch):
    # The token endpoint shares the rate-limit budget; a transient 429 must be
    # retried with backoff, not surfaced immediately.
    _no_backoff(monkeypatch)
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429)
        return httpx.Response(200, json={"access_token": FAKE_TOKEN, "expires_in": 3599})

    respx.post(TOKEN_URL).mock(side_effect=handler)
    c = _client()
    assert c.get_token() == FAKE_TOKEN
    assert calls["n"] == 2  # one 429, one success
    c.close()


@respx.mock
def test_token_mint_persistent_429_exhausts_budget_then_raises(monkeypatch):
    _no_backoff(monkeypatch)
    route = respx.post(TOKEN_URL).mock(return_value=httpx.Response(429))
    c = _client()
    with pytest.raises(BoxError):
        c.get_token()
    # 1 initial + _MAX_RETRIES retries == 5 (bounded — no storm).
    assert route.call_count == 5
    c.close()


@respx.mock
def test_token_mint_400_is_not_retried(monkeypatch):
    # Auth failures (bad credentials / unauthorized_client) are NOT transient —
    # they must raise on the first response with no backoff loop.
    from box_client import BoxAuthError

    _no_backoff(monkeypatch)
    route = respx.post(TOKEN_URL).mock(
        return_value=httpx.Response(400, json={"error": "invalid_client"})
    )
    c = _client()
    with pytest.raises(BoxAuthError):
        c.get_token()
    assert route.call_count == 1  # no retry on a non-transient auth failure
    c.close()


# ==========================================================================
# 401 on a REST call -> refresh once -> retry
# ==========================================================================

@respx.mock
def test_rest_401_refreshes_token_once_then_succeeds(caplog):
    # Token endpoint returns a different token on each mint so we can prove the
    # second (refreshed) token is used.
    tokens = iter([FAKE_TOKEN, FAKE_TOKEN_2])
    respx.post(TOKEN_URL).mock(
        side_effect=lambda request: httpx.Response(
            200, json={"access_token": next(tokens), "expires_in": 3599}
        )
    )

    calls = {"n": 0}

    def folder_handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(401)  # stale token
        return httpx.Response(201, json={"id": "42", "type": "folder", "name": "AX26001"})

    route = respx.post(f"{API_BASE}/2.0/folders").mock(side_effect=folder_handler)

    c = _client()
    with caplog.at_level(logging.WARNING):
        out = c.create_folder("AX26001", "0")

    assert out["id"] == "42"
    assert out["outcome"] == "created"
    assert calls["n"] == 2  # one 401, one success
    assert route.call_count == 2
    # Second REST attempt carried the refreshed token.
    assert route.calls[-1].request.headers["Authorization"] == f"Bearer {FAKE_TOKEN_2}"
    # No secret/token leaked into logs.
    assert FAKE_SECRET not in caplog.text
    assert FAKE_TOKEN not in caplog.text
    c.close()


@respx.mock
def test_rest_persistent_401_raises_after_one_refresh():
    from box_client import BoxAuthError

    _mock_token()
    respx.get(f"{API_BASE}/2.0/folders/5/items").mock(return_value=httpx.Response(401))
    c = _client()
    with pytest.raises(BoxAuthError):
        c.list_folder("5")
    c.close()


# ==========================================================================
# 429 / 5xx backoff + retry
# ==========================================================================

@respx.mock
def test_rest_429_backs_off_then_succeeds(monkeypatch):
    _no_backoff(monkeypatch)
    _mock_token()

    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429)
        return httpx.Response(200, json={"total_count": 0, "entries": []})

    respx.get(f"{API_BASE}/2.0/folders/9/items").mock(side_effect=handler)
    c = _client()
    out = c.list_folder("9")
    assert out["total_count"] == 0
    assert calls["n"] == 2
    c.close()


@respx.mock
def test_rest_persistent_429_exhausts_budget_then_raises(monkeypatch):
    _no_backoff(monkeypatch)
    _mock_token()
    route = respx.get(f"{API_BASE}/2.0/folders/9/items").mock(return_value=httpx.Response(429))
    c = _client()
    with pytest.raises(BoxError):
        c.list_folder("9")
    # 1 initial + _MAX_RETRIES retries == 5 (bounded — no storm).
    assert route.call_count == 5
    c.close()


# ==========================================================================
# CreateFolder 409 idempotency
# ==========================================================================

@respx.mock
def test_create_folder_409_is_idempotent_reuse():
    _mock_token()
    conflict = {
        "type": "error", "code": "item_name_in_use",
        "context_info": {"conflicts": [{"id": "777", "type": "folder", "name": "AX26001"}]},
    }
    respx.post(f"{API_BASE}/2.0/folders").mock(return_value=httpx.Response(409, json=conflict))
    c = _client()
    out = c.create_folder("AX26001", "0")
    assert out["id"] == "777"
    assert out["outcome"] == "reused"
    c.close()


@respx.mock
def test_create_folder_201_tagged_created():
    _mock_token()
    respx.post(f"{API_BASE}/2.0/folders").mock(
        return_value=httpx.Response(201, json={"id": "1", "type": "folder", "name": "AX26001"})
    )
    c = _client()
    out = c.create_folder("AX26001", "0")
    assert out["outcome"] == "created"
    c.close()


# ==========================================================================
# UploadFile — the one-way Blob -> Box archive mirror (box-sync ticket)
# ==========================================================================

UPLOAD_URL = "https://upload.box.com/api/2.0/files/content"


@respx.mock
def test_upload_file_201_posts_multipart_to_upload_host_tagged_created():
    _mock_token()
    route = respx.post(UPLOAD_URL).mock(
        return_value=httpx.Response(
            201,
            json={"entries": [{"id": "f1", "type": "file", "name": "message.eml", "sha1": "abc"}]},
        )
    )
    c = _client()
    out = c.upload_file("0", "message.eml", b"raw-eml-bytes", "message/rfc822")
    assert out["id"] == "f1"
    assert out["outcome"] == "created"
    assert route.called
    # The multipart body carries BOTH the attributes JSON (name+parent) and the bytes.
    sent = route.calls.last.request.content
    assert b"message.eml" in sent
    assert b"raw-eml-bytes" in sent
    assert b'"parent"' in sent
    c.close()


@respx.mock
def test_upload_file_409_name_conflict_is_idempotent_reuse():
    # The file-upload 409 returns context_info.conflicts as a SINGLE object (not a
    # list like CreateFolder); _conflict_id must read the id out of it so a replayed
    # archive reuses the existing file id instead of erroring.
    _mock_token()
    conflict = {
        "type": "error", "code": "item_name_in_use",
        "context_info": {"conflicts": {"type": "file", "id": "999", "name": "message.eml"}},
    }
    respx.post(UPLOAD_URL).mock(return_value=httpx.Response(409, json=conflict))
    c = _client()
    out = c.upload_file("0", "message.eml", b"x")
    assert out["id"] == "999"
    assert out["outcome"] == "reused"
    c.close()


@respx.mock
def test_upload_file_5xx_raises_box_error(monkeypatch):
    _no_backoff(monkeypatch)
    _mock_token()
    respx.post(UPLOAD_URL).mock(return_value=httpx.Response(500))
    c = _client()
    with pytest.raises(BoxError):
        c.upload_file("0", "a.pdf", b"x")
    c.close()


# ==========================================================================
# Secret hygiene
# ==========================================================================

def test_secret_never_in_config_repr():
    cfg = BoxConfig(client_id="cid", client_secret=FAKE_SECRET, enterprise_id="123")
    r = repr(cfg)
    assert FAKE_SECRET not in r
    assert "redacted" in r


@respx.mock
def test_token_value_never_logged(caplog):
    _mock_token()
    c = _client()
    with caplog.at_level(logging.DEBUG):
        c.get_token()
    assert FAKE_TOKEN not in caplog.text
    assert FAKE_SECRET not in caplog.text
    c.close()


def test_config_from_env_missing_raises(monkeypatch):
    from box_client import BoxConfigError

    # JWT auth resolves everything from the single BOX_CONFIG_JSON secret.
    monkeypatch.delenv("BOX_CONFIG_JSON", raising=False)
    with pytest.raises(BoxConfigError):
        BoxConfig.from_env()


# ==========================================================================
# Credential-host pin: a non-secret BOX_API_BASE cannot redirect the secret
# ==========================================================================

@respx.mock
@pytest.mark.parametrize(
    "bad_base",
    [
        "https://evil.example.com",       # foreign host
        "http://api.box.com",             # downgraded scheme
        "https://api.box.com.evil.test",  # suffix-spoof (not a *.box.com host)
        "https://boxXcom",                # no dot before box.com
    ],
)
def test_token_mint_refuses_non_box_host(bad_base):
    # The credential POST must never fire for a non-Box token host. respx is
    # active with NO routes registered, so any outbound request would itself
    # error — proving the guard short-circuits before the secret leaves us.
    from box_client import BoxConfigError

    cfg = BoxConfig(
        client_id="fake-client-id",
        client_secret=FAKE_SECRET,
        enterprise_id="1234567",
        api_base=bad_base,
    )
    c = BoxClient(config=cfg)
    with pytest.raises(BoxConfigError):
        c.get_token()
    c.close()


def test_token_mint_host_pin_message_has_no_secret():
    from box_client import BoxConfigError

    cfg = BoxConfig(
        client_id="fake-client-id",
        client_secret=FAKE_SECRET,
        enterprise_id="1234567",
        api_base="https://evil.example.com",
    )
    c = BoxClient(config=cfg)
    with pytest.raises(BoxConfigError) as ei:
        c.get_token()
    assert FAKE_SECRET not in str(ei.value)
    c.close()

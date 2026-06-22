"""Box REST client — CCG service-identity token minted INSIDE the Function.

[BUILD] — authored offline, exercised only by mocked pytest (respx / httpx
transport mocking). No live Box, no Azure/tenant contact. The real token + Box
endpoints are reached ONLY at runtime inside the deployed Function.

Why the token lives here (not on the connector)
-----------------------------------------------
A Power Platform custom connector CANNOT run the OAuth2 client-credentials grant
(Microsoft Learn, verbatim). So the connector authenticates by an Azure Functions
host key on the connection, and THIS module exchanges the Box CCG
service-identity token from a Key Vault ``client_secret``:

    POST https://api.box.com/oauth2/token
        grant_type=client_credentials
        client_id=..&client_secret=..
        box_subject_type=enterprise&box_subject_id=<Enterprise ID>
      -> { "access_token": "..", "expires_in": 3599 }   # App Access Only

The app must be **authorized in the Box Admin Console** before the first call
succeeds (``unauthorized_client`` otherwise — exactly why a free test account
cannot use this path).

Caching + resilience (mirrors functions/enrichment/dvsa_client.py)
------------------------------------------------------------------
Token cached in-process for ~its lifetime with a 60s refresh skew; refresh once
on a 401; bounded exponential backoff with jitter on Box ``429`` / 5xx. The
~60-min token / no-refresh detail is UNVERIFIED — re-minting per cycle is safe
regardless.

Secret handling
---------------
``client_id`` / ``client_secret`` come from environment variables which, in the
deployed Function, are **Azure Key Vault references** (``@Microsoft.KeyVault(...)``)
resolved by the platform via the Function's managed identity. They are NEVER
logged, echoed in a response, or written to a fixture. ``__repr__`` is redacted.
The minted bearer token is likewise never logged or returned to the caller.
"""

from __future__ import annotations

import logging
import os
import random
import threading
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlsplit

import httpx

logger = logging.getLogger("boxwebhook.box")

# Non-secret defaults. Exposed so a self-check could report the RESOLVED
# endpoints without re-deriving the literals.
DEFAULT_BOX_API_BASE = "https://api.box.com"
DEFAULT_BOX_UPLOAD_BASE = "https://upload.box.com"
# CCG token endpoint sits on the api host (NOT the upload host).
_TOKEN_PATH = "/oauth2/token"

# Security pin for the CREDENTIAL-bearing token mint. ``BOX_API_BASE`` is a
# plain (non-secret) app setting; the client_secret (a Key Vault ref) is POSTed
# to whatever host it names. If that setting were repointed at an attacker host
# (misconfig / supply-chain edit / compromised deploy principal), the next mint
# would exfiltrate the Box service-identity secret. So before the secret ever
# leaves the process we assert the token host is Box over HTTPS — a non-secret
# app setting can never redirect the secret off ``*.box.com``.
_BOX_TOKEN_HOST_SUFFIX = ".box.com"


def _assert_box_token_host(token_url: str) -> None:
    """Raise BoxConfigError unless ``token_url`` is https on a ``*.box.com``
    host. Guards the credential POST, NOT ordinary REST calls."""
    parts = urlsplit(token_url)
    host = (parts.hostname or "").lower()
    ok = parts.scheme == "https" and (host == "box.com" or host.endswith(_BOX_TOKEN_HOST_SUFFIX))
    if not ok:
        # Name the offending SETTING, not its value — and never the secret.
        raise BoxConfigError(
            "Refusing to mint the Box CCG token: BOX_API_BASE must be an https "
            "*.box.com host (the client_secret is POSTed to it)"
        )

# Per-request timeout (seconds).
_DEFAULT_TIMEOUT_S = 20.0

# Refresh the cached token this many seconds BEFORE expiry so an in-flight call
# never races the boundary.
_EXPIRY_SKEW_S = 60.0

# Fallback TTL if the token response omits expires_in.
_FALLBACK_TTL_S = 3599.0

# Retry policy.
_MAX_RETRIES = 4
_BASE_BACKOFF_S = 1.0

# Transient HTTP statuses safe to retry (Box documents 429 on rate-limit;
# 5xx on upstream faults). Verified: ~1000/min/user; back off on 429.
_RETRY_SAFE_STATUS = {429, 500, 502, 503, 504}


class BoxError(RuntimeError):
    """Non-recoverable Box failure (after the 401 retry / retry budget). The
    message carries the failure CLASS / status only — never the Box body
    verbatim, never a token or secret."""

    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class BoxAuthError(BoxError):
    """Box rejected our credentials (token endpoint 400/401, or an API 401 after
    one forced refresh). On CCG this most often means the app is not yet
    Admin-Console authorized (``unauthorized_client``)."""


class BoxConfigError(BoxError):
    """Required Box app settings / Key Vault refs are absent."""


@dataclass
class _CachedToken:
    access_token: str
    expires_at_monotonic: float

    def is_valid(self) -> bool:
        return time.monotonic() < self.expires_at_monotonic


@dataclass
class BoxConfig:
    """Resolved from app settings. ``client_secret`` maps to a Key Vault ref."""

    client_id: str
    client_secret: str = field(repr=False)
    enterprise_id: str = ""
    api_base: str = field(default=DEFAULT_BOX_API_BASE)
    upload_base: str = field(default=DEFAULT_BOX_UPLOAD_BASE)

    @classmethod
    def from_env(cls) -> "BoxConfig":
        client_id = os.environ.get("BOX_CLIENT_ID", "").strip()
        client_secret = os.environ.get("BOX_CLIENT_SECRET", "")
        enterprise_id = os.environ.get("BOX_ENTERPRISE_ID", "").strip()
        api_base = (os.environ.get("BOX_API_BASE", "").strip() or DEFAULT_BOX_API_BASE).rstrip("/")
        upload_base = (
            os.environ.get("BOX_UPLOAD_BASE", "").strip() or DEFAULT_BOX_UPLOAD_BASE
        ).rstrip("/")

        missing = [
            name
            for name, val in (
                ("BOX_CLIENT_ID", client_id),
                ("BOX_CLIENT_SECRET", client_secret),
                ("BOX_ENTERPRISE_ID", enterprise_id),
            )
            if not val
        ]
        if missing:
            # Signal the gap by NAME only — never the values.
            raise BoxConfigError(
                "Box credentials are not configured (missing Key Vault refs / "
                f"app settings: {', '.join(missing)})"
            )
        return cls(
            client_id=client_id,
            client_secret=client_secret,
            enterprise_id=enterprise_id,
            api_base=api_base,
            upload_base=upload_base,
        )

    @property
    def token_url(self) -> str:
        url = f"{self.api_base}{_TOKEN_PATH}"
        # Pin the credential host BEFORE the secret is POSTed to it.
        _assert_box_token_host(url)
        return url

    def __repr__(self) -> str:  # pragma: no cover - trivial redaction
        return (
            f"BoxConfig(client_id=<redacted>, client_secret=<redacted>, "
            f"enterprise_id={self.enterprise_id!r}, api_base={self.api_base!r})"
        )


class BoxClient:
    """CCG client-credentials token + Box REST seam.

    Lazy and mockable: nothing happens at construction. The HTTP transport is
    created on first use and can be injected for tests. The access token is
    cached in-process and refreshed at most once on a 401.
    """

    def __init__(
        self,
        config: BoxConfig | None = None,
        *,
        transport: httpx.BaseTransport | None = None,
        timeout_s: float = _DEFAULT_TIMEOUT_S,
    ) -> None:
        self._config = config
        self._transport = transport
        self._timeout_s = timeout_s
        self._client: httpx.Client | None = None
        self._token: _CachedToken | None = None
        self._lock = threading.Lock()

    # -- lazy wiring -------------------------------------------------------

    @property
    def config(self) -> BoxConfig:
        if self._config is None:
            self._config = BoxConfig.from_env()
        return self._config

    @property
    def http(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(timeout=self._timeout_s, transport=self._transport)
        return self._client

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None

    # -- token lifecycle (CCG) --------------------------------------------

    def _fetch_token(self) -> _CachedToken:
        cfg = self.config
        data = {
            "grant_type": "client_credentials",
            "client_id": cfg.client_id,
            "client_secret": cfg.client_secret,
            "box_subject_type": "enterprise",
            "box_subject_id": cfg.enterprise_id,
        }
        # The token endpoint shares the ~1000/min/user budget, so it can also
        # return 429 / 5xx under burst. Apply the SAME bounded backoff the REST
        # path uses. Auth-failure statuses (400/401 -> unauthorized_client) are
        # NOT transient and fall through to raise without retry.
        attempt = 0
        while True:
            resp = self.http.post(
                cfg.token_url,
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            if resp.status_code in _RETRY_SAFE_STATUS and attempt < _MAX_RETRIES:
                self._backoff(attempt)
                attempt += 1
                continue
            break
        if resp.status_code in (400, 401):
            # unauthorized_client (app not Admin-authorized) lands here. Never
            # echo resp.text — it can reflect the request.
            raise BoxAuthError(
                "Box rejected the CCG client-credentials grant "
                f"(HTTP {resp.status_code}; app may not be Admin-Console authorized)",
                status=resp.status_code,
            )
        if resp.status_code >= 400:
            raise BoxError(
                f"Box token endpoint returned HTTP {resp.status_code}",
                status=resp.status_code,
            )

        payload = resp.json()
        token = payload.get("access_token")
        if not token:
            raise BoxError("Box token response did not include an access_token")
        ttl = float(payload.get("expires_in") or _FALLBACK_TTL_S)
        deadline = time.monotonic() + max(0.0, ttl - _EXPIRY_SKEW_S)
        logger.info("box ccg token acquired (ttl=%ss)", int(ttl))  # no token value
        return _CachedToken(access_token=token, expires_at_monotonic=deadline)

    def get_token(self, *, force_refresh: bool = False) -> str:
        with self._lock:
            if force_refresh or self._token is None or not self._token.is_valid():
                self._token = self._fetch_token()
            return self._token.access_token

    # -- generic Box REST request (with 401 refresh + 429/5xx backoff) -----

    def request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        base: str | None = None,
    ) -> httpx.Response:
        """Issue an authenticated Box REST call. ``path`` is appended to
        ``base`` (default the api host). Refreshes the token once on a 401, then
        backs off on 429/5xx. Returns the raw httpx.Response so callers can map
        Box-specific success/idempotent-conflict codes themselves (e.g. the
        409-on-CreateFolder idempotency)."""
        return self._request_with_retry(
            method, path, json_body=json_body, params=params, base=base
        )

    def _request_with_retry(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None,
        params: dict[str, Any] | None,
        base: str | None,
        attempt: int = 0,
        refreshed: bool = False,
    ) -> httpx.Response:
        cfg = self.config
        url = f"{(base or cfg.api_base).rstrip('/')}{path}"
        headers = {
            "Authorization": f"Bearer {self.get_token(force_refresh=refreshed)}",
            "Accept": "application/json",
        }
        resp = self.http.request(method, url, headers=headers, json=json_body, params=params)

        # 401: refresh the token exactly once, then retry.
        if resp.status_code == 401 and not refreshed:
            with self._lock:
                self._token = None  # drop the stale token
            return self._request_with_retry(
                method, path, json_body=json_body, params=params, base=base,
                attempt=attempt, refreshed=True,
            )
        if resp.status_code == 401:
            raise BoxAuthError("Box returned 401 after one token refresh", status=401)

        # Transient: bounded exponential backoff with jitter.
        if resp.status_code in _RETRY_SAFE_STATUS and attempt < _MAX_RETRIES:
            self._backoff(attempt)
            return self._request_with_retry(
                method, path, json_body=json_body, params=params, base=base,
                attempt=attempt + 1, refreshed=refreshed,
            )

        return resp

    @staticmethod
    def _backoff(attempt: int) -> None:
        base = _BASE_BACKOFF_S * (2 ** attempt)
        jitter = base * 0.25 * (random.random() * 2 - 1)
        time.sleep(max(0.0, base + jitter))

    # -- typed operations (back the connector ops) -------------------------

    def create_folder(self, name: str, parent_id: str) -> dict[str, Any]:
        """POST /2.0/folders. 409 item_name_in_use (case-insensitive) is an
        idempotent success: read the conflicting id back out of
        context_info.conflicts[0].id and return it tagged outcome='reused'."""
        resp = self.request(
            "POST", "/2.0/folders",
            json_body={"name": name, "parent": {"id": parent_id}},
        )
        if resp.status_code == 201:
            body = resp.json()
            body["outcome"] = "created"
            return body
        if resp.status_code == 409:
            conflict_id = _conflict_id(resp)
            if conflict_id:
                logger.info("box folder already exists (409); reusing id")
                return {"id": conflict_id, "type": "folder", "name": name, "outcome": "reused"}
            raise BoxError("Box returned 409 with no resolvable conflict id", status=409)
        raise BoxError(f"Box CreateFolder returned HTTP {resp.status_code}", status=resp.status_code)

    def copy_file_request(
        self, template_id: str, folder_id: str, *, status: str = "active",
        expires_at: str | None = None, title: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"folder": {"id": folder_id, "type": "folder"}, "status": status}
        if expires_at:
            body["expires_at"] = expires_at
        if title:
            body["title"] = title
        resp = self.request("POST", f"/2.0/file_requests/{template_id}/copy", json_body=body)
        return _json_or_raise(resp, "CopyFileRequest")

    def get_shared_link(self, item_type: str, item_id: str, body: dict[str, Any]) -> dict[str, Any]:
        """item_type ∈ {files, folders}. PUT /2.0/{item_type}/{id}?fields=shared_link."""
        resp = self.request(
            "PUT", f"/2.0/{item_type}/{item_id}",
            params={"fields": "shared_link"}, json_body=body,
        )
        return _json_or_raise(resp, "GetSharedLink")

    def list_folder(self, folder_id: str, *, limit: int | None = None, offset: int | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {"fields": "id,name,sha1,created_at,modified_at"}
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset
        resp = self.request("GET", f"/2.0/folders/{folder_id}/items", params=params)
        return _json_or_raise(resp, "ListFolder")

    def create_webhook(self, target: dict[str, Any], address: str, triggers: list[str]) -> dict[str, Any]:
        resp = self.request(
            "POST", "/2.0/webhooks",
            json_body={"target": target, "address": address, "triggers": triggers},
        )
        return _json_or_raise(resp, "CreateWebhook")

    def get_webhook(self, webhook_id: str) -> dict[str, Any]:
        resp = self.request("GET", f"/2.0/webhooks/{webhook_id}")
        return _json_or_raise(resp, "GetWebhook")

    def delete_webhook(self, webhook_id: str) -> dict[str, Any]:
        resp = self.request("DELETE", f"/2.0/webhooks/{webhook_id}")
        if resp.status_code in (200, 204):
            return {"deleted": True, "id": webhook_id}
        raise BoxError(f"Box DeleteWebhook returned HTTP {resp.status_code}", status=resp.status_code)

    def get_file_request(self, file_request_id: str) -> dict[str, Any]:
        resp = self.request("GET", f"/2.0/file_requests/{file_request_id}")
        return _json_or_raise(resp, "GetFileRequest")

    def update_file_request(self, file_request_id: str, body: dict[str, Any]) -> dict[str, Any]:
        resp = self.request("PUT", f"/2.0/file_requests/{file_request_id}", json_body=body)
        return _json_or_raise(resp, "UpdateFileRequest")

    def delete_file_request(self, file_request_id: str) -> dict[str, Any]:
        resp = self.request("DELETE", f"/2.0/file_requests/{file_request_id}")
        if resp.status_code in (200, 204):
            return {"deleted": True, "id": file_request_id}
        raise BoxError(f"Box DeleteFileRequest returned HTTP {resp.status_code}", status=resp.status_code)


def _json_or_raise(resp: httpx.Response, op: str) -> dict[str, Any]:
    if 200 <= resp.status_code < 300:
        try:
            return resp.json()
        except ValueError:
            return {}
    raise BoxError(f"Box {op} returned HTTP {resp.status_code}", status=resp.status_code)


def _conflict_id(resp: httpx.Response) -> str | None:
    """Pull context_info.conflicts[0].id from a 409 item_name_in_use body."""
    try:
        body = resp.json()
    except ValueError:
        return None
    if not isinstance(body, dict):
        return None
    conflicts = (body.get("context_info") or {}).get("conflicts")
    if isinstance(conflicts, list) and conflicts:
        first = conflicts[0]
        if isinstance(first, dict):
            cid = first.get("id")
            return str(cid) if cid is not None else None
    return None

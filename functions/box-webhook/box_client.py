"""Box REST client — JWT (Server Auth) service-identity token minted INSIDE the Function.

[BUILD] — authored offline, exercised only by mocked pytest (respx / httpx
transport mocking). No live Box, no Azure/tenant contact. The real token + Box
endpoints are reached ONLY at runtime inside the deployed Function.

Why the token lives here (server-side, never on a client)
---------------------------------------------------------
The orchestration + Data API call this Function's HTTP routes server-to-server
(managed identity / function key); THIS module is where the Box service-identity
token is minted, so the app secret + JWT keypair never leave the Function. It builds
+ RS512-signs a short-lived JWT assertion from the app's Config.JSON and exchanges it
for an access token (Box "Server Authentication with JWT"):

    POST https://api.box.com/oauth2/token
        grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
        client_id=..&client_secret=..&assertion=<RS512-signed JWT>
      -> { "access_token": "..", "expires_in": 3599 }   # Service Account (App Access Only)

The whole Config.JSON (clientID, clientSecret, appAuth keypair, enterpriseID) is ONE
Key Vault secret, ``BOX_CONFIG_JSON``; the RSA private key is decrypted with its
passphrase to sign each assertion and is NEVER logged. The app must be authorized in
the Box Admin Console for the first call to succeed — but note that "Pending
Reauthorization" (after an app-config change) does NOT revoke the previously approved
configuration, so the prior keypair keeps working.

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

import json
import logging
import os
import random
import secrets
import threading
import time
from dataclasses import dataclass, field
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urlsplit

import httpx
import jwt
from cryptography.hazmat.primitives.serialization import load_pem_private_key

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

# --- JWT (Server Authentication) assertion + token exchange ---------------
_JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer"
# Assertion lifetime — Box rejects exp > 60s beyond iat; keep margin.
_ASSERTION_TTL_S = 45
# jti entropy (token_urlsafe(24) -> 32 chars, over Box's 16-char floor).
_JTI_BYTES = 24
# If our host clock has drifted past this vs Box's Date header, rebuild the
# assertion around Box's clock and retry once.
_CLOCK_SKEW_RETRY_THRESHOLD_S = 5
# Default signing algorithm (Box accepts RS256 / RS384 / RS512).
_DEFAULT_JWT_ALGORITHM = "RS512"


def _parse_http_date(date_str: str | None) -> float | None:
    """Parse an HTTP ``Date`` header to an epoch float (or None). Used to correct a
    drifted host clock against Box's server time on a JWT-mint rejection."""
    if not date_str:
        return None
    try:
        return parsedate_to_datetime(date_str).timestamp()
    except (TypeError, ValueError):
        return None

# Layer-2 scope lock cache: folder/file ids already confirmed to sit under
# BOX_ALLOWED_ROOT_ID. Module-level so it survives across warm-worker requests (the
# facade builds a fresh BoxClient per request). The root itself never needs caching
# (it short-circuits). Bounded in practice by the number of in-scope case folders.
_SCOPE_VERIFIED: set[str] = set()


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


class BoxScopeError(BoxError):
    """Layer-2 of the scope guard: an op targeted a Box item outside
    ``BOX_ALLOWED_ROOT_ID`` (the test-folder lock). The deployed Function refuses it
    BEFORE the write reaches Box — the compensating control for the enterprise-wide
    ``root_readwrite`` scope. Disabled (no-op) when ``BOX_ALLOWED_ROOT_ID`` is unset,
    which is how the lock is lifted for production."""


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
    # JWT (Server Authentication) app-auth material — from the app's Config.JSON.
    # The private key is decrypted with the passphrase to sign each short-lived
    # assertion; neither is ever logged (repr=False + the redacted __repr__).
    jwt_public_key_id: str = ""
    jwt_private_key: str = field(default="", repr=False)
    jwt_passphrase: str = field(default="", repr=False)
    jwt_algorithm: str = _DEFAULT_JWT_ALGORITHM
    api_base: str = field(default=DEFAULT_BOX_API_BASE)
    upload_base: str = field(default=DEFAULT_BOX_UPLOAD_BASE)
    # Layer-2 scope lock. When set, every op must target this folder or a descendant
    # (verified via path_collection). Empty = lock lifted (production).
    allowed_root_id: str = ""

    @classmethod
    def from_env(cls) -> "BoxConfig":
        # JWT (Server Authentication): the whole app Config.JSON is supplied as ONE
        # Key Vault secret BOX_CONFIG_JSON (clientID, clientSecret, appAuth keypair,
        # enterpriseID). Non-secret endpoint/scope settings stay as plain app settings.
        raw = os.environ.get("BOX_CONFIG_JSON", "").strip()
        if not raw:
            raise BoxConfigError(
                "Box credentials are not configured (missing Key Vault ref / app "
                "setting: BOX_CONFIG_JSON — the app's downloaded Config.JSON)"
            )
        try:
            doc = json.loads(raw)
        except (ValueError, TypeError):
            raise BoxConfigError(
                "BOX_CONFIG_JSON is not valid JSON (expected the Box app Config.JSON)"
            ) from None

        app = doc.get("boxAppSettings") or {}
        auth = app.get("appAuth") or {}
        client_id = str(app.get("clientID", "")).strip()
        client_secret = str(app.get("clientSecret", ""))
        enterprise_id = str(doc.get("enterpriseID", "")).strip()
        public_key_id = str(auth.get("publicKeyID", "")).strip()
        private_key = str(auth.get("privateKey", ""))
        passphrase = str(auth.get("passphrase", ""))

        missing = [
            name
            for name, val in (
                ("boxAppSettings.clientID", client_id),
                ("boxAppSettings.clientSecret", client_secret),
                ("enterpriseID", enterprise_id),
                ("boxAppSettings.appAuth.publicKeyID", public_key_id),
                ("boxAppSettings.appAuth.privateKey", private_key),
                ("boxAppSettings.appAuth.passphrase", passphrase),
            )
            if not val
        ]
        if missing:
            # Signal the gap by NAME only — never the values.
            raise BoxConfigError(
                "BOX_CONFIG_JSON is missing required field(s): " + ", ".join(missing)
            )

        algorithm = os.environ.get("BOX_JWT_ALGORITHM", "").strip() or _DEFAULT_JWT_ALGORITHM
        allowed_root_id = os.environ.get("BOX_ALLOWED_ROOT_ID", "").strip()
        api_base = (os.environ.get("BOX_API_BASE", "").strip() or DEFAULT_BOX_API_BASE).rstrip("/")
        upload_base = (
            os.environ.get("BOX_UPLOAD_BASE", "").strip() or DEFAULT_BOX_UPLOAD_BASE
        ).rstrip("/")

        return cls(
            client_id=client_id,
            client_secret=client_secret,
            enterprise_id=enterprise_id,
            jwt_public_key_id=public_key_id,
            jwt_private_key=private_key,
            jwt_passphrase=passphrase,
            jwt_algorithm=algorithm,
            api_base=api_base,
            upload_base=upload_base,
            allowed_root_id=allowed_root_id,
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
        self._priv_key: Any = None  # decrypted RSA private key, cached after first sign
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

    # -- token lifecycle (JWT Server Authentication) ----------------------

    def _fetch_token(self) -> _CachedToken:
        """Mint a Service-Account access token via the Box JWT grant: build + RS-sign a
        short-lived assertion, exchange it for a token, cache it. One clock-skew
        correction (using Box's Date header) handles a drifted host clock; 429/5xx are
        backed off; a 400/401 (bad keypair / app not authorized) raises BoxAuthError."""
        cfg = self.config
        clock_offset = 0.0
        resp: httpx.Response | None = None
        for corrected in (False, True):
            assertion = self._build_jwt_assertion(cfg, now=time.time() + clock_offset)
            resp = self._post_token(
                cfg.token_url,
                {
                    "grant_type": _JWT_BEARER_GRANT,
                    "client_id": cfg.client_id,
                    "client_secret": cfg.client_secret,
                    "assertion": assertion,
                },
            )
            if resp.status_code < 400:
                break
            # A 400/401 can be a drifted clock (Box rejects an assertion whose exp is
            # >60s ahead of ITS time). If Box's Date header shows real skew, rebuild
            # the assertion around Box's clock and retry exactly once.
            if not corrected and resp.status_code in (400, 401):
                server_time = _parse_http_date(resp.headers.get("Date"))
                if (
                    server_time is not None
                    and abs(server_time - time.time()) > _CLOCK_SKEW_RETRY_THRESHOLD_S
                ):
                    clock_offset = server_time - time.time()
                    logger.warning(
                        "box jwt: host clock drift ~%ss vs Box; rebuilding assertion and retrying once",
                        int(clock_offset),
                    )
                    continue
            break

        assert resp is not None  # the loop always assigns at least once
        if resp.status_code in (400, 401):
            # Bad keypair / app not authorized / stale clock land here. Never echo
            # resp.text — it can reflect the request / assertion.
            raise BoxAuthError(
                "Box rejected the JWT assertion "
                f"(HTTP {resp.status_code}; check the app keypair, authorization, scopes, and host clock)",
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
        logger.info("box jwt token acquired (ttl=%ss)", int(ttl))  # no token value
        return _CachedToken(access_token=token, expires_at_monotonic=deadline)

    def _post_token(self, token_url: str, data: dict[str, str]) -> httpx.Response:
        """POST the token request with the SAME bounded 429/5xx backoff the REST path uses."""
        attempt = 0
        while True:
            resp = self.http.post(
                token_url,
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            if resp.status_code in _RETRY_SAFE_STATUS and attempt < _MAX_RETRIES:
                self._backoff(attempt)
                attempt += 1
                continue
            return resp

    def _build_jwt_assertion(self, cfg: "BoxConfig", *, now: float) -> str:
        """Build + RS-sign the Box JWT assertion. Service Account: sub=enterpriseID,
        box_sub_type=enterprise. exp stays under Box's 60s ceiling; jti is a fresh
        anti-replay nonce per mint; aud is the (host-pinned) token endpoint."""
        issued = int(now)
        claims = {
            "iss": cfg.client_id,
            "sub": cfg.enterprise_id,
            "box_sub_type": "enterprise",
            "aud": cfg.token_url,
            "jti": secrets.token_urlsafe(_JTI_BYTES),
            "exp": issued + _ASSERTION_TTL_S,
            "iat": issued,
        }
        return jwt.encode(
            claims,
            self._private_key(),
            algorithm=cfg.jwt_algorithm,
            headers={"kid": cfg.jwt_public_key_id},
        )

    def _private_key(self) -> Any:
        """Decrypt + cache the RSA private key from the Config.JSON (passphrase-protected).
        Cached per-client so we decrypt once, not per mint. Never logged."""
        if self._priv_key is None:
            cfg = self.config
            passphrase = cfg.jwt_passphrase.encode("utf-8") if cfg.jwt_passphrase else None
            try:
                self._priv_key = load_pem_private_key(
                    cfg.jwt_private_key.encode("utf-8"), password=passphrase
                )
            except (ValueError, TypeError):
                # Wrong passphrase / malformed key — a config error, not transient.
                raise BoxConfigError(
                    "Box JWT private key could not be loaded "
                    "(bad passphrase or malformed key in BOX_CONFIG_JSON)"
                ) from None
        return self._priv_key

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
        files: dict[str, Any] | None = None,
    ) -> httpx.Response:
        """Issue an authenticated Box REST call. ``path`` is appended to
        ``base`` (default the api host; pass the upload host for ``files`` uploads).
        Refreshes the token once on a 401, then backs off on 429/5xx. ``files`` is a
        multipart map (httpx form) used by the file-upload op; when set, the body is
        sent as multipart/form-data instead of JSON. Returns the raw httpx.Response so
        callers can map Box-specific success/idempotent-conflict codes themselves
        (e.g. the 409-on-CreateFolder/Upload idempotency)."""
        return self._request_with_retry(
            method, path, json_body=json_body, params=params, base=base, files=files
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
        files: dict[str, Any] | None = None,
    ) -> httpx.Response:
        cfg = self.config
        url = f"{(base or cfg.api_base).rstrip('/')}{path}"
        headers = {
            "Authorization": f"Bearer {self.get_token(force_refresh=refreshed)}",
            "Accept": "application/json",
        }
        if files is not None:
            # Multipart upload (upload.box.com): never send a JSON body alongside.
            resp = self.http.request(method, url, headers=headers, files=files, params=params)
        else:
            resp = self.http.request(method, url, headers=headers, json=json_body, params=params)

        # 401: refresh the token exactly once, then retry.
        if resp.status_code == 401 and not refreshed:
            with self._lock:
                self._token = None  # drop the stale token
            return self._request_with_retry(
                method, path, json_body=json_body, params=params, base=base,
                attempt=attempt, refreshed=True, files=files,
            )
        if resp.status_code == 401:
            raise BoxAuthError("Box returned 401 after one token refresh", status=401)

        # Transient: bounded exponential backoff with jitter.
        if resp.status_code in _RETRY_SAFE_STATUS and attempt < _MAX_RETRIES:
            self._backoff(attempt)
            return self._request_with_retry(
                method, path, json_body=json_body, params=params, base=base,
                attempt=attempt + 1, refreshed=refreshed, files=files,
            )

        return resp

    @staticmethod
    def _backoff(attempt: int) -> None:
        base = _BASE_BACKOFF_S * (2 ** attempt)
        jitter = base * 0.25 * (random.random() * 2 - 1)
        time.sleep(max(0.0, base + jitter))

    # -- Layer-2 scope lock ------------------------------------------------

    def _assert_in_scope(self, item_type: str, item_id: str) -> None:
        """Refuse any op whose target is outside ``BOX_ALLOWED_ROOT_ID``. No-op when
        the env var is unset (production). The root passes free; a descendant is
        confirmed once via a cached ``path_collection`` lookup. ``item_type`` is the
        REST collection — ``"folders"`` or ``"files"``."""
        root = self.config.allowed_root_id
        if not root:
            return
        sid = str(item_id or "")
        if not sid or sid == root or sid in _SCOPE_VERIFIED:
            return
        if item_type not in ("folders", "files"):
            raise BoxScopeError(f"scope check: unsupported item_type {item_type!r}")
        resp = self.request("GET", f"/2.0/{item_type}/{sid}", params={"fields": "id,path_collection"})
        if resp.status_code >= 400:
            raise BoxScopeError(
                f"scope check could not resolve {item_type}/{sid} (HTTP {resp.status_code})",
                status=resp.status_code,
            )
        try:
            entries = (resp.json().get("path_collection") or {}).get("entries") or []
        except ValueError:
            entries = []
        if any(str(e.get("id")) == root for e in entries):
            _SCOPE_VERIFIED.add(sid)
            return
        raise BoxScopeError(
            f"{item_type}/{sid} is outside the allowed Box root (BOX_ALLOWED_ROOT_ID lock)"
        )

    # -- typed operations (back the connector ops) -------------------------

    def create_folder(self, name: str, parent_id: str) -> dict[str, Any]:
        """POST /2.0/folders. 409 item_name_in_use (case-insensitive) is an
        idempotent success: read the conflicting id back out of
        context_info.conflicts[0].id and return it tagged outcome='reused'."""
        self._assert_in_scope("folders", parent_id)
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

    def upload_file(
        self,
        folder_id: str,
        filename: str,
        content: bytes,
        content_type: str | None = None,
    ) -> dict[str, Any]:
        """POST /api/2.0/files/content (multipart) to the UPLOAD host — archive one
        evidence byte-stream into a case folder (the one-way Blob -> Box mirror,
        ADR-0012). Scope-locked to the parent folder (BOX_ALLOWED_ROOT_ID) BEFORE the
        bytes leave us. 409 item_name_in_use is an IDEMPOTENT success: the same
        filename already lives in the folder (a replayed archive), so we read the
        conflicting file id out of context_info.conflicts and return it tagged
        outcome='reused' — never a duplicate upload."""
        self._assert_in_scope("folders", folder_id)
        attributes = json.dumps({"name": filename, "parent": {"id": folder_id}})
        files = {
            # attributes part: (filename=None -> a plain form field), value, content-type
            "attributes": (None, attributes, "application/json"),
            "file": (filename, content, content_type or "application/octet-stream"),
        }
        resp = self.request(
            "POST", "/api/2.0/files/content", base=self.config.upload_base, files=files
        )
        if resp.status_code == 201:
            body = resp.json()
            entry = (body.get("entries") or [{}])[0] if isinstance(body, dict) else {}
            entry["outcome"] = "created"
            return entry
        if resp.status_code == 409:
            conflict_id = _conflict_id(resp)
            if conflict_id:
                logger.info("box file already exists in folder (409); reusing id")
                return {"id": conflict_id, "type": "file", "name": filename, "outcome": "reused"}
            raise BoxError("Box UploadFile returned 409 with no resolvable conflict id", status=409)
        raise BoxError(f"Box UploadFile returned HTTP {resp.status_code}", status=resp.status_code)

    def copy_file_request(
        self, template_id: str, folder_id: str, *, status: str = "active",
        expires_at: str | None = None, title: str | None = None,
    ) -> dict[str, Any]:
        self._assert_in_scope("folders", folder_id)
        body: dict[str, Any] = {"folder": {"id": folder_id, "type": "folder"}, "status": status}
        if expires_at:
            body["expires_at"] = expires_at
        if title:
            body["title"] = title
        resp = self.request("POST", f"/2.0/file_requests/{template_id}/copy", json_body=body)
        return _json_or_raise(resp, "CopyFileRequest")

    def get_shared_link(self, item_type: str, item_id: str, body: dict[str, Any]) -> dict[str, Any]:
        """item_type ∈ {files, folders}. PUT /2.0/{item_type}/{id}?fields=shared_link."""
        self._assert_in_scope(item_type, item_id)
        resp = self.request(
            "PUT", f"/2.0/{item_type}/{item_id}",
            params={"fields": "shared_link"}, json_body=body,
        )
        return _json_or_raise(resp, "GetSharedLink")

    def list_folder(self, folder_id: str, *, limit: int | None = None, offset: int | None = None) -> dict[str, Any]:
        self._assert_in_scope("folders", folder_id)
        params: dict[str, Any] = {"fields": "id,name,sha1,created_at,modified_at"}
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset
        resp = self.request("GET", f"/2.0/folders/{folder_id}/items", params=params)
        return _json_or_raise(resp, "ListFolder")

    def create_webhook(self, target: dict[str, Any], address: str, triggers: list[str]) -> dict[str, Any]:
        t_type = str(target.get("type") or "folder")
        self._assert_in_scope("files" if t_type == "file" else "folders", str(target.get("id") or ""))
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
    """Pull the conflicting item id from a 409 item_name_in_use body.

    CreateFolder returns ``context_info.conflicts`` as a LIST; the file-upload
    (files/content) 409 returns it as a SINGLE object (the conflicting file mini).
    Handle both so the upload idempotency reads the existing file id back out."""
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
    if isinstance(conflicts, dict):
        cid = conflicts.get("id")
        return str(cid) if cid is not None else None
    return None

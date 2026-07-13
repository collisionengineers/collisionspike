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

import base64
import hashlib
import json
import logging
import os
import random
import secrets
import threading
import time
from dataclasses import dataclass, field
from email.utils import parsedate_to_datetime
from typing import Any, Callable
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


def _validate_box_base(base_url: str, setting_label: str) -> None:
    """Raise BoxConfigError unless a configured Box base URL is HTTPS on box.com."""
    parts = urlsplit(base_url)
    host = (parts.hostname or "").lower()
    ok = parts.scheme == "https" and (host == "box.com" or host.endswith(_BOX_TOKEN_HOST_SUFFIX))
    if not ok:
        raise BoxConfigError(f"Refusing to use Box {setting_label}: must be an https *.box.com host")


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

# TKT-142: the streamed upload lane branches here. Box refuses an upload session
# for a file below its documented 20MB chunked-upload floor, so files AT/ABOVE
# this size go through an upload session (exact part_size chunks) and files
# below it go direct multipart. 20 MiB satisfies Box's floor under either MB
# reading, so a session is never refused for being too small; the 20,000,000–
# 20,971,519-byte sliver rides the direct lane, well inside its limits.
CHUNKED_UPLOAD_MIN_BYTES = 20 * 1024 * 1024

# TKT-142: bounded retries when the upload-session commit answers 202 (Box is
# still assembling the parts server-side).
_COMMIT_RETRY_MAX = 3
_COMMIT_RETRY_DEFAULT_S = 1.0
_COMMIT_RETRY_CAP_S = 5.0

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

# Layer-2 scope lock caches: folder/file ids already confirmed to sit under a root.
# Module-level so they survive across warm-worker requests (the facade builds a fresh
# BoxClient per request). The roots themselves never need caching (they short-circuit).
# Bounded in practice by the number of in-scope case folders.
#
# SPLIT ON PURPOSE (ADR-0022 R2 — load-bearing): `_SCOPE_VERIFIED` holds ids proven
# under the READ-WRITE root (BOX_ALLOWED_ROOT_ID) and is the ONLY cache the write-path
# `_assert_in_scope` consults; `_SCOPE_VERIFIED_RO` holds ids proven under a READ-ONLY
# archive root (BOX_READONLY_ROOT_IDS) and is consulted ONLY by `_assert_readable_scope`.
# A single shared cache would let an id verified for reading under the archive pass a
# later WRITE assertion — exactly the containment the one-way-mirror doctrine forbids.
_SCOPE_VERIFIED: set[str] = set()
_SCOPE_VERIFIED_RO: set[str] = set()


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
    # READ-ONLY archive roots (ADR-0022 R2 retro reconstruction): list/search/download
    # may additionally target these folders or descendants; create/upload/delete NEVER
    # may (the write path ignores this list entirely — one-way mirror, nothing is ever
    # written into or deleted from the archive). Comma-separated BOX_READONLY_ROOT_IDS.
    readonly_root_ids: tuple[str, ...] = ()

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
        readonly_root_ids = tuple(
            part.strip()
            for part in os.environ.get("BOX_READONLY_ROOT_IDS", "").split(",")
            if part.strip()
        )
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
            readonly_root_ids=readonly_root_ids,
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
        files_factory: Callable[[], dict[str, Any]] | None = None,
    ) -> httpx.Response:
        """Issue an authenticated Box REST call. ``path`` is appended to
        ``base`` (default the api host; pass the upload host for ``files`` uploads).
        Refreshes the token once on a 401, then backs off on 429/5xx. ``files`` is a
        multipart map (httpx form) used by the file-upload op; when set, the body is
        sent as multipart/form-data instead of JSON. ``files_factory`` (TKT-142) is
        the streamed variant: it is invoked ONCE PER ATTEMPT so a retried multipart
        body built over a file object is re-seeked/rebuilt instead of re-sending an
        exhausted stream. Returns the raw httpx.Response so callers can map
        Box-specific success/idempotent-conflict codes themselves (e.g. the
        409-on-CreateFolder/Upload idempotency)."""
        return self._request_with_retry(
            method, path, json_body=json_body, params=params, base=base,
            files=files, files_factory=files_factory,
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
        files_factory: Callable[[], dict[str, Any]] | None = None,
    ) -> httpx.Response:
        cfg = self.config
        url = f"{(base or cfg.api_base).rstrip('/')}{path}"
        headers = {
            "Authorization": f"Bearer {self.get_token(force_refresh=refreshed)}",
            "Accept": "application/json",
        }
        send_files = files_factory() if files_factory is not None else files
        if send_files is not None:
            # Multipart upload (upload.box.com): never send a JSON body alongside.
            resp = self.http.request(method, url, headers=headers, files=send_files, params=params)
        else:
            resp = self.http.request(method, url, headers=headers, json=json_body, params=params)

        # 401: refresh the token exactly once, then retry.
        if resp.status_code == 401 and not refreshed:
            with self._lock:
                self._token = None  # drop the stale token
            return self._request_with_retry(
                method, path, json_body=json_body, params=params, base=base,
                attempt=attempt, refreshed=True, files=files, files_factory=files_factory,
            )
        if resp.status_code == 401:
            raise BoxAuthError("Box returned 401 after one token refresh", status=401)

        # Transient: bounded exponential backoff with jitter.
        if resp.status_code in _RETRY_SAFE_STATUS and attempt < _MAX_RETRIES:
            self._backoff(attempt)
            return self._request_with_retry(
                method, path, json_body=json_body, params=params, base=base,
                attempt=attempt + 1, refreshed=refreshed, files=files, files_factory=files_factory,
            )

        return resp

    @staticmethod
    def _backoff(attempt: int) -> None:
        base = _BASE_BACKOFF_S * (2 ** attempt)
        jitter = base * 0.25 * (random.random() * 2 - 1)
        time.sleep(max(0.0, base + jitter))

    # -- Layer-2 scope lock ------------------------------------------------

    def _assert_in_scope(
        self,
        item_type: str,
        item_id: str,
        *,
        fresh: bool = False,
    ) -> None:
        """Refuse any op whose target is outside ``BOX_ALLOWED_ROOT_ID``. No-op when
        the env var is unset (production). The root passes free; a descendant is
        confirmed once via a cached ``path_collection`` lookup. ``item_type`` is the
        REST collection — ``"folders"`` or ``"files"``."""
        root = self.config.allowed_root_id
        if not root:
            return
        sid = str(item_id or "")
        if not sid or sid == root or (not fresh and sid in _SCOPE_VERIFIED):
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

    def verify_write_scope(self, folder_id: str) -> str:
        """Strictly attest a folder before an autonomous write lane is activated.

        The generic connector deliberately treats an unset ``BOX_ALLOWED_ROOT_ID`` as
        the production/unlocked posture. Autonomous MCP ingestion has a narrower
        contract: an unset lock is a configuration failure, never permission to write.
        Return the configured root only after a FRESH, uncached path_collection read.
        This deliberately ignores ``_SCOPE_VERIFIED``: a folder can be moved after an
        earlier check, and the autonomous upload must observe that move immediately
        before bytes leave the facade.
        """
        root = self.config.allowed_root_id
        if not root:
            raise BoxScopeError("write-scope attestation requires BOX_ALLOWED_ROOT_ID")
        sid = str(folder_id or "").strip()
        if not sid:
            raise BoxScopeError("write-scope attestation requires a folder id")
        if sid == root:
            return root
        resp = self.request(
            "GET", f"/2.0/folders/{sid}", params={"fields": "id,path_collection"}
        )
        if resp.status_code >= 400:
            raise BoxScopeError(
                f"fresh write-scope check could not resolve folders/{sid} "
                f"(HTTP {resp.status_code})",
                status=resp.status_code,
            )
        try:
            entries = (resp.json().get("path_collection") or {}).get("entries") or []
        except ValueError:
            entries = []
        if not any(str(entry.get("id")) == root for entry in entries):
            raise BoxScopeError(
                f"folders/{sid} is outside the allowed Box root on fresh write-scope check"
            )
        return root

    def _readable_roots(self) -> tuple[str, ...]:
        """Every root a READ may target: the RW root plus the RO archive roots."""
        cfg = self.config
        roots = [cfg.allowed_root_id, *cfg.readonly_root_ids]
        return tuple(r for r in roots if r)

    def _assert_readable_scope(self, item_type: str, item_id: str) -> None:
        """The READ-side scope guard (ADR-0022 R2): list/search/download may target the
        RW root OR any READ-ONLY archive root (``BOX_READONLY_ROOT_IDS``) or descendant.
        Write ops keep using ``_assert_in_scope`` (RW root only) — the RO roots never
        satisfy a write. Mirrors ``_assert_in_scope``'s posture when the RW lock is
        lifted (``BOX_ALLOWED_ROOT_ID`` unset = production): reads are then
        unrestricted too. An id proven under an RO root is cached in
        ``_SCOPE_VERIFIED_RO`` ONLY — never the RW cache (the load-bearing split)."""
        cfg = self.config
        if not cfg.allowed_root_id:
            return  # lock lifted (production posture) — same no-op as the write guard
        sid = str(item_id or "")
        roots = self._readable_roots()
        if not sid or sid in roots or sid in _SCOPE_VERIFIED or sid in _SCOPE_VERIFIED_RO:
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
        ancestor_ids = {str(e.get("id")) for e in entries}
        if cfg.allowed_root_id in ancestor_ids:
            _SCOPE_VERIFIED.add(sid)  # genuinely RW-rooted — writes may reuse it
            return
        if any(r in ancestor_ids for r in cfg.readonly_root_ids):
            _SCOPE_VERIFIED_RO.add(sid)  # READ-ONLY — must never enter the RW cache
            return
        raise BoxScopeError(
            f"{item_type}/{sid} is outside the allowed/read-only Box roots (scope lock)"
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
        *,
        _disambiguated: bool = False,
    ) -> dict[str, Any]:
        """POST /api/2.0/files/content (multipart) to the UPLOAD host — archive one
        evidence byte-stream into a case folder (the one-way Blob -> Box mirror,
        ADR-0012). Scope-locked to the parent folder (BOX_ALLOWED_ROOT_ID) BEFORE the
        bytes leave us.

        409 item_name_in_use handling (TKT-087 hardened, shared with the streamed
        lanes via ``_resolve_upload_conflict``): a 409 is an IDEMPOTENT success
        ONLY when the conflicting file holds the SAME bytes (Box sha1 ==
        sha1(content)) — the replayed-archive case. The old blind reuse mis-linked
        evidence when two DIFFERENT emails on one case archived under the same
        generic filename (message.eml / email-body.txt): the later email's evidence
        row got the earlier email's Box file id and its bytes never reached Box.
        Now: sha1 match -> outcome='reused'; sha1 MISMATCH -> re-upload once under a
        content-disambiguated name (`<stem>-<sha1[:8]>.<ext>`), outcome='created'
        under the new name; sha1 unverifiable -> legacy reuse at WARNING level (never
        block an archive on a missing hash)."""
        self._assert_in_scope("folders", folder_id)
        _validate_box_base(self.config.upload_base, "upload base")
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
            local_sha1 = hashlib.sha1(content).hexdigest()
            action, payload = self._resolve_upload_conflict(
                resp, filename, local_sha1, disambiguated=_disambiguated
            )
            if action == "retry":
                return self.upload_file(
                    folder_id, payload, content, content_type, _disambiguated=True
                )
            return payload
        raise BoxError(f"Box UploadFile returned HTTP {resp.status_code}", status=resp.status_code)

    def _resolve_upload_conflict(
        self, resp: httpx.Response, filename: str, local_sha1: str, *, disambiguated: bool
    ) -> tuple[str, Any]:
        """The shared TKT-087 409 policy for EVERY upload lane (bytes multipart,
        streamed multipart, upload-session create, upload-session commit).

        Returns ``("reused", entry)`` when the conflicting file provably holds the
        SAME bytes (Box sha1 == local sha1) — or unverifiably (legacy warn-level
        reuse; never block an archive on a missing hash) — and ``("retry",
        alt_filename)`` when the bytes DIFFER and one content-disambiguated retry
        is still allowed. Raises BoxError when the conflict id is unresolvable or
        the disambiguated name ITSELF conflicted with different bytes."""
        conflict = _conflict_entry(resp)
        conflict_id = str(conflict["id"]) if conflict and conflict.get("id") is not None else None
        if not conflict_id:
            raise BoxError("Box returned 409 with no resolvable conflict id", status=409)
        remote_sha1 = conflict.get("sha1") if conflict else None
        if not remote_sha1:
            remote_sha1 = self._file_sha1(conflict_id)
        if remote_sha1 and str(remote_sha1).lower() != str(local_sha1).lower():
            # Same NAME, DIFFERENT bytes — blind reuse would mis-link the evidence
            # row (TKT-087). Retry ONCE under a content-derived name; a 409 on THAT
            # name can only be the same bytes (sha1-slice in the name), which the
            # retried call verifies and reuses.
            if disambiguated:
                raise BoxError(
                    "Box 409 name-conflict persisted after content disambiguation",
                    status=409,
                )
            logger.warning(
                "box 409 name-conflict with DIFFERENT content (sha1 mismatch); "
                "re-uploading under a content-disambiguated name"
            )
            return "retry", _disambiguate_filename(filename, str(local_sha1)[:8])
        if remote_sha1:
            logger.info(
                "box file already exists in folder (409) with matching content; reusing id"
            )
        else:
            logger.warning(
                "box file already exists in folder (409); content match UNVERIFIABLE "
                "(no sha1) — reusing id (legacy behaviour)"
            )
        return "reused", {"id": conflict_id, "type": "file", "name": filename, "outcome": "reused"}

    def _file_sha1(self, file_id: str) -> str | None:
        """Best-effort sha1 of an existing Box file (the 409 conflict target). A
        failure returns None — the caller degrades to the legacy warn-level reuse
        rather than blocking an archive on a hash read."""
        try:
            self._assert_readable_scope("files", file_id)
            resp = self.request("GET", f"/2.0/files/{file_id}", params={"fields": "sha1"})
            if resp.status_code == 200:
                sha1 = resp.json().get("sha1")
                return str(sha1) if sha1 else None
        except Exception:  # noqa: BLE001 — advisory read; never propagate
            pass
        return None

    # -- TKT-142: streamed upload lanes (direct multipart / chunked session) --

    def upload_file_stream(
        self,
        folder_id: str,
        filename: str,
        fileobj: Any,
        *,
        size: int,
        sha1_hex: str,
        content_type: str | None = None,
        _disambiguated: bool = False,
    ) -> dict[str, Any]:
        """Archive one evidence stream WITHOUT holding the bytes as one in-memory
        blob (TKT-142 — the base64-in-JSON lane killed the worker at 17.6 MB).
        ``fileobj`` is a local seekable file object (the facade's spooled blob
        download); ``size``/``sha1_hex`` were computed by the caller while
        spooling, so nothing here re-reads the stream to measure it.

        Size-branched:
        * ``size <  CHUNKED_UPLOAD_MIN_BYTES`` — direct multipart POST
          /api/2.0/files/content STREAMING the file object (httpx multipart file
          part; rebuilt + re-seeked per retry attempt via ``files_factory``).
        * ``size >= CHUNKED_UPLOAD_MIN_BYTES`` — Box chunked-upload session
          (create -> exact part_size parts with per-part sha digests -> commit
          with the whole-file digest).

        Both lanes share the TKT-087 409-idempotency via
        ``_resolve_upload_conflict`` (reuse on same bytes, one content-
        disambiguated retry on different bytes). Returns the file entry tagged
        ``outcome`` (created/reused) + ``lane`` (direct/chunked)."""
        self._assert_in_scope("folders", folder_id)
        _validate_box_base(self.config.upload_base, "upload base")
        local_sha1 = str(sha1_hex or "").lower()
        if size >= CHUNKED_UPLOAD_MIN_BYTES:
            return self._chunked_upload(
                folder_id, filename, fileobj, size, local_sha1, _disambiguated=_disambiguated
            )

        attributes = json.dumps({"name": filename, "parent": {"id": folder_id}})

        def _files() -> dict[str, Any]:
            # Rebuilt per attempt: re-seek so a 401-refresh/backoff retry never
            # re-sends an exhausted stream.
            fileobj.seek(0)
            return {
                "attributes": (None, attributes, "application/json"),
                "file": (filename, fileobj, content_type or "application/octet-stream"),
            }

        resp = self.request(
            "POST", "/api/2.0/files/content", base=self.config.upload_base, files_factory=_files
        )
        if resp.status_code == 201:
            body = resp.json()
            entry = (body.get("entries") or [{}])[0] if isinstance(body, dict) else {}
            entry["outcome"] = "created"
            entry["lane"] = "direct"
            return entry
        if resp.status_code == 409:
            action, payload = self._resolve_upload_conflict(
                resp, filename, local_sha1, disambiguated=_disambiguated
            )
            if action == "retry":
                return self.upload_file_stream(
                    folder_id, payload, fileobj,
                    size=size, sha1_hex=local_sha1, content_type=content_type,
                    _disambiguated=True,
                )
            payload["lane"] = "direct"
            return payload
        raise BoxError(f"Box UploadFile returned HTTP {resp.status_code}", status=resp.status_code)

    def _chunked_upload(
        self,
        folder_id: str,
        filename: str,
        fileobj: Any,
        size: int,
        local_sha1: str,
        *,
        _disambiguated: bool = False,
    ) -> dict[str, Any]:
        """Box chunked-upload session (files >= CHUNKED_UPLOAD_MIN_BYTES):
        POST /api/2.0/files/upload_sessions {folder_id, file_size, file_name} ->
        PUT each part in EXACTLY session.part_size chunks (last part smaller) with
        ``digest: sha=<base64 part sha1>`` + ``content-range`` -> POST .../commit
        with the parts list, the whole-file digest, and {name, parent} attributes.
        A 409 on create OR commit routes through the shared TKT-087 conflict
        policy; parts retry once on 5xx (inside ``_put_part``)."""
        cfg = self.config
        create = self.request(
            "POST", "/api/2.0/files/upload_sessions", base=cfg.upload_base,
            json_body={"folder_id": folder_id, "file_size": size, "file_name": filename},
        )
        if create.status_code == 409:
            # Same name already in the folder — resolved BEFORE any part moves.
            action, payload = self._resolve_upload_conflict(
                create, filename, local_sha1, disambiguated=_disambiguated
            )
            if action == "retry":
                return self._chunked_upload(
                    folder_id, payload, fileobj, size, local_sha1, _disambiguated=True
                )
            payload["lane"] = "chunked"
            return payload
        if create.status_code not in (200, 201):
            raise BoxError(
                f"Box CreateUploadSession returned HTTP {create.status_code}",
                status=create.status_code,
            )
        try:
            session = create.json()
        except ValueError:
            session = {}
        if not isinstance(session, dict):
            session = {}
        part_size = int(session.get("part_size") or 0)
        if part_size <= 0:
            raise BoxError("Box upload session did not include a part_size")
        session_id = str(session.get("id") or "")
        endpoints = session.get("session_endpoints") or {}
        part_url = str(
            endpoints.get("upload_part")
            or f"{cfg.upload_base}/api/2.0/files/upload_sessions/{session_id}"
        )
        commit_url = str(
            endpoints.get("commit")
            or f"{cfg.upload_base}/api/2.0/files/upload_sessions/{session_id}/commit"
        )
        abort_url = str(
            endpoints.get("abort")
            or f"{cfg.upload_base}/api/2.0/files/upload_sessions/{session_id}"
        )
        # Session endpoints come from the response body — pin them to Box-owned
        # https hosts before any byte or bearer goes to them.
        _validate_box_base(part_url, "upload-session part endpoint")
        _validate_box_base(commit_url, "upload-session commit endpoint")

        fileobj.seek(0)
        parts: list[dict[str, Any]] = []
        offset = 0
        while offset < size:
            chunk = fileobj.read(min(part_size, size - offset))
            if not chunk:
                raise BoxError("file stream ended before the declared size (truncated read)")
            parts.append(self._put_part(part_url, chunk, offset, offset + len(chunk) - 1, size))
            offset += len(chunk)

        resp = self._commit_upload_session(commit_url, parts, folder_id, filename, local_sha1)
        if resp.status_code == 201:
            body = resp.json()
            entry = (body.get("entries") or [{}])[0] if isinstance(body, dict) else {}
            entry["outcome"] = "created"
            entry["lane"] = "chunked"
            return entry
        if resp.status_code == 409:
            action, payload = self._resolve_upload_conflict(
                resp, filename, local_sha1, disambiguated=_disambiguated
            )
            if action == "retry":
                self._abort_upload_session(abort_url)
                return self._chunked_upload(
                    folder_id, payload, fileobj, size, local_sha1, _disambiguated=True
                )
            payload["lane"] = "chunked"
            return payload
        raise BoxError(
            f"Box upload-session commit returned HTTP {resp.status_code}", status=resp.status_code
        )

    def _put_part(
        self, part_url: str, chunk: bytes, start: int, end: int, total: int
    ) -> dict[str, Any]:
        """PUT one upload-session part. Headers per the Box contract:
        ``digest: sha=<base64 sha1 of the part>`` + ``content-range: bytes
        {start}-{end}/{total}``. One 401 forces a token refresh; one retry on a
        5xx (bounded — a part storm must not multiply a 20+ MB transfer)."""
        digest = "sha=" + base64.b64encode(hashlib.sha1(chunk).digest()).decode("ascii")
        headers = {
            "Authorization": f"Bearer {self.get_token()}",
            "Digest": digest,
            "Content-Range": f"bytes {start}-{end}/{total}",
            "Content-Type": "application/octet-stream",
            "Accept": "application/json",
        }
        resp = self.http.put(part_url, content=chunk, headers=headers)
        if resp.status_code == 401:
            headers["Authorization"] = f"Bearer {self.get_token(force_refresh=True)}"
            resp = self.http.put(part_url, content=chunk, headers=headers)
        if 500 <= resp.status_code < 600:
            logger.warning(
                "box upload part %s-%s got HTTP %s; retrying once", start, end, resp.status_code
            )
            resp = self.http.put(part_url, content=chunk, headers=headers)
        if resp.status_code != 200:
            raise BoxError(
                f"Box UploadPart returned HTTP {resp.status_code}", status=resp.status_code
            )
        try:
            part = resp.json().get("part")
        except ValueError:
            part = None
        if not isinstance(part, dict):
            raise BoxError("Box UploadPart response did not include a part record")
        return part

    def _commit_upload_session(
        self,
        commit_url: str,
        parts: list[dict[str, Any]],
        folder_id: str,
        filename: str,
        whole_sha1_hex: str,
    ) -> httpx.Response:
        """POST the session commit: parts list + {name, parent} attributes in the
        body, ``digest: sha=<base64 sha1 of the WHOLE file>`` header. A 202 (Box
        still assembling parts) is retried bounded, honouring Retry-After. The
        raw response is returned so the caller maps 201/409 itself."""
        body = {"parts": parts, "attributes": {"name": filename, "parent": {"id": folder_id}}}
        digest = "sha=" + base64.b64encode(bytes.fromhex(whole_sha1_hex)).decode("ascii")
        attempt = 0
        while True:
            headers = {
                "Authorization": f"Bearer {self.get_token()}",
                "Digest": digest,
                "Accept": "application/json",
            }
            resp = self.http.post(commit_url, json=body, headers=headers)
            if resp.status_code == 401:
                headers["Authorization"] = f"Bearer {self.get_token(force_refresh=True)}"
                resp = self.http.post(commit_url, json=body, headers=headers)
            if resp.status_code == 202 and attempt < _COMMIT_RETRY_MAX:
                try:
                    delay = float(resp.headers.get("Retry-After") or _COMMIT_RETRY_DEFAULT_S)
                except (TypeError, ValueError):
                    delay = _COMMIT_RETRY_DEFAULT_S
                time.sleep(max(0.0, min(delay, _COMMIT_RETRY_CAP_S)))
                attempt += 1
                continue
            return resp

    def _abort_upload_session(self, abort_url: str) -> None:
        """Best-effort DELETE of an upload session whose commit conflicted — the
        disambiguated retry opens a fresh session; a leaked one merely expires."""
        try:
            self.http.delete(
                abort_url, headers={"Authorization": f"Bearer {self.get_token()}"}
            )
        except Exception:  # noqa: BLE001 — advisory cleanup; never propagate
            logger.info("upload-session abort failed (ignored)")

    def copy_file_request(
        self, template_id: str, folder_id: str, *, status: str = "active",
        expires_at: str | None = None, title: str | None = None,
    ) -> dict[str, Any]:
        # The template and destination must both belong to the configured
        # read-write root. The destination check alone would allow a caller to
        # reference an arbitrary enterprise File Request as the copy source.
        if self.config.allowed_root_id:
            self.get_file_request(template_id)
        # File Requests can be handed to external uploaders. Re-attest the
        # destination immediately before the copy instead of trusting a warm
        # worker's cached path after an administrator moved the folder.
        self._assert_in_scope("folders", folder_id, fresh=True)
        body: dict[str, Any] = {"folder": {"id": folder_id, "type": "folder"}, "status": status}
        if expires_at:
            body["expires_at"] = expires_at
        if title:
            body["title"] = title
        resp = self.request("POST", f"/2.0/file_requests/{template_id}/copy", json_body=body)
        if 200 <= resp.status_code < 300:
            copied = _json_or_raise(resp, "CopyFileRequest")
            copied["outcome"] = "created"
            return copied
        if resp.status_code == 409:
            # A timeout/crash can occur after Box created the destination request but
            # before the API stamped it. Box reports that replay as a conflict; recover
            # the existing request and return it as an idempotent success.
            conflict_id = _conflict_id(resp)
            if conflict_id:
                existing = self.get_file_request(conflict_id, expected_folder_id=folder_id)
                existing["outcome"] = "reused"
                return existing
            raise BoxError("Box CopyFileRequest returned 409 with no resolvable conflict id", status=409)
        raise BoxError(
            f"Box CopyFileRequest returned HTTP {resp.status_code}", status=resp.status_code
        )

    def get_shared_link(self, item_type: str, item_id: str, body: dict[str, Any]) -> dict[str, Any]:
        """item_type ∈ {files, folders}. PUT /2.0/{item_type}/{id}?fields=shared_link."""
        self._assert_in_scope(item_type, item_id)
        resp = self.request(
            "PUT", f"/2.0/{item_type}/{item_id}",
            params={"fields": "shared_link"}, json_body=body,
        )
        return _json_or_raise(resp, "GetSharedLink")

    def get_folder(self, folder_id: str) -> dict[str, Any]:
        """Read fresh folder identity after proving it is under the writable root.

        This intentionally uses the write-side scope guard rather than the broader
        readable-root guard: callers use it before adopting an existing folder as a
        case's durable Archive link.
        """
        self._assert_in_scope("folders", folder_id, fresh=True)
        resp = self.request(
            "GET",
            f"/2.0/folders/{folder_id}",
            params={"fields": "id,name,parent,path_collection"},
        )
        return _json_or_raise(resp, "GetFolder")

    def list_folder(self, folder_id: str, *, limit: int | None = None, offset: int | None = None) -> dict[str, Any]:
        # READ op: an RO archive folder may be listed (ADR-0022 R2) — write ops still
        # refuse it via _assert_in_scope. Fields widened additively for the retro
        # instruction pick (type/size distinguish files from subfolders).
        self._assert_readable_scope("folders", folder_id)
        params: dict[str, Any] = {"fields": "id,name,type,sha1,size,created_at,modified_at"}
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset
        resp = self.request("GET", f"/2.0/folders/{folder_id}/items", params=params)
        return _json_or_raise(resp, "ListFolder")

    def search_content(
        self,
        query: str,
        root_ids: list[str] | tuple[str, ...],
        *,
        item_type: str | None = None,
        content_types: list[str] | None = None,
        limit: int = 30,
    ) -> dict[str, Any]:
        """GET /2.0/search scoped to the given ancestor roots (ADR-0022 R2 — the retro
        reconstruction's find-the-case-folder primitive). Box full-text search covers
        file NAMES and CONTENTS, so a claim reference or registration inside an archived
        instruction PDF/.eml hits even when nothing is named after it.

        READ-ONLY + double-guarded: every requested root must be one of the configured
        readable roots (RW + RO — defence in depth over the facade route's own check),
        and every returned entry is POST-FILTERED to sit under one of the requested
        roots via its path_collection (`ancestor_folder_ids` is treated as advisory,
        not trusted). `filtered_out` reports how many hits the post-filter dropped."""
        roots = tuple(str(r).strip() for r in root_ids if str(r).strip())
        if not roots:
            raise BoxScopeError("search requires at least one ancestor root id")
        readable = self._readable_roots()
        if readable and not all(r in readable for r in roots):
            raise BoxScopeError(
                "search root outside the configured allowed/read-only Box roots (scope lock)"
            )
        params: dict[str, Any] = {
            "query": query,
            "ancestor_folder_ids": ",".join(roots),
            "fields": "id,name,type,size,created_at,parent,path_collection",
            "limit": limit,
        }
        if item_type:
            params["type"] = item_type
        if content_types:
            params["content_types"] = ",".join(content_types)
        resp = self.request("GET", "/2.0/search", params=params)
        body = _json_or_raise(resp, "Search")
        entries = body.get("entries") or []
        kept = [e for e in entries if _entry_under_roots(e, roots)]
        return {
            "entries": kept,
            "total_count": body.get("total_count", len(kept)),
            "filtered_out": len(entries) - len(kept),
        }

    def download_file(self, file_id: str, *, max_bytes: int | None = None) -> dict[str, Any]:
        """GET /2.0/files/{id}/content (ADR-0022 R2 — fetch the archived original
        instruction `.eml`/document for reconstruction). READ op: an RO archive file is
        allowed. Box replies 302 to a time-limited dl host URL; that redirect is
        followed for THIS call only (the pre-signed URL carries its own auth — the
        bearer header is NOT forwarded) after a host pin (box.com / boxcloud.com).
        Size-capped BEFORE the bytes move (metadata probe) and after (belt-and-braces)
        because the facade rides base64-in-JSON."""
        self._assert_readable_scope("files", file_id)
        cap = max_bytes if max_bytes is not None else _download_cap_bytes()
        meta = _json_or_raise(
            self.request("GET", f"/2.0/files/{file_id}", params={"fields": "id,name,size,sha1"}),
            "GetFileInfo",
        )
        declared = int(meta.get("size") or 0)
        if declared > cap:
            raise BoxError(
                f"file exceeds the facade download cap ({declared} > {cap} bytes)", status=413
            )
        resp = self.request("GET", f"/2.0/files/{file_id}/content")
        if resp.status_code == 302:
            location = resp.headers.get("Location") or resp.headers.get("location") or ""
            _validate_box_download_host(location)
            dl = self.http.get(location, follow_redirects=True)
            if dl.status_code != 200:
                raise BoxError(
                    f"Box download URL returned HTTP {dl.status_code}", status=dl.status_code
                )
            content = dl.content
        elif resp.status_code == 200:
            content = resp.content
        elif resp.status_code == 202:
            # File not yet available (Box still processing) — transient; the Durable
            # activity retry policy absorbs it.
            raise BoxError("Box file is not yet available for download (202)", status=202)
        else:
            raise BoxError(
                f"Box DownloadFile returned HTTP {resp.status_code}", status=resp.status_code
            )
        if len(content) > cap:
            raise BoxError(
                f"downloaded bytes exceed the facade cap ({len(content)} > {cap})", status=413
            )
        return {
            "id": str(meta.get("id") or file_id),
            "name": str(meta.get("name") or ""),
            "size": len(content),
            "sha1": str(meta.get("sha1") or ""),
            "content": content,
        }

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

    def _validated_file_request(
        self,
        value: dict[str, Any],
        *,
        expected_folder_id: str | None = None,
    ) -> dict[str, Any]:
        folder = value.get("folder")
        folder_id = str(folder.get("id") or "").strip() if isinstance(folder, dict) else ""
        if not folder_id:
            raise BoxScopeError("Box File Request response has no folder identity")
        if expected_folder_id and folder_id != str(expected_folder_id).strip():
            raise BoxScopeError("Box File Request is not attached to the expected case folder")
        # A persisted File Request is reusable only while its current parent is
        # freshly confirmed under the allowed root. A cached prior ancestry is
        # not sufficient because Box folders can be moved.
        self._assert_in_scope("folders", folder_id, fresh=True)
        return value

    def get_file_request(
        self,
        file_request_id: str,
        *,
        expected_folder_id: str | None = None,
    ) -> dict[str, Any]:
        resp = self.request("GET", f"/2.0/file_requests/{file_request_id}")
        value = _json_or_raise(resp, "GetFileRequest")
        return self._validated_file_request(value, expected_folder_id=expected_folder_id)

    def update_file_request(
        self,
        file_request_id: str,
        body: dict[str, Any],
        *,
        expected_folder_id: str,
    ) -> dict[str, Any]:
        # Resolve and validate before mutating. File Request IDs are enterprise-
        # global and cannot be treated as proof of case/root ownership.
        self.get_file_request(file_request_id, expected_folder_id=expected_folder_id)
        resp = self.request("PUT", f"/2.0/file_requests/{file_request_id}", json_body=body)
        value = _json_or_raise(resp, "UpdateFileRequest")
        return self._validated_file_request(value, expected_folder_id=expected_folder_id)

    def delete_file_request(self, file_request_id: str, *, expected_folder_id: str) -> dict[str, Any]:
        self.get_file_request(file_request_id, expected_folder_id=expected_folder_id)
        resp = self.request("DELETE", f"/2.0/file_requests/{file_request_id}")
        if resp.status_code in (200, 204):
            return {"deleted": True, "id": file_request_id}
        raise BoxError(f"Box DeleteFileRequest returned HTTP {resp.status_code}", status=resp.status_code)


def _download_cap_bytes() -> int:
    """The facade download cap (base64-in-JSON transport). Overridable per app via
    BOX_DOWNLOAD_MAX_BYTES; default 25 MiB. Read per call so tests can vary it."""
    raw = os.environ.get("BOX_DOWNLOAD_MAX_BYTES", "").strip()
    try:
        value = int(raw) if raw else 0
    except ValueError:
        value = 0
    return value if value > 0 else 26_214_400


def _validate_box_download_host(location: str) -> None:
    """Pin the 302 download redirect to a Box-owned host (box.com / boxcloud.com —
    Box serves file bytes from dl.boxcloud.com) over https, BEFORE following it."""
    parts = urlsplit(location)
    host = (parts.hostname or "").lower()
    ok = parts.scheme == "https" and (
        host == "box.com"
        or host.endswith(".box.com")
        or host == "boxcloud.com"
        or host.endswith(".boxcloud.com")
    )
    if not ok:
        raise BoxError("Refusing Box download redirect: not an https box.com/boxcloud.com host")


def _entry_under_roots(entry: dict[str, Any], root_ids: tuple[str, ...]) -> bool:
    """True when a search hit provably sits under one of the requested roots — the
    entry IS a root, or its path_collection names one. Entries with no resolvable
    ancestry are DROPPED (never trusted into a reconstruction)."""
    if str(entry.get("id") or "") in root_ids:
        return True
    path = (entry.get("path_collection") or {}).get("entries") or []
    return any(str(e.get("id")) in root_ids for e in path)


def resolve_case_folder(
    entry: dict[str, Any], root_ids: list[str] | tuple[str, ...]
) -> dict[str, str] | None:
    """From a search hit, the CASE FOLDER = the ancestor DIRECTLY under the first
    matching archive root in the hit's path_collection (archive layout: one folder per
    case, named the Case/PO, directly under a root — nesting deeper inside the case
    folder is fine, the direct-child ancestor is still the case folder). A FOLDER hit
    that is itself the direct child IS the case folder; a FILE loose at root level has
    no case folder (None). Pure — unit-testable without a client."""
    roots = {str(r).strip() for r in root_ids if str(r).strip()}
    path = (entry.get("path_collection") or {}).get("entries") or []
    for i, ancestor in enumerate(path):
        if str(ancestor.get("id")) not in roots:
            continue
        if i + 1 < len(path):
            nxt = path[i + 1]
            return {"id": str(nxt.get("id") or ""), "name": str(nxt.get("name") or "")}
        if str(entry.get("type") or "") == "folder":
            return {"id": str(entry.get("id") or ""), "name": str(entry.get("name") or "")}
        return None
    return None


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
    entry = _conflict_entry(resp)
    if entry is None:
        return None
    cid = entry.get("id")
    return str(cid) if cid is not None else None


def _conflict_entry(resp: httpx.Response) -> dict[str, Any] | None:
    """The full conflicting-item mini from a 409 body (id + name + sha1 when Box
    includes it — the upload 409's file mini usually carries sha1, which is what
    lets ``upload_file`` verify a reuse is genuinely the same bytes; TKT-087)."""
    try:
        body = resp.json()
    except ValueError:
        return None
    if not isinstance(body, dict):
        return None
    conflicts = (body.get("context_info") or {}).get("conflicts")
    if isinstance(conflicts, list) and conflicts:
        first = conflicts[0]
        return first if isinstance(first, dict) else None
    if isinstance(conflicts, dict):
        return conflicts
    return None


def _disambiguate_filename(filename: str, token: str) -> str:
    """`report.pdf` + `a1b2c3d4` -> `report-a1b2c3d4.pdf` (extension preserved so
    downstream extension-keyed classification is unchanged; TKT-087)."""
    name = str(filename or "").strip() or "file"
    stem, dot, ext = name.rpartition(".")
    if dot and stem:
        return f"{stem}-{token}.{ext}"
    return f"{name}-{token}"

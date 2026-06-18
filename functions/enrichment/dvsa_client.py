"""DVSA MOT History API client — direct, no gateway.

[BUILD] — authored offline, exercised only by mocked pytest (respx). No live
DVSA, no Azure/tenant contact. The real token + history endpoints are reached
ONLY at runtime inside the deployed Function.

What this replaces
------------------
The former ``gateway_client.py`` routed every call through the GCP
``ce-mcp-gateway`` (OAuth-MCP over Cloud Run). That hop is gone: the DVSA MOT
History API is itself Microsoft-Entra-authenticated, so the Function talks to it
directly.

    POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
        grant_type=client_credentials&client_id=..&client_secret=..&scope=..
      -> { "access_token": "..", "expires_in": 3599 }

    GET  {dvsa_api_base}/v1/trade/vehicles/registration/{reg}
        Authorization: Bearer {token}
        X-API-Key: {api_key}
      -> the DVSA vehicle JSON (make/model/motTests[]/…)

Ported from ``collisionplugin/connectors/dvladvsa/server/src/dvsa-client.ts``:
token caching with a 60s refresh skew, one 401 refresh-and-retry, and bounded
exponential backoff with jitter on retry-safe upstream errors.

Secret handling
---------------
``client_id`` / ``client_secret`` / ``api_key`` come from environment variables
which, in the deployed Function, are **Azure Key Vault references**
(``@Microsoft.KeyVault(SecretUri=...)``) resolved by the platform via the
Function's managed identity. They are NEVER logged, echoed in a response, or
written to a fixture. ``__repr__`` is redacted.
"""

from __future__ import annotations

import logging
import os
import random
import threading
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger("enrichment.dvsa")

# Microsoft Entra token authority (tenant-scoped v2.0 client-credentials).
_TOKEN_AUTHORITY = "https://login.microsoftonline.com"

# Per-request timeout (seconds). DVSA is a public-cloud API; bound the wait.
_DEFAULT_TIMEOUT_S = 20.0

# Refresh the cached token this many seconds BEFORE expiry so an in-flight call
# never races the boundary (matches the TS REFRESH_BUFFER_MS = 60_000).
_EXPIRY_SKEW_S = 60.0

# Fallback TTL if the token response omits expires_in (TS uses 3599).
_FALLBACK_TTL_S = 3599.0

# Retry policy (matches the TS MAX_RETRIES / BASE_BACKOFF_MS).
_MAX_RETRIES = 4
_BASE_BACKOFF_S = 1.0

# DVSA upstream error codes that are safe to retry (from dvladvsa errors.ts).
_RETRY_SAFE_CODES = {"MOTH-FB-02", "MOTH-RL-02", "MOTH-UN-01"}


class DvsaError(RuntimeError):
    """Non-recoverable DVSA failure (after the 401 retry / retry budget)."""


class DvsaAuthError(DvsaError):
    """The Entra token endpoint rejected our credentials, or DVSA returned 401
    twice (token + one forced refresh)."""


class DvsaNotFoundError(DvsaError):
    """DVSA has no record for the registration (404 / not-found error code)."""


def normalize_registration(reg: str) -> str:
    """Strip whitespace and upper-case — matches ``normalizeRegistration``."""
    return "".join(reg.split()).upper().strip()


@dataclass
class _CachedToken:
    access_token: str
    expires_at_monotonic: float

    def is_valid(self) -> bool:
        return time.monotonic() < self.expires_at_monotonic


@dataclass
class DvsaConfig:
    """Resolved from app settings. The three secrets map to Key Vault refs."""

    tenant_id: str
    client_id: str
    client_secret: str = field(repr=False)
    scope: str = field(default="https://tapi.dvsa.gov.uk/.default")
    api_base: str = field(default="https://history.mot.api.gov.uk")
    api_key: str = field(default="", repr=False)

    @classmethod
    def from_env(cls) -> "DvsaConfig":
        tenant_id = os.environ.get("DVSA_TENANT_ID", "").strip()
        client_id = os.environ.get("DVSA_CLIENT_ID", "").strip()
        client_secret = os.environ.get("DVSA_CLIENT_SECRET", "")
        api_key = os.environ.get("DVSA_API_KEY", "")
        scope = os.environ.get("DVSA_SCOPE", "").strip() or "https://tapi.dvsa.gov.uk/.default"
        api_base = (os.environ.get("DVSA_API_BASE", "").strip() or "https://history.mot.api.gov.uk").rstrip("/")

        missing = [
            name
            for name, val in (
                ("DVSA_TENANT_ID", tenant_id),
                ("DVSA_CLIENT_ID", client_id),
                ("DVSA_CLIENT_SECRET", client_secret),
                ("DVSA_API_KEY", api_key),
            )
            if not val
        ]
        if missing:
            # Signal the gap by name only — never the (empty/non-empty) values.
            raise DvsaError(
                "DVSA credentials are not configured (missing Key Vault refs / "
                f"app settings: {', '.join(missing)})"
            )
        return cls(
            tenant_id=tenant_id,
            client_id=client_id,
            client_secret=client_secret,
            scope=scope,
            api_base=api_base,
            api_key=api_key,
        )

    @property
    def token_url(self) -> str:
        return f"{_TOKEN_AUTHORITY}/{self.tenant_id}/oauth2/v2.0/token"

    def __repr__(self) -> str:  # pragma: no cover - trivial redaction
        return (
            f"DvsaConfig(tenant_id={self.tenant_id!r}, client_id=<redacted>, "
            f"client_secret=<redacted>, scope={self.scope!r}, "
            f"api_base={self.api_base!r}, api_key=<redacted>)"
        )


class DvsaClient:
    """Entra client-credentials token + DVSA MOT History GET seam.

    Lazy and mockable: nothing happens at construction. The HTTP transport is
    created on first use and can be injected for tests. The access token is
    cached in-process and refreshed at most once on a 401.
    """

    def __init__(
        self,
        config: DvsaConfig | None = None,
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
    def config(self) -> DvsaConfig:
        if self._config is None:
            self._config = DvsaConfig.from_env()
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

    # -- token lifecycle ---------------------------------------------------

    def _fetch_token(self) -> _CachedToken:
        cfg = self.config
        data = {
            "grant_type": "client_credentials",
            "client_id": cfg.client_id,
            "client_secret": cfg.client_secret,
            "scope": cfg.scope,
        }
        resp = self.http.post(
            cfg.token_url,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if resp.status_code == 401:
            raise DvsaAuthError("Entra rejected DVSA client credentials (401)")
        if resp.status_code >= 400:
            # Never echo resp.text — it can reflect the request.
            raise DvsaError(f"DVSA token endpoint returned HTTP {resp.status_code}")

        payload = resp.json()
        token = payload.get("access_token")
        if not token:
            raise DvsaError("DVSA token response did not include an access_token")
        ttl = float(payload.get("expires_in") or _FALLBACK_TTL_S)
        deadline = time.monotonic() + max(0.0, ttl - _EXPIRY_SKEW_S)
        logger.info("dvsa token acquired (ttl=%ss)", int(ttl))  # no token value
        return _CachedToken(access_token=token, expires_at_monotonic=deadline)

    def get_token(self, *, force_refresh: bool = False) -> str:
        with self._lock:
            if force_refresh or self._token is None or not self._token.is_valid():
                self._token = self._fetch_token()
            return self._token.access_token

    # -- vehicle lookup ----------------------------------------------------

    def get_vehicle_by_registration(self, registration: str) -> dict[str, Any]:
        """GET the DVSA MOT history record for a VRM.

        Mirrors ``getVehicleByRegistration`` → ``requestWithRetry``: one 401
        refresh-and-retry, then bounded exponential backoff with jitter on
        retry-safe upstream error codes.
        """
        reg = normalize_registration(registration)
        path = f"/v1/trade/vehicles/registration/{_url_path_segment(reg)}"
        return self._get_with_retry(path)

    def _get_with_retry(self, path: str, *, attempt: int = 0, refreshed: bool = False) -> dict[str, Any]:
        cfg = self.config
        url = f"{cfg.api_base}{path}"
        headers = {
            "Authorization": f"Bearer {self.get_token(force_refresh=refreshed)}",
            "X-API-Key": cfg.api_key,
            "Accept": "application/json",
        }
        resp = self.http.get(url, headers=headers)

        # 401: refresh the token exactly once, then retry.
        if resp.status_code == 401 and not refreshed:
            with self._lock:
                self._token = None  # drop the stale token
            return self._get_with_retry(path, attempt=attempt, refreshed=True)
        if resp.status_code == 401:
            raise DvsaAuthError("DVSA returned 401 after one token refresh")

        if resp.status_code == 404:
            raise DvsaNotFoundError("DVSA has no record for this registration")

        if resp.status_code >= 400:
            code = self._error_code(resp)
            if code in _RETRY_SAFE_CODES and attempt < _MAX_RETRIES:
                self._backoff(attempt)
                return self._get_with_retry(path, attempt=attempt + 1, refreshed=refreshed)
            # Never include the body verbatim.
            raise DvsaError(f"DVSA returned HTTP {resp.status_code} ({code or 'no code'})")

        return resp.json()

    @staticmethod
    def _error_code(resp: httpx.Response) -> str | None:
        try:
            body = resp.json()
        except (ValueError, httpx.DecodingError):
            return None
        if isinstance(body, dict):
            code = body.get("errorCode")
            return code if isinstance(code, str) else None
        return None

    @staticmethod
    def _backoff(attempt: int) -> None:
        base = _BASE_BACKOFF_S * (2 ** attempt)
        jitter = base * 0.25 * (random.random() * 2 - 1)
        time.sleep(max(0.0, base + jitter))


def _url_path_segment(value: str) -> str:
    """Percent-encode a single path segment (matches encodeURIComponent)."""
    from urllib.parse import quote

    return quote(value, safe="")

"""OAuth token exchange + MCP tool-call seam for the ``ce-mcp-gateway``.

[BUILD] — authored offline, exercised only by mocked pytest. No live gateway,
no Azure/tenant contact. The real token endpoint and MCP backend are reached
ONLY at runtime inside the deployed Function.

Secret handling
---------------
``client_id`` / ``client_secret`` are read from environment variables which, in
the deployed Function, are **Azure Key Vault references**
(``@Microsoft.KeyVault(SecretUri=...)``) resolved by the platform at startup.
They are NEVER logged, never echoed in a response, and never written to a
fixture. ``__repr__`` is deliberately redacted so an accidental ``log.info(client)``
cannot leak the secret.

This module is intentionally dependency-light and lazy: the HTTP client and the
token are created on first use so unit tests can construct a client without any
network or environment, then monkeypatch / respx the transport.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger("enrichment.gateway")

# Default per-tool-call timeout (seconds). The gateway proxies to Cloud Run,
# which itself calls DVSA, so allow a generous-but-bounded window.
_DEFAULT_TIMEOUT_S = 20.0

# Refresh the cached token this many seconds BEFORE its real expiry, so an
# in-flight call never races the boundary. Gateway access tokens are ~3600s.
_EXPIRY_SKEW_S = 60.0

# Fallback TTL if the token response omits ``expires_in``.
_FALLBACK_TTL_S = 3600.0


class GatewayError(RuntimeError):
    """Raised for non-recoverable gateway failures (after a 401 retry)."""


class GatewayAuthError(GatewayError):
    """Raised specifically when the gateway rejects our credentials (401)."""


@dataclass
class _CachedToken:
    access_token: str
    # Monotonic-clock deadline after which the token is considered stale.
    expires_at_monotonic: float

    def is_valid(self) -> bool:
        return time.monotonic() < self.expires_at_monotonic


@dataclass
class GatewayConfig:
    """Resolved from app settings. The two secrets map to Key Vault references."""

    base_url: str
    client_id: str
    client_secret: str = field(repr=False)  # never appears in repr/logs
    scope: str | None = None
    connector: str = "dvsa-mot"

    @classmethod
    def from_env(cls) -> "GatewayConfig":
        base = os.environ.get("ENRICHMENT_API_BASE", "").rstrip("/")
        if not base:
            raise GatewayError("ENRICHMENT_API_BASE is not configured")
        client_id = os.environ.get("GATEWAY_CLIENT_ID", "")
        client_secret = os.environ.get("GATEWAY_CLIENT_SECRET", "")
        if not client_id or not client_secret:
            # Do not include the (empty/non-empty) values — just signal the gap.
            raise GatewayError(
                "Gateway client credentials are not configured "
                "(GATEWAY_CLIENT_ID / GATEWAY_CLIENT_SECRET Key Vault refs)"
            )
        return cls(
            base_url=base,
            client_id=client_id,
            client_secret=client_secret,
            scope=os.environ.get("GATEWAY_SCOPE") or None,
            connector=os.environ.get("ENRICHMENT_CONNECTOR", "dvsa-mot"),
        )

    def __repr__(self) -> str:  # pragma: no cover - trivial redaction
        return (
            f"GatewayConfig(base_url={self.base_url!r}, "
            f"client_id=<redacted>, client_secret=<redacted>, "
            f"scope={self.scope!r}, connector={self.connector!r})"
        )


class GatewayClient:
    """OAuth2 client-credentials token + JSON-RPC MCP ``tools/call`` seam.

    Lazy and mockable: nothing happens at construction. The HTTP transport is
    created on first use and can be injected for tests. The access token is
    cached in-process with a TTL and refreshed at most once on a 401.
    """

    def __init__(
        self,
        config: GatewayConfig | None = None,
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
    def config(self) -> GatewayConfig:
        if self._config is None:
            self._config = GatewayConfig.from_env()
        return self._config

    @property
    def http(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(
                timeout=self._timeout_s,
                transport=self._transport,
            )
        return self._client

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None

    # -- token lifecycle ---------------------------------------------------

    def _fetch_token(self) -> _CachedToken:
        """Client-credentials grant against the gateway ``/token`` endpoint.

        Shape targeted (RFC 6749 §4.4, form-encoded — the gateway README warns
        the base64 secret can contain ``+`` which a raw body would corrupt, so
        we always send ``application/x-www-form-urlencoded``):

            POST {base}/token
            grant_type=client_credentials
            client_id=...&client_secret=...[&scope=...]

        -> { "access_token": "...", "token_type": "Bearer", "expires_in": 3600 }
        """
        cfg = self.config
        data = {
            "grant_type": "client_credentials",
            "client_id": cfg.client_id,
            "client_secret": cfg.client_secret,
        }
        if cfg.scope:
            data["scope"] = cfg.scope

        resp = self.http.post(f"{cfg.base_url}/token", data=data)
        if resp.status_code == 401:
            raise GatewayAuthError("Gateway rejected client credentials (401)")
        if resp.status_code >= 400:
            # Never include resp.text verbatim in case it echoes the request.
            raise GatewayError(f"Token endpoint returned HTTP {resp.status_code}")

        payload = resp.json()
        token = payload.get("access_token")
        if not token:
            raise GatewayError("Token response did not include an access_token")
        ttl = float(payload.get("expires_in") or _FALLBACK_TTL_S)
        deadline = time.monotonic() + max(0.0, ttl - _EXPIRY_SKEW_S)
        logger.info("gateway token acquired (ttl=%ss)", int(ttl))  # no token value
        return _CachedToken(access_token=token, expires_at_monotonic=deadline)

    def get_token(self, *, force_refresh: bool = False) -> str:
        with self._lock:
            if force_refresh or self._token is None or not self._token.is_valid():
                self._token = self._fetch_token()
            return self._token.access_token

    # -- MCP tool calls ----------------------------------------------------

    def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Invoke an MCP tool on ``{base}/{connector}/mcp`` via JSON-RPC 2.0.

        Handles a single 401 refresh-and-retry (token may have expired mid-use;
        the gateway TTL is ~1h but the wrapper must self-heal). Returns the
        tool's ``structuredContent`` object. Raises GatewayError on a tool error
        or a second auth failure — the caller decides whether that is fatal
        (it is not: enrichment is advisory).
        """
        cfg = self.config
        url = f"{cfg.base_url}/{cfg.connector}/mcp"
        body = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments},
        }

        result = self._post_mcp(url, body, token=self.get_token())
        if result is _AUTH_RETRY:
            # Refresh exactly once, then retry. A second 401 is terminal.
            result = self._post_mcp(url, body, token=self.get_token(force_refresh=True))
            if result is _AUTH_RETRY:
                raise GatewayAuthError(
                    f"Gateway returned 401 for {tool_name} after one refresh"
                )
        return result  # type: ignore[return-value]

    def _post_mcp(
        self, url: str, body: dict[str, Any], *, token: str
    ) -> dict[str, Any] | object:
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        resp = self.http.post(url, json=body, headers=headers)
        if resp.status_code == 401:
            return _AUTH_RETRY
        if resp.status_code >= 400:
            raise GatewayError(f"MCP endpoint returned HTTP {resp.status_code}")

        envelope = resp.json()
        if "error" in envelope and envelope["error"]:
            err = envelope["error"]
            raise GatewayError(f"MCP error: {err.get('message', 'unknown')}")
        rpc_result = envelope.get("result") or {}
        if rpc_result.get("isError"):
            raise GatewayError(f"Tool '{body['params']['name']}' reported an error")
        # Prefer structuredContent; fall back to the text content block.
        structured = rpc_result.get("structuredContent")
        if isinstance(structured, dict):
            return structured
        return {}


# Sentinel returned by ``_post_mcp`` to signal "got a 401, caller should refresh".
_AUTH_RETRY: object = object()

"""EVA "Sentry" REST v1.2 client — token lifecycle lives HERE, server-side.

[BUILD] — authored offline, exercised only by mocked pytest (respx). No live
EVA, no Azure/tenant contact. The real ``/Connect/token`` + ``/Instruction/Inspection``
endpoints are reached ONLY at runtime inside the deployed Function.

Why this is a Function and not the connector's OAuth security (decisive)
-----------------------------------------------------------------------
Microsoft Learn (verified 2026-06-18) states:

* connection-parameters — *"Currently, client credentials grant type is not
  supported by custom connectors."*
* verify-oauth-configuration — *"Custom connectors use the authorization code
  flow. The implicit and client credentials flows don't issue refresh tokens…"*

EVA's ``POST /Connect/token`` is a ``Client_Id``/``Client_Secret`` body exchange
returning a **5-minute** JWT (a client-credentials-style flow with no
authorization-code / refresh-token story). A Power Platform custom connector
therefore **cannot** perform EVA auth at the connector layer. The token MUST be
minted, cached (with a ~30s refresh buffer), and attached as
``Authorization: Bearer`` **inside this Azure Function**; the ``cr1bd_evasentry``
connector that fronts it is **function-key only** (no OAuth security definition).

    POST {EVA_BASE_URL}Connect/token
        Content-Type: application/x-www-form-urlencoded
        Client_Id=..&Client_Secret=..
      -> { "access_token": "<JWT>", "expires_in": 5 }   # expires_in is MINUTES

    POST {EVA_BASE_URL}Instruction/Inspection      # request 1: claim + 2 previews
        Authorization: Bearer {access_token}
      -> { "Id": "...", ... }   the EVA instruction acknowledgement

    POST {EVA_BASE_URL}Note/SubmitNote             # request 2: ALL photos in seq
        Authorization: Bearer {access_token}       # (same cached token)
      -> { "StatusCode": 200, "Message": "...", "Id": null }

Two-request photo submission (PDF v1.2 pp.13,21-23): EVA wants the 2 preview
photos first (overview w/ full registration + damage closeup) then ALL photos in
sequence incl. those two again. Photos ride as a ``Files`` array
(``{Name,Extension,Data(base64)}``) on BOTH calls; the second call targets the
claim created by the first (ClmNo/EvaRef + VehReg). One token mint covers both.

Secret handling
---------------
``EVA_CLIENT_ID`` / ``EVA_CLIENT_SECRET`` come from environment variables which,
in the deployed Function, are **Azure Key Vault references**
(``@Microsoft.KeyVault(SecretUri=...)``) resolved by the platform via the
Function's managed identity. They are NEVER logged, echoed in a response, or
written to a fixture. ``__repr__`` is redacted, and the bearer token is never
logged.

Patterned on ``functions/enrichment/dvsa_client.py`` (same token-cache + 401
refresh-once-then-retry shape) so the two wrappers read alike.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger("evasentry.client")

# Per-request timeout (seconds). EVA is a public-cloud API; bound the wait.
_DEFAULT_TIMEOUT_S = 30.0

# EVA tokens are SHORT-LIVED: expires_in is in MINUTES (typically 5). Refresh
# this many SECONDS before expiry so an in-flight call never races the boundary
# (skill: "refresh proactively with a ~30s buffer").
_EXPIRY_SKEW_S = 30.0

# Fallback TTL (seconds) if the token response omits expires_in. EVA documents 5
# minutes; assume that minus the skew if the field is missing.
_FALLBACK_TTL_MINUTES = 5.0


class EvaError(RuntimeError):
    """Non-recoverable EVA failure (after the 401 retry)."""


class EvaAuthError(EvaError):
    """The ``/Connect/token`` endpoint rejected our credentials, or EVA returned
    401 twice (token + one forced refresh)."""


class EvaConfigError(EvaError):
    """EVA credentials / base URL are not configured (missing app settings /
    Key Vault refs). Signalled by name only — never the values."""


@dataclass
class _CachedToken:
    access_token: str
    expires_at_monotonic: float

    def is_valid(self) -> bool:
        return time.monotonic() < self.expires_at_monotonic


@dataclass
class EvaConfig:
    """Resolved from app settings. The two secrets map to Key Vault refs.

    ``base_url`` is a NON-secret app setting (``EVA_BASE_URL``); it is the SAME
    for test and production — the **credentials** route the environment
    (ADR-0005). It is normalised to end with a single trailing slash so the
    endpoint paths below concatenate cleanly.
    """

    client_id: str = field(repr=False)
    client_secret: str = field(repr=False)
    base_url: str = field(default="https://sentry.evasoftware.co.uk/api/")

    @classmethod
    def from_env(cls) -> "EvaConfig":
        client_id = os.environ.get("EVA_CLIENT_ID", "")
        client_secret = os.environ.get("EVA_CLIENT_SECRET", "")
        base_url = (
            os.environ.get("EVA_BASE_URL", "").strip()
            or "https://sentry.evasoftware.co.uk/api/"
        )
        if not base_url.endswith("/"):
            base_url += "/"

        missing = [
            name
            for name, val in (
                ("EVA_CLIENT_ID", client_id),
                ("EVA_CLIENT_SECRET", client_secret),
            )
            if not val
        ]
        if missing:
            raise EvaConfigError(
                "EVA credentials are not configured (missing Key Vault refs / "
                f"app settings: {', '.join(missing)})"
            )
        return cls(client_id=client_id, client_secret=client_secret, base_url=base_url)

    @property
    def token_url(self) -> str:
        return f"{self.base_url}Connect/token"

    @property
    def instruction_inspection_url(self) -> str:
        return f"{self.base_url}Instruction/Inspection"

    @property
    def note_submitnote_url(self) -> str:
        # Second photo request: the remaining photos ride on /Note/SubmitNote,
        # matched to the just-created claim by ClmNo/EvaRef + VehReg (PDF pp.21-23).
        return f"{self.base_url}Note/SubmitNote"

    def __repr__(self) -> str:  # pragma: no cover - trivial redaction
        return (
            f"EvaConfig(client_id=<redacted>, client_secret=<redacted>, "
            f"base_url={self.base_url!r})"
        )


class EvaClient:
    """EVA ``/Connect/token`` mint + cache and the ``Instruction/Inspection`` POST.

    Lazy and mockable: nothing happens at construction. The HTTP transport is
    created on first use and can be injected for tests. The access token is
    cached in-process (TTL = ``expires_in`` minutes − 30s) and refreshed at most
    once on a 401.
    """

    def __init__(
        self,
        config: EvaConfig | None = None,
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
    def config(self) -> EvaConfig:
        if self._config is None:
            self._config = EvaConfig.from_env()
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
        # EVA expects Client_Id / Client_Secret (note the casing) in a
        # form-urlencoded body — NOT the standard grant_type=client_credentials
        # parameter names. (Sentry API v1.2.)
        data = {"Client_Id": cfg.client_id, "Client_Secret": cfg.client_secret}
        resp = self.http.post(
            cfg.token_url,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if resp.status_code == 401:
            raise EvaAuthError("EVA rejected the Client_Id/Client_Secret (401)")
        if resp.status_code >= 400:
            # Never echo resp.text — it can reflect the request.
            raise EvaError(f"EVA token endpoint returned HTTP {resp.status_code}")

        payload = resp.json()
        token = payload.get("access_token")
        if not token:
            raise EvaError("EVA token response did not include an access_token")
        # expires_in is in MINUTES (EVA quirk). Convert to seconds.
        ttl_minutes = float(payload.get("expires_in") or _FALLBACK_TTL_MINUTES)
        ttl_seconds = ttl_minutes * 60.0
        deadline = time.monotonic() + max(0.0, ttl_seconds - _EXPIRY_SKEW_S)
        logger.info("eva token acquired (ttl=%smin)", ttl_minutes)  # no token value
        return _CachedToken(access_token=token, expires_at_monotonic=deadline)

    def get_token(self, *, force_refresh: bool = False) -> str:
        with self._lock:
            if force_refresh or self._token is None or not self._token.is_valid():
                self._token = self._fetch_token()
            return self._token.access_token

    # -- instruction/inspection -------------------------------------------

    def post_instruction_inspection(self, body: dict[str, Any]) -> dict[str, Any]:
        """POST ``/Instruction/Inspection`` with one 401 refresh-and-retry.

        This is the FIRST photo request: it creates the claim and carries the 2
        preview Files. Returns the parsed JSON response (EVA's instruction
        acknowledgement, including ``Id``). Raises ``EvaError`` on a non-2xx that
        is not a recoverable 401.
        """
        return self._post_with_retry(self.config.instruction_inspection_url, body)

    def post_note_submitnote(self, body: dict[str, Any]) -> dict[str, Any]:
        """POST ``/Note/SubmitNote`` with one 401 refresh-and-retry — the SECOND
        photo request, carrying the full ordered photo set against the just-created
        claim (matched by ClmNo/EvaRef + VehReg). Reuses the SAME cached bearer
        token as the instruction call (one mint covers both within the 5-min TTL).

        A 404 (claim not found) or 409 (conflict) is surfaced as ``EvaError`` so
        the handler can warn and leave the case for manual completion without
        losing the already-submitted instruction.
        """
        return self._post_with_retry(self.config.note_submitnote_url, body)

    def _post_with_retry(
        self, url: str, body: dict[str, Any], *, refreshed: bool = False
    ) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {self.get_token(force_refresh=refreshed)}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        resp = self.http.post(url, json=body, headers=headers)

        # 401: refresh the token exactly once, then retry.
        if resp.status_code == 401 and not refreshed:
            with self._lock:
                self._token = None  # drop the stale token
            return self._post_with_retry(url, body, refreshed=True)
        if resp.status_code == 401:
            raise EvaAuthError("EVA returned 401 after one token refresh")

        if resp.status_code >= 400:
            # Never include the body verbatim — it may reflect submitted data.
            raise EvaError(f"EVA returned HTTP {resp.status_code} for Instruction/Inspection")

        try:
            return resp.json()
        except ValueError:
            # EVA accepted but returned a non-JSON / empty body — treat as success.
            return {}

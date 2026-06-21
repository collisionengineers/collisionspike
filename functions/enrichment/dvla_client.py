"""DVLA Vehicle Enquiry Service client — direct, API-key REST.

[BUILD] — authored offline, mocked-pytest only. No live DVLA, no Azure.

Ported from ``collisionplugin/connectors/dvladvsa/server/src/dvla-client.ts``:

    POST {dvla_api_base}/v1/vehicles
        x-api-key: {api_key}
        Content-Type: application/json
        { "registrationNumber": "<reg>" }
      -> DVLA vehicle JSON (make, colour, yearOfManufacture, fuelType,
         taxStatus, motStatus, …)

M1 role
-------
DVSA MOT History is the primary source for ``get_vehicle_summary``. DVLA is an
optional fallback used only to fill make/colour/year when a vehicle is too new
to have any MOT record (DVSA returns 404 / no motTests). It is gated by whether
the DVLA credentials are present; when absent, the wrapper simply skips it.

Secret handling identical to the DVSA client: ``api_key`` is a Key Vault
reference resolved by the Function's managed identity, never logged or echoed.
"""

from __future__ import annotations

import logging
import os
import random
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

from dvsa_client import normalize_registration

logger = logging.getLogger("enrichment.dvla")

_DEFAULT_TIMEOUT_S = 20.0
_MAX_RETRIES = 4
_BASE_BACKOFF_S = 1.0

# DVLA VES rate-limit / transient codes worth retrying (subset of dvla-errors).
_RETRY_SAFE_STATUS = {429, 500, 502, 503, 504}

# Non-secret default (also the dataclass field default below). Exposed so the
# no-secrets self-check can report the resolved base without re-deriving it.
DEFAULT_DVLA_API_BASE = "https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry"


class DvlaError(RuntimeError):
    """Non-recoverable DVLA failure (after the retry budget)."""


class DvlaNotConfigured(DvlaError):
    """DVLA credentials are absent — the fallback is simply skipped."""


@dataclass
class DvlaConfig:
    api_key: str = field(repr=False)
    api_base: str = field(default=DEFAULT_DVLA_API_BASE)

    @classmethod
    def from_env(cls) -> "DvlaConfig":
        api_key = os.environ.get("DVLA_API_KEY", "")
        api_base = (
            os.environ.get("DVLA_API_BASE", "").strip()
            or DEFAULT_DVLA_API_BASE
        ).rstrip("/")
        if not api_key:
            raise DvlaNotConfigured("DVLA_API_KEY is not configured")
        return cls(api_key=api_key, api_base=api_base)

    def __repr__(self) -> str:  # pragma: no cover - trivial redaction
        return f"DvlaConfig(api_base={self.api_base!r}, api_key=<redacted>)"


class DvlaClient:
    """POST /v1/vehicles seam. Lazy and mockable, like the DVSA client."""

    def __init__(
        self,
        config: DvlaConfig | None = None,
        *,
        transport: httpx.BaseTransport | None = None,
        timeout_s: float = _DEFAULT_TIMEOUT_S,
    ) -> None:
        self._config = config
        self._transport = transport
        self._timeout_s = timeout_s
        self._client: httpx.Client | None = None

    @property
    def config(self) -> DvlaConfig:
        if self._config is None:
            self._config = DvlaConfig.from_env()
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

    def get_vehicle(self, registration: str) -> dict[str, Any]:
        reg = normalize_registration(registration)
        return self._post("/v1/vehicles", {"registrationNumber": reg})

    def _post(self, path: str, body: dict, *, attempt: int = 0) -> dict[str, Any]:
        cfg = self.config
        url = f"{cfg.api_base}{path}"
        resp = self.http.post(
            url,
            json=body,
            headers={
                "x-api-key": cfg.api_key,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        if resp.status_code < 400:
            return resp.json()

        if resp.status_code in _RETRY_SAFE_STATUS and attempt < _MAX_RETRIES:
            self._backoff(attempt)
            return self._post(path, body, attempt=attempt + 1)
        # Never include the body verbatim.
        raise DvlaError(f"DVLA returned HTTP {resp.status_code}")

    @staticmethod
    def _backoff(attempt: int) -> None:
        base = _BASE_BACKOFF_S * (2 ** attempt)
        jitter = base * 0.25 * (random.random() * 2 - 1)
        time.sleep(max(0.0, base + jitter))

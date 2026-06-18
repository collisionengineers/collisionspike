"""postcode.io client — UK postcode validation / normalisation (no key, free).

[BUILD] — authored offline, mocked-pytest only. No live postcode.io in tests
(respx mocks the transport); no Azure; NO secrets (postcode.io needs no key).

Why this exists (integrations.md "Address normalisation")
---------------------------------------------------------
M1 normalises UK postcodes with **postcode.io** (free, UK-only). Azure Maps is a
LATER option gated by ``AZURE_MAPS_ENABLED``; while that flag is ``false`` (the
M1 default) the matcher routes here. This client is the single seam for that
upstream so the gate can flip without touching the matcher.

Endpoints used (api.postcodes.io, validated against the live contract):

* ``GET /postcodes/{postcode}``         -> ``{status, result:{postcode, outcode,
                                            admin_district, region, country, …}}``
                                          ; 404 ``{status:404, error}`` if invalid.
* ``GET /outcodes/{outcode}``           -> ``{status, result:{outcode,
                                            admin_district:[…], country:[…], …}}``
                                          ; 404 if the outcode is unknown.

Fail-soft: postcode.io being down, slow, or returning 404 must NEVER block the
address decision. Every failure is swallowed into ``None`` and the matcher
proceeds (and records a warning). There are no credentials to leak.
"""

from __future__ import annotations

import logging
import os
import random
import time
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger("addressmatch.postcodeio")

_DEFAULT_TIMEOUT_S = 15.0
_MAX_RETRIES = 3
_BASE_BACKOFF_S = 0.5

# Transient HTTP codes worth one or two retries (postcode.io is fronted by a CDN).
_RETRY_SAFE_STATUS = {429, 500, 502, 503, 504}

_DEFAULT_BASE = "https://api.postcodes.io"


class PostcodeIoError(RuntimeError):
    """Non-recoverable postcode.io failure (after the retry budget)."""


@dataclass
class PostcodeIoConfig:
    """postcode.io connection config. No secret — the API is open/unauthenticated."""

    api_base: str = _DEFAULT_BASE

    @classmethod
    def from_env(cls) -> "PostcodeIoConfig":
        api_base = (os.environ.get("POSTCODE_IO_BASE", "").strip() or _DEFAULT_BASE).rstrip("/")
        return cls(api_base=api_base)


class PostcodeIoClient:
    """Thin GET seam over postcode.io. Lazy + mockable, like the DVLA client."""

    def __init__(
        self,
        config: PostcodeIoConfig | None = None,
        *,
        transport: httpx.BaseTransport | None = None,
        timeout_s: float = _DEFAULT_TIMEOUT_S,
    ) -> None:
        self._config = config
        self._transport = transport
        self._timeout_s = timeout_s
        self._client: httpx.Client | None = None

    @property
    def config(self) -> PostcodeIoConfig:
        if self._config is None:
            self._config = PostcodeIoConfig.from_env()
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

    # -- Public lookups (fail-soft: return None on any non-200 / error) -------

    def lookup_postcode(self, postcode: str) -> dict[str, Any] | None:
        """``GET /postcodes/{postcode}`` -> the ``result`` object, or ``None``.

        ``None`` means "postcode.io could not confirm this postcode" (invalid,
        404, or upstream failure) — the caller treats the postcode as
        unvalidated rather than failing the request.
        """
        pc = (postcode or "").strip()
        if not pc:
            return None
        return self._get_result(f"/postcodes/{httpx.URL(pc)}")

    def lookup_outcode(self, outcode: str) -> dict[str, Any] | None:
        """``GET /outcodes/{outcode}`` -> the ``result`` object, or ``None``.

        Used to resolve a part-postcode district to its admin area for the
        audit trail / human display; never required for the corpus match.
        """
        oc = (outcode or "").strip()
        if not oc:
            return None
        return self._get_result(f"/outcodes/{httpx.URL(oc)}")

    # -- Internals -----------------------------------------------------------

    def _get_result(self, path: str, *, attempt: int = 0) -> dict[str, Any] | None:
        cfg = self.config
        url = f"{cfg.api_base}{path}"
        try:
            resp = self.http.get(url, headers={"Accept": "application/json"})
        except httpx.HTTPError as exc:
            logger.warning("postcode.io request error: %s", type(exc).__name__)
            return None

        if resp.status_code == 200:
            try:
                body = resp.json()
            except ValueError:
                return None
            result = body.get("result") if isinstance(body, dict) else None
            return result if isinstance(result, dict) else None

        if resp.status_code == 404:
            # Genuinely not found — a valid, expected answer ("unknown postcode").
            return None

        if resp.status_code in _RETRY_SAFE_STATUS and attempt < _MAX_RETRIES:
            self._backoff(attempt)
            return self._get_result(path, attempt=attempt + 1)

        logger.warning("postcode.io returned HTTP %s", resp.status_code)
        return None

    @staticmethod
    def _backoff(attempt: int) -> None:
        base = _BASE_BACKOFF_S * (2**attempt)
        jitter = base * 0.25 * (random.random() * 2 - 1)
        time.sleep(max(0.0, base + jitter))

"""Bounded Azure Maps geocoding client for location assistance.

Free-text signage, place, postcode, and claimant-address clues are geocoded with
a UK bias. Credentials come from runtime configuration and are never logged or
returned. Tests replace the HTTP transport and perform no network calls.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger("locationsuggest.maps")

# Non-secret defaults. Search Address (Geocoding) v1.0; UK-biased.
DEFAULT_MAPS_ENDPOINT = "https://atlas.microsoft.com"
DEFAULT_MAPS_API_VERSION = "1.0"
DEFAULT_COUNTRY_SET = "GB"

# Per-request timeout (seconds).
_DEFAULT_TIMEOUT_S = 20.0


class MapsError(RuntimeError):
    """Maps dependency failed. Carries the failure CLASS / status only — never the
    response body verbatim, never the key."""

    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class MapsNotConfigured(MapsError):
    """Required Maps app settings / Key Vault refs are absent."""


@dataclass
class MapsConfig:
    """Resolved from app settings. ``key`` maps to a Key Vault reference."""

    key: str = field(repr=False)
    endpoint: str = field(default=DEFAULT_MAPS_ENDPOINT)
    api_version: str = field(default=DEFAULT_MAPS_API_VERSION)
    country_set: str = field(default=DEFAULT_COUNTRY_SET)

    @classmethod
    def from_env(cls) -> "MapsConfig":
        key = os.environ.get("AZURE_MAPS_KEY", "")
        endpoint = (os.environ.get("AZURE_MAPS_ENDPOINT", "").strip() or DEFAULT_MAPS_ENDPOINT).rstrip("/")
        api_version = os.environ.get("AZURE_MAPS_API_VERSION", "").strip() or DEFAULT_MAPS_API_VERSION
        country_set = os.environ.get("AZURE_MAPS_COUNTRY_SET", "").strip() or DEFAULT_COUNTRY_SET
        if not key:
            raise MapsNotConfigured(
                "Azure Maps is not configured (missing Key Vault ref / app "
                "setting: AZURE_MAPS_KEY)"
            )
        return cls(key=key, endpoint=endpoint, api_version=api_version, country_set=country_set)

    @property
    def search_url(self) -> str:
        return f"{self.endpoint}/search/address/json"

    @property
    def poi_url(self) -> str:
        # Fuzzy Search resolves POIs/business names (read off a photo sign) AND addresses,
        # ranked by relevance — better than Search-Address for signage (TKT-077).
        return f"{self.endpoint}/search/fuzzy/json"

    def __repr__(self) -> str:  # pragma: no cover - trivial redaction
        return (
            f"MapsConfig(endpoint={self.endpoint!r}, key=<redacted>, "
            f"api_version={self.api_version!r}, country_set={self.country_set!r})"
        )


@dataclass
class GeocodeResult:
    """One geocoded candidate address."""

    freeform_address: str
    address_lines: list[str] = field(default_factory=list)
    postcode: str | None = None
    lat: float | None = None
    lon: float | None = None
    score: float | None = None


class MapsClient:
    """Azure Maps Search Address (Geocoding) seam.

    Lazy and mockable: nothing happens at construction. The HTTP transport is
    created on first use and can be injected for tests.
    """

    def __init__(
        self,
        config: MapsConfig | None = None,
        *,
        transport: httpx.BaseTransport | None = None,
        timeout_s: float = _DEFAULT_TIMEOUT_S,
    ) -> None:
        self._config = config
        self._transport = transport
        self._timeout_s = timeout_s
        self._client: httpx.Client | None = None

    @property
    def config(self) -> MapsConfig:
        if self._config is None:
            self._config = MapsConfig.from_env()
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

    def geocode(self, query: str, *, limit: int = 3) -> list[GeocodeResult]:
        """Geocode ``query`` to up to ``limit`` candidate addresses (UK-biased).

        Raises ``MapsError`` on any auth / transport / non-2xx failure. An empty
        result list is a normal outcome (no geocode hit), not an error.
        """
        return self._search(self.config.search_url, query, limit)

    def search_poi(self, query: str, *, limit: int = 3) -> list[GeocodeResult]:
        """Fuzzy-search ``query`` (a business name off a photo sign, or an address) to up to
        ``limit`` candidates (UK-biased). Better than ``geocode`` for signage business names;
        same result shape + same error semantics (TKT-077)."""
        return self._search(self.config.poi_url, query, limit)

    def _search(self, url: str, query: str, limit: int) -> list[GeocodeResult]:
        q = (query or "").strip()
        if not q:
            return []
        cfg = self.config
        params = {
            "api-version": cfg.api_version,
            "query": q,
            "countrySet": cfg.country_set,
            "limit": str(max(1, min(limit, 10))),
            "subscription-key": cfg.key,
        }
        try:
            resp = self.http.get(url, params=params)
        except httpx.HTTPError as exc:
            raise MapsError(f"Maps transport error: {type(exc).__name__}") from exc

        if resp.status_code in (401, 403):
            raise MapsError("Maps rejected the subscription key", status=resp.status_code)
        if resp.status_code >= 400:
            raise MapsError(f"Maps returned HTTP {resp.status_code}", status=resp.status_code)

        try:
            payload = resp.json()
        except (ValueError, httpx.DecodingError) as exc:
            raise MapsError("Maps returned a non-JSON body") from exc

        return _parse_search_payload(payload)


def _parse_search_payload(payload: dict[str, Any]) -> list[GeocodeResult]:
    """Project the Search Address response into ``GeocodeResult`` list."""
    out: list[GeocodeResult] = []
    for item in (payload or {}).get("results", []) or []:
        addr = item.get("address") or {}
        freeform = (addr.get("freeformAddress") or "").strip()
        if not freeform:
            continue
        position = item.get("position") or {}
        out.append(
            GeocodeResult(
                freeform_address=freeform,
                address_lines=_address_lines(addr),
                postcode=_clean_postcode(addr.get("postalCode")),
                lat=_as_float(position.get("lat")),
                lon=_as_float(position.get("lon")),
                score=_as_float(item.get("score")),
            )
        )
    return out


def _address_lines(addr: dict[str, Any]) -> list[str]:
    """Build up to 6 address lines from the Maps address parts.

    Maps gives structured parts; assemble a tidy 1..6 line address (the
    SuggestedAddress / InspectionAddress shape). Postcode is carried separately,
    so it is not duplicated into a line.
    """
    parts: list[str] = []
    for key in (
        "streetNameAndNumber",
        "streetName",
        "municipalitySubdivision",
        "municipality",
        "countrySecondarySubdivision",
        "countrySubdivision",
    ):
        val = (addr.get(key) or "").strip()
        if val and val not in parts:
            parts.append(val)
    return parts[:6]


def _clean_postcode(value: Any) -> str | None:
    if isinstance(value, str):
        s = value.strip().upper()
        return s or None
    return None


def _as_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None

"""Bounded Azure AI Vision client for location-clue extraction.

The client submits one image for read-text and tag analysis, then returns only
the textual clues and confidence values needed by location ranking. Credentials
come from runtime configuration and are never logged or returned. Tests replace
the HTTP transport and perform no network calls.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger("locationsuggest.vision")

# Non-secret default API version (Image Analysis 4.0 GA). Overridable per env.
DEFAULT_VISION_API_VERSION = "2024-02-01"

# Per-request timeout (seconds). Vision is a public-cloud API; bound the wait.
_DEFAULT_TIMEOUT_S = 30.0


class VisionError(RuntimeError):
    """Vision dependency failed (auth / transport / non-2xx). Carries the failure
    CLASS / status only — never the response body verbatim, never the key."""

    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class VisionNotConfigured(VisionError):
    """Required Vision app settings / Key Vault refs are absent."""


@dataclass
class VisionConfig:
    """Resolved from app settings. ``key`` maps to a Key Vault reference."""

    endpoint: str
    key: str = field(repr=False)
    api_version: str = field(default=DEFAULT_VISION_API_VERSION)

    @classmethod
    def from_env(cls) -> "VisionConfig":
        endpoint = (os.environ.get("AZURE_VISION_ENDPOINT", "").strip()).rstrip("/")
        key = os.environ.get("AZURE_VISION_KEY", "")
        api_version = (
            os.environ.get("AZURE_VISION_API_VERSION", "").strip()
            or DEFAULT_VISION_API_VERSION
        )
        missing = [
            name
            for name, val in (
                ("AZURE_VISION_ENDPOINT", endpoint),
                ("AZURE_VISION_KEY", key),
            )
            if not val
        ]
        if missing:
            # Signal the gap by NAME only — never the values.
            raise VisionNotConfigured(
                "Azure Vision is not configured (missing Key Vault refs / "
                f"app settings: {', '.join(missing)})"
            )
        return cls(endpoint=endpoint, key=key, api_version=api_version)

    @property
    def analyze_url(self) -> str:
        return f"{self.endpoint}/computervision/imageanalysis:analyze"

    def __repr__(self) -> str:  # pragma: no cover - trivial redaction
        return f"VisionConfig(endpoint={self.endpoint!r}, key=<redacted>, api_version={self.api_version!r})"


@dataclass
class VisionTextLine:
    """One OCR text line read off a photo."""

    text: str
    confidence: float | None = None


@dataclass
class VisionTag:
    """One scene/object tag (weak corroboration only)."""

    name: str
    confidence: float | None = None


@dataclass
class VisionResult:
    """The clues extracted from one photo."""

    ocr_lines: list[VisionTextLine] = field(default_factory=list)
    tags: list[VisionTag] = field(default_factory=list)


class VisionClient:
    """Azure AI Vision Image Analysis + Read OCR seam.

    Lazy and mockable: nothing happens at construction. The HTTP transport is
    created on first use and can be injected for tests.
    """

    def __init__(
        self,
        config: VisionConfig | None = None,
        *,
        transport: httpx.BaseTransport | None = None,
        timeout_s: float = _DEFAULT_TIMEOUT_S,
    ) -> None:
        self._config = config
        self._transport = transport
        self._timeout_s = timeout_s
        self._client: httpx.Client | None = None

    @property
    def config(self) -> VisionConfig:
        if self._config is None:
            self._config = VisionConfig.from_env()
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

    def analyze(self, image_bytes: bytes) -> VisionResult:
        """Analyze one image's bytes for OCR text + tags.

        Raises ``VisionError`` on any auth / transport / non-2xx failure (the
        orchestrator treats a Vision failure as a per-photo warning, not a hard
        stop, unless EVERY photo failed and there are no text clues).
        """
        cfg = self.config
        params = {
            "api-version": cfg.api_version,
            "features": "read,tags",
        }
        headers = {
            "Ocp-Apim-Subscription-Key": cfg.key,
            "Content-Type": "application/octet-stream",
        }
        try:
            resp = self.http.post(
                cfg.analyze_url, params=params, headers=headers, content=image_bytes
            )
        except httpx.HTTPError as exc:
            raise VisionError(f"Vision transport error: {type(exc).__name__}") from exc

        if resp.status_code == 401 or resp.status_code == 403:
            raise VisionError("Vision rejected the subscription key", status=resp.status_code)
        if resp.status_code >= 400:
            # Never echo resp.text — it can reflect the request.
            raise VisionError(f"Vision returned HTTP {resp.status_code}", status=resp.status_code)

        try:
            payload = resp.json()
        except (ValueError, httpx.DecodingError) as exc:
            raise VisionError("Vision returned a non-JSON body") from exc

        return _parse_analyze_payload(payload)


def _parse_analyze_payload(payload: dict[str, Any]) -> VisionResult:
    """Project the Image Analysis 4.0 response into ``VisionResult``.

    Tolerant of missing sections (a photo may have no text or no tags).
    """
    result = VisionResult()

    read_result = (payload or {}).get("readResult") or {}
    for block in read_result.get("blocks", []) or []:
        for line in block.get("lines", []) or []:
            text = (line.get("text") or "").strip()
            if not text:
                continue
            conf = line.get("confidence")
            result.ocr_lines.append(
                VisionTextLine(text=text, confidence=_as_float(conf))
            )

    tags_result = (payload or {}).get("tagsResult") or {}
    for tag in tags_result.get("values", []) or []:
        name = (tag.get("name") or "").strip()
        if not name:
            continue
        result.tags.append(VisionTag(name=name, confidence=_as_float(tag.get("confidence"))))

    return result


def _as_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None

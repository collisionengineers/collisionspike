"""Deterministic in-memory fakes for the location-suggest offline test suite.

No network, no Azure key, no Box. These fakes substitute for the real
VisionClient / MapsClient / PhotoSource so the core orchestration and the HTTP
handler are exercised purely.
"""

from __future__ import annotations

from maps_client import GeocodeResult, MapsError, MapsNotConfigured
from photo_source import PhotoRef, PhotoUnavailableError
from vision_client import VisionError, VisionNotConfigured, VisionResult, VisionTag, VisionTextLine


class FakePhotoSource:
    """Serves bytes from a fixture map keyed by evidence_id; unknown -> unavailable."""

    def __init__(self, fixtures: dict[str, bytes] | None = None) -> None:
        self._fixtures = dict(fixtures or {})

    def fetch_bytes(self, ref: PhotoRef) -> bytes:
        data = self._fixtures.get(ref.evidence_id)
        if data is None:
            raise PhotoUnavailableError(f"no fake bytes for {ref.evidence_id!r}")
        return data


class FakeVisionClient:
    """Returns a canned VisionResult per image-bytes value (keyed by the bytes),
    or a default result. Can be configured to raise VisionError / VisionNotConfigured."""

    def __init__(
        self,
        *,
        by_bytes: dict[bytes, VisionResult] | None = None,
        default: VisionResult | None = None,
        raise_error: Exception | None = None,
    ) -> None:
        self._by_bytes = dict(by_bytes or {})
        self._default = default if default is not None else VisionResult()
        self._raise = raise_error
        self.calls = 0

    def analyze(self, image_bytes: bytes) -> VisionResult:
        self.calls += 1
        if self._raise is not None:
            raise self._raise
        return self._by_bytes.get(image_bytes, self._default)

    def close(self) -> None:
        pass


class FakeMapsClient:
    """Returns canned GeocodeResults per query substring, or []. Can raise."""

    def __init__(
        self,
        *,
        by_query: dict[str, list[GeocodeResult]] | None = None,
        raise_error: Exception | None = None,
    ) -> None:
        self._by_query = dict(by_query or {})
        self._raise = raise_error
        self.queries: list[str] = []

    def geocode(self, query: str, *, limit: int = 3) -> list[GeocodeResult]:
        self.queries.append(query)
        if self._raise is not None:
            raise self._raise
        # Exact-match first, then substring contains (case-insensitive).
        if query in self._by_query:
            return self._by_query[query][:limit]
        ql = query.lower()
        for key, results in self._by_query.items():
            if key.lower() in ql or ql in key.lower():
                return results[:limit]
        return []

    def close(self) -> None:
        pass


def ocr_result(*texts: str, tags: list[str] | None = None) -> VisionResult:
    """Build a VisionResult from plain OCR text lines (+ optional tags)."""
    return VisionResult(
        ocr_lines=[VisionTextLine(text=t, confidence=0.9) for t in texts],
        tags=[VisionTag(name=n, confidence=0.8) for n in (tags or [])],
    )


def geo(
    label_address: str,
    *,
    lines: list[str] | None = None,
    postcode: str | None = None,
    score: float = 0.8,
) -> GeocodeResult:
    """Build a GeocodeResult quickly for the fake Maps client."""
    return GeocodeResult(
        freeform_address=label_address,
        address_lines=lines if lines is not None else [p.strip() for p in label_address.split(",")],
        postcode=postcode,
        score=score,
    )

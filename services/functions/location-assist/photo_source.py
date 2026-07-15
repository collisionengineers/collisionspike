"""Photo-byte sources for location assistance.

Production requests carry bytes inline from the Data API. Tests may supply an
in-memory fixture map. Direct Archive reads are deliberately unsupported so a
configuration change cannot create a second evidence-access path.
"""

from __future__ import annotations

import base64
import binascii
import os
from dataclasses import dataclass
from typing import Protocol, runtime_checkable


class PhotoUnavailableError(RuntimeError):
    """A single photo could not be fetched (unknown ref / Box read failed).

    NOT a hard failure: the orchestrator records a per-photo warning issue and
    carries on with the remaining photos + text clues. Only when EVERY photo is
    unavailable AND there are no usable text clues does the Function return 422.
    """


@dataclass(frozen=True)
class PhotoRef:
    """A reference to one inspection photo, mirroring the request ``photo_refs`` item.

    ``box_file_id`` is an optional Archive file key; ``evidence_id`` is the stable
    id used by fixture maps and per-photo warning issues.
    """

    evidence_id: str
    box_file_id: str | None = None
    filename: str | None = None
    image_role: str | None = None
    # Base64 image bytes supplied by the Data API. InlinePhotoSource decodes them
    # directly, so this service needs no separate Archive read permission.
    inline_b64: str | None = None


@runtime_checkable
class PhotoSource(Protocol):
    """The single seam: turn a ``PhotoRef`` into raw image bytes."""

    def fetch_bytes(self, ref: PhotoRef) -> bytes:
        """Return raw image bytes for ``ref`` or raise ``PhotoUnavailableError``."""
        ...


class StubPhotoSource:
    """Test source that serves bytes from an in-memory fixture map.

    The map is keyed by ``evidence_id`` -> raw image bytes. An unknown ref raises
    ``PhotoUnavailableError`` so tests can exercise the per-photo-warning and the
    all-unavailable (-> 422) paths deterministically. This NEVER calls Box.
    """

    def __init__(self, fixtures: dict[str, bytes] | None = None) -> None:
        self._fixtures: dict[str, bytes] = dict(fixtures or {})

    def fetch_bytes(self, ref: PhotoRef) -> bytes:
        data = self._fixtures.get(ref.evidence_id)
        if data is None:
            raise PhotoUnavailableError(
                f"no stub bytes for evidence_id {ref.evidence_id!r} "
                "(no fixture was registered)"
            )
        return data


class BoxPhotoSource:
    """Explicitly unsupported direct Archive read.

    The Data API is the current byte owner. Keeping this raising implementation
    prevents a configuration change from silently creating a second access path.
    """

    def __init__(self) -> None:  # pragma: no cover - activation-only
        # No construction-time Box/token work — kept lazy, like BoxClient.
        pass

    def fetch_bytes(self, ref: PhotoRef) -> bytes:  # pragma: no cover - activation-only
        raise PhotoUnavailableError(
            "Direct Archive reads are not implemented by location-assist; "
            "the Data API must provide inline evidence bytes."
        )


class InlinePhotoSource:
    """Decode base64 bytes carried on a ``PhotoRef`` by the Data API.

    A reference without bytes raises ``PhotoUnavailableError`` so mixed requests
    degrade per photo without creating another evidence-access path.
    """

    def fetch_bytes(self, ref: PhotoRef) -> bytes:
        if not ref.inline_b64:
            raise PhotoUnavailableError(
                f"no inline bytes for evidence_id {ref.evidence_id!r} "
                "(the Data API did not enrich this photo_ref)"
            )
        try:
            return base64.b64decode(ref.inline_b64, validate=False)
        except (ValueError, binascii.Error) as exc:
            raise PhotoUnavailableError(
                f"inline bytes for evidence_id {ref.evidence_id!r} are not valid base64: {exc}"
            ) from exc


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def get_photo_source(fixtures: dict[str, bytes] | None = None) -> PhotoSource:
    """Factory: return the active ``PhotoSource``.

    Returns ``StubPhotoSource`` by default. When ``BOX_API_ENABLED`` is true it
    returns the deliberately raising ``BoxPhotoSource`` unless the request already
    selected inline bytes. The test suite needs neither Archive access nor a token.

    ``fixtures`` seeds the test map and is ignored for the direct Archive path.
    """
    if _truthy(os.environ.get("BOX_API_ENABLED")):
        return BoxPhotoSource()  # pragma: no cover - activation-only
    return StubPhotoSource(fixtures)


def select_photo_source(
    photo_refs: "list[PhotoRef]", fixtures: dict[str, bytes] | None = None
) -> PhotoSource:
    """Pick the source for a request.

    When any ref carries inline bytes, use ``InlinePhotoSource`` because the Data API
    has already resolved them. Otherwise use the configured raising or test source.
    """
    if any(getattr(r, "inline_b64", None) for r in photo_refs):
        return InlinePhotoSource()
    return get_photo_source(fixtures)

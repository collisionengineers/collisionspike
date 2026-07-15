"""photo_source — the ONLY Box seam for the location-suggest Function.

Photo bytes are read behind a tiny adapter so the whole feature is buildable and
unit-testable WITHOUT live Box. Box is dormant in this spike
(``BOX_API_ENABLED=false``, the Key Vault empty of Box secrets), so the DEFAULT
implementation shipped here is the in-memory ``StubPhotoSource``; the real
``BoxPhotoSource`` is an explicit, marked ACTIVATION step that is never wired
until Box goes live.

Design (mirrors ``functions/parser/parser_adapter.py``'s single-seam idea and
``run_parser``'s lazy-import factory):

  * ``PhotoSource`` is a ``Protocol`` — one method, ``fetch_bytes(ref)``.
  * ``StubPhotoSource`` returns bytes from a fixture map keyed by ``evidence_id``
    (tests inject the map). It NEVER touches Box. This is what ships while Box is
    dormant.
  * ``BoxPhotoSource`` (ACTIVATION — present but NOT wired) fetches bytes via the
    Box content endpoint with a CCG token minted INSIDE the Function (never the
    connector), exactly the ``functions/box-webhook/box_client.py`` pattern. It is
    only constructed when ``BOX_API_ENABLED`` is true at activation.
  * ``get_photo_source()`` is the factory: it returns ``StubPhotoSource`` unless
    ``BOX_API_ENABLED`` is true (read at activation), so the offline test suite
    needs neither Box nor a token.

A ``PhotoUnavailableError`` on one ref is a per-photo WARNING (not a hard
failure); the orchestrator degrades to whatever photos + text clues it has.
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

    ``box_file_id`` is the dormant Box read key (absent until Box is live);
    ``evidence_id`` is the stable correlation id used by the stub fixture map and
    by per-photo warning issues.
    """

    evidence_id: str
    box_file_id: str | None = None
    filename: str | None = None
    image_role: str | None = None
    # base64 image bytes passed INLINE by the Data API (TKT-077). When present, InlinePhotoSource
    # decodes these directly, so the Function reads the case's photos without a Box grant of its own.
    inline_b64: str | None = None


@runtime_checkable
class PhotoSource(Protocol):
    """The single seam: turn a ``PhotoRef`` into raw image bytes."""

    def fetch_bytes(self, ref: PhotoRef) -> bytes:
        """Return raw image bytes for ``ref`` or raise ``PhotoUnavailableError``."""
        ...


class StubPhotoSource:
    """DEFAULT (Box-dormant) source: serves bytes from an in-memory fixture map.

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
                "(StubPhotoSource is the Box-dormant default)"
            )
        return data


class BoxPhotoSource:
    """ACTIVATION STEP — real Box content read. Present but NOT wired in v1.

    [ACTIVATION] When Box goes live (``BOX_API_ENABLED=true`` + the Box CCG
    secrets injected into Key Vault), ``get_photo_source()`` selects this impl. It
    fetches photo bytes via the Box content endpoint
    (``GET /2.0/files/{file_id}/content``) using a CCG service-identity token
    minted INSIDE the Function — exactly the ``functions/box-webhook/box_client.py``
    CCG-token-in-Function pattern (``grant_type=client_credentials``,
    ``box_subject_type=enterprise``, ``client_secret`` from a Key Vault reference).
    The connector NEVER mints the token; only this Function-side code does.

    Deliberately left unimplemented in v1 so nothing can accidentally reach live
    Box while it is dormant. ``fetch_bytes`` raises ``PhotoUnavailableError`` (not
    a silent stub) to make a premature wire-up loud. The activation work is:
      1. add ``box_client.BoxClient`` (or reuse the box-webhook client) here,
      2. ``GET /2.0/files/{ref.box_file_id}/content`` with the bearer token,
      3. map a Box 404/403 to ``PhotoUnavailableError`` (per-photo warning).
    """

    def __init__(self) -> None:  # pragma: no cover - activation-only
        # No construction-time Box/token work — kept lazy, like BoxClient.
        pass

    def fetch_bytes(self, ref: PhotoRef) -> bytes:  # pragma: no cover - activation-only
        raise PhotoUnavailableError(
            "BoxPhotoSource is an activation step and is not wired in v1; "
            "Box is dormant (BOX_API_ENABLED=false). Implement the CCG content "
            "read before flipping BOX_API_ENABLED."
        )


class InlinePhotoSource:
    """LIVE (Box-independent) source: decodes base64 image bytes carried INLINE on the PhotoRef.

    TKT-077: the Data API resolves each photo's bytes (blob-first, Box-facade fallback) and passes
    them as ``image_base64`` on the request's ``photo_refs``, so this Function reads the case's OWN
    photos with NO Box grant of its own — replacing the raising ``BoxPhotoSource`` on the live path.
    A ref with no inline bytes raises ``PhotoUnavailableError`` (a per-photo warning), so a mix of
    enriched and un-enriched refs degrades cleanly, exactly like the stub.
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

    Returns ``StubPhotoSource`` by default. Only when ``BOX_API_ENABLED`` is true
    (read at activation) does it return ``BoxPhotoSource``. The offline test suite
    therefore needs neither Box nor a token — and a v1 deploy with Box dormant
    transparently uses the stub.

    ``fixtures`` is accepted so tests (and a dormant local run) can seed the stub
    map; it is ignored for the Box path.
    """
    if _truthy(os.environ.get("BOX_API_ENABLED")):
        return BoxPhotoSource()  # pragma: no cover - activation-only
    return StubPhotoSource(fixtures)


def select_photo_source(
    photo_refs: "list[PhotoRef]", fixtures: dict[str, bytes] | None = None
) -> PhotoSource:
    """Pick the active source for a request. When ANY ref carries inline bytes (the live
    Data-API-enriched path, TKT-077), use ``InlinePhotoSource`` — this is preferred over Box/Stub
    because the API has already resolved the bytes. Otherwise fall back to ``get_photo_source()``
    (Stub while Box is dormant; Box at activation)."""
    if any(getattr(r, "inline_b64", None) for r in photo_refs):
        return InlinePhotoSource()
    return get_photo_source(fixtures)

"""location_suggest — the importable CORE of the location-suggest Function.

Pure orchestration, separated from the HTTP handler (``function_app.py``) so
tests drive it with mocked Vision / Maps / Photo clients and assert ranking +
the ADR-0013 invariants WITHOUT constructing an HttpRequest, exactly the way
``functions/enrichment``'s ``enrich()`` is split from its handler.

What it does
------------
1. Fetch each selected photo's bytes via the injected ``PhotoSource`` (the Box
   seam — stubbed in v1). A per-photo fetch failure is a WARNING, not a stop.
2. Run Azure AI Vision (Image Analysis + Read OCR) over each fetched photo to get
   signage / scene clues.
3. Geocode, via Azure Maps:
     * each signage line       -> ``photo_sign`` candidates,
     * the accident place/postcode parsed from the circumstances -> ``near_accident``,
     * the claimant address    -> ``near_claimant``.
4. Rank the geocoded candidates (confidence + evidence count) and return the top
   ``max_candidates``, with PLAIN-language provenance.

ADR-0013 invariants this core upholds:
  * it receives clues in the request and returns CANDIDATES only — it never reads
    or writes a Case row (no Dataverse client is even imported);
  * a candidate is a SUGGESTION, never a decision — confidence drives ORDERING
    only, nothing is auto-selected;
  * every human-visible string (``label`` / ``evidence[].detail``) is plain
    business language — no engineering terms.

Contract version stamped on the response: ``ce_location_suggest_v1``.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Any

import clue_extraction
from ai_reasoning import AiLocationReasoner
from maps_client import GeocodeResult, MapsClient, MapsError, MapsNotConfigured
from photo_source import PhotoRef, PhotoSource, PhotoUnavailableError
from vision_client import VisionClient, VisionError, VisionNotConfigured

logger = logging.getLogger("locationsuggest.core")

CONTRACT_VERSION = "ce_location_suggest_v1"

# Candidates below this confidence are dropped (the "floor"); when nothing clears
# it, the response is noConfidentLocation=true. Kept low — a reviewer confirms
# every candidate, so the floor only removes near-noise.
_CONFIDENCE_FLOOR = 0.2

# Default / clamp for max_candidates (mirrors the contract: default 5, 1..10).
_DEFAULT_MAX_CANDIDATES = 5
_MIN_MAX_CANDIDATES = 1
_MAX_MAX_CANDIDATES = 10

# Per-clue OCR signage query cap (a busy photo cannot fan out unbounded).
_MAX_SIGNAGE_QUERIES = 6

# Evidence kinds (INTERNAL enum — the UI maps these to plain phrases; the values
# here are also internal, but each carries a plain-language ``detail`` string).
KIND_PHOTO_SIGN = "photo_sign"
KIND_NEAR_ACCIDENT = "near_accident"
KIND_NEAR_CLAIMANT = "near_claimant"
KIND_AI_REASONING = "ai_reasoning"  # deeper AI vision-reasoning escalation (TKT-078)

# Cap on photo bytes retained for the (expensive) AI escalation.
_MAX_AI_PHOTOS = 4


@dataclass
class Evidence:
    kind: str
    detail: str
    source_photo_ref: str | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"kind": self.kind, "detail": self.detail}
        if self.source_photo_ref:
            out["sourcePhotoRef"] = self.source_photo_ref
        return out


@dataclass
class Candidate:
    label: str
    address_lines: list[str] = field(default_factory=list)
    postcode: str | None = None
    confidence: float = 0.0
    evidence: list[Evidence] = field(default_factory=list)
    source_photo_ref: str | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "label": self.label,
            "addressLines": [ln for ln in self.address_lines if (ln or "").strip()][:6],
            "confidence": round(self.confidence, 4),
            "evidence": [e.to_dict() for e in self.evidence],
        }
        if self.postcode:
            out["postcode"] = self.postcode
        if self.source_photo_ref:
            out["sourcePhotoRef"] = self.source_photo_ref
        return out


@dataclass
class SuggestResult:
    candidates: list[Candidate] = field(default_factory=list)
    no_confident_location: bool = True
    issues: list[dict[str, Any]] = field(default_factory=list)

    def to_response(self) -> dict[str, Any]:
        return {
            "candidates": [c.to_dict() for c in self.candidates],
            "noConfidentLocation": self.no_confident_location,
            "issues": self.issues,
            "contract_version": CONTRACT_VERSION,
        }


def clamp_max_candidates(value: Any) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return _DEFAULT_MAX_CANDIDATES
    return max(_MIN_MAX_CANDIDATES, min(n, _MAX_MAX_CANDIDATES))


def suggest_locations(
    *,
    photo_refs: list[PhotoRef],
    accident_circumstances: str | None,
    claimant_address: str | None,
    max_candidates: int = _DEFAULT_MAX_CANDIDATES,
    photo_source: PhotoSource,
    vision: VisionClient,
    maps: MapsClient,
    deep: bool = False,
    ai_reasoner: AiLocationReasoner | None = None,
) -> SuggestResult:
    """Run the full suggestion pipeline with injected dependencies.

    Returns a ``SuggestResult``. Raises ``AllPhotosUnreadable`` ONLY when every
    supplied photo was unavailable AND no text clue was supplied (the handler maps
    that to 422). Vision/Maps NOT-configured raises the typed not-configured errors
    so the handler can return 502 (dependency failed). Per-photo and per-clue
    failures degrade to warnings in ``issues``.
    """
    issues: list[dict[str, Any]] = []
    candidates: list[Candidate] = []

    # Whether the reviewer SUPPLIED any text clue (not whether it proved geocodable).
    # The 422 below means "nothing to work with at all"; a supplied-but-unusable clue
    # (e.g. a long narrative with no postcode that extract_place skips) must NOT be
    # misreported as unreadable photos — it falls through to a normal empty
    # (noConfidentLocation) result instead.
    has_text_clue_supplied = bool(
        (accident_circumstances or "").strip() or (claimant_address or "").strip()
    )

    # --- 1+2. Photos -> Vision OCR signage -> geocode -------------------------
    photos_attempted = len(photo_refs)
    photos_unavailable = 0
    photos_analysed = 0
    fetched_bytes: list[bytes] = []  # retained (capped) for the AI escalation
    for ref in photo_refs:
        try:
            image_bytes = photo_source.fetch_bytes(ref)
        except PhotoUnavailableError:
            photos_unavailable += 1
            issues.append(
                _warning(
                    field=f"photo:{ref.evidence_id}",
                    code="photo_unavailable",
                    message="A photo could not be read and was skipped.",
                )
            )
            continue
        if len(fetched_bytes) < _MAX_AI_PHOTOS:
            fetched_bytes.append(image_bytes)

        try:
            vresult = vision.analyze(image_bytes)
        except (VisionNotConfigured,):
            # The Vision dependency is not wired — a server fault. Re-raise so the
            # handler returns 502 rather than silently producing zero candidates.
            raise
        except VisionError:
            issues.append(
                _warning(
                    field=f"photo:{ref.evidence_id}",
                    code="photo_not_analysed",
                    message="A photo could not be examined and was skipped.",
                )
            )
            continue

        photos_analysed += 1
        ocr_texts = [ln.text for ln in vresult.ocr_lines]
        for query in clue_extraction.signage_queries(
            ocr_texts, max_queries=_MAX_SIGNAGE_QUERIES
        ):
            # Signage is a business name -> fuzzy/POI search resolves it far better than the
            # address geocoder (TKT-077); addresses/postcodes still use geocode below.
            geo = _safe_geocode(maps, query, issues, limit=2, poi=True)
            for g in geo:
                candidates.append(
                    _candidate_from_geocode(
                        g,
                        evidence=Evidence(
                            kind=KIND_PHOTO_SIGN,
                            detail=f"sign reads '{query}'",
                            source_photo_ref=ref.evidence_id,
                        ),
                        boost=_text_match_boost(query, g.freeform_address),
                        source_photo_ref=ref.evidence_id,
                    )
                )

    # --- 3. Text clues -> geocode --------------------------------------------
    accident_place = clue_extraction.extract_place(accident_circumstances)
    if accident_place:
        for g in _safe_geocode(maps, accident_place, issues, limit=2):
            candidates.append(
                _candidate_from_geocode(
                    g,
                    evidence=Evidence(
                        kind=KIND_NEAR_ACCIDENT,
                        detail="near the accident location",
                    ),
                )
            )

    claimant_place = clue_extraction.extract_place(claimant_address)
    if claimant_place:
        for g in _safe_geocode(maps, claimant_place, issues, limit=2):
            candidates.append(
                _candidate_from_geocode(
                    g,
                    evidence=Evidence(
                        kind=KIND_NEAR_CLAIMANT,
                        detail="near the claimant address",
                    ),
                )
            )

    # --- 3b. AI vision-reasoning ESCALATION (deep, gated, TKT-078) ------------
    # Reviewer-invoked deeper pass: the AI reasons over the case photos and returns place
    # GUESSES, which we re-geocode via Maps (fuzzy) exactly like signage — the AI never
    # returns a final address (ADR-0013). Off/unconfigured => ai_reasoner is None (no-op).
    if deep and ai_reasoner is not None and fetched_bytes:
        try:
            guesses = ai_reasoner.suggest(
                fetched_bytes, accident=accident_circumstances, claimant=claimant_address
            )
        except Exception:  # noqa: BLE001 - the escalation must never break the base result
            logger.warning("AI reasoning escalation failed; ignoring", exc_info=True)
            guesses = []
        for guess in guesses:
            for g in _safe_geocode(maps, guess.query, issues, limit=2, poi=True):
                candidates.append(
                    _candidate_from_geocode(
                        g,
                        evidence=Evidence(
                            kind=KIND_AI_REASONING,
                            detail=guess.reasoning or f"deeper photo analysis: {guess.query}",
                        ),
                        boost=_text_match_boost(guess.query, g.freeform_address),
                    )
                )

    # --- 422 condition: every photo unavailable AND no text clue --------------
    if photos_attempted > 0 and photos_unavailable == photos_attempted and not has_text_clue_supplied:
        raise AllPhotosUnreadable(
            "every supplied photo was unavailable and there were no text clues"
        )

    # --- 4. Merge duplicates, rank, floor, cap --------------------------------
    merged = _merge_candidates(candidates)
    ranked = _rank(merged)
    kept = [c for c in ranked if c.confidence >= _CONFIDENCE_FLOOR][:clamp_max_candidates(max_candidates)]

    return SuggestResult(
        candidates=kept,
        no_confident_location=(len(kept) == 0),
        issues=issues,
    )


class AllPhotosUnreadable(RuntimeError):
    """Every supplied photo was unavailable and there were no text clues.

    The handler maps this to 422 (photos unreadable) — a client-side condition
    the Function cannot fix, mirroring the parser's DocumentUnreadableError->422.
    """


def _safe_geocode(
    maps: MapsClient, query: str, issues: list[dict[str, Any]], *, limit: int, poi: bool = False
) -> list[GeocodeResult]:
    """Look a query up via Maps, degrading a transient failure to a warning.

    ``poi=True`` uses Fuzzy Search (business names off signage); otherwise Search-Address
    (accident/claimant places). A NOT-configured Maps is a server fault and is re-raised
    (handler -> 502); a transient/per-query Maps error becomes a warning so other clues still run.
    """
    try:
        return maps.search_poi(query, limit=limit) if poi else maps.geocode(query, limit=limit)
    except MapsNotConfigured:
        raise
    except MapsError:
        issues.append(
            _warning(
                field="(maps)",
                code="geocode_failed",
                message="A location lookup could not be completed and was skipped.",
            )
        )
        return []


def _candidate_from_geocode(
    g: GeocodeResult,
    *,
    evidence: Evidence,
    boost: float = 0.0,
    source_photo_ref: str | None = None,
) -> Candidate:
    """Build a Candidate from a geocode hit + its single source evidence."""
    # Base confidence from the Maps relevance score (0..1-ish), nudged by any
    # text-match boost (sign text appearing in the returned address). A missing OR
    # non-finite score (NaN/Infinity — json.loads accepts those tokens by default) is
    # treated as neutral 0.5, never clamped to 1.0 (min(1.0, nan)==1.0 would float
    # garbage to the TOP of the ranking).
    base = g.score if isinstance(g.score, (int, float)) and math.isfinite(g.score) else 0.5
    confidence = max(0.0, min(1.0, float(base) + boost))
    return Candidate(
        label=_short_label(g),
        address_lines=list(g.address_lines),
        postcode=g.postcode,
        confidence=confidence,
        evidence=[evidence],
        source_photo_ref=source_photo_ref or evidence.source_photo_ref,
    )


def _short_label(g: GeocodeResult) -> str:
    """A short human label, e.g. 'Smith Recovery, Acton'. Falls back to the
    freeform address trimmed to its first two parts."""
    if g.address_lines:
        return ", ".join(g.address_lines[:2])
    parts = [p.strip() for p in g.freeform_address.split(",") if p.strip()]
    return ", ".join(parts[:2]) if parts else g.freeform_address


def _text_match_boost(query: str, address: str) -> float:
    """Small confidence boost when the sign text actually appears in the geocoded
    address (a business name that resolves to itself is a stronger signal)."""
    q = (query or "").strip().lower()
    a = (address or "").lower()
    if q and len(q) >= 4 and q in a:
        return 0.15
    return 0.0


def _merge_candidates(candidates: list[Candidate]) -> list[Candidate]:
    """Merge candidates that resolve to the same place (same postcode + label),
    summing their evidence and keeping the highest confidence. Ties on key keep
    the first-seen order."""
    merged: dict[tuple[str, str, str], Candidate] = {}
    order: list[tuple[str, str, str]] = []
    for c in candidates:
        # Same postcode + label = same place. With NO postcode, the label alone can
        # collide across genuinely different places (two "High Street"s in different
        # towns), so fold the full address lines into the key to avoid over-merging
        # two distinct postcode-less hits into one.
        addr_disc = (
            ""
            if (c.postcode or "").strip()
            else "|".join((ln or "").strip().lower() for ln in c.address_lines)
        )
        key = ((c.postcode or "").upper(), c.label.strip().lower(), addr_disc)
        if key not in merged:
            merged[key] = c
            order.append(key)
        else:
            existing = merged[key]
            existing.confidence = max(existing.confidence, c.confidence)
            # Append distinct evidence (avoid duplicate detail lines).
            existing_details = {(e.kind, e.detail) for e in existing.evidence}
            for e in c.evidence:
                if (e.kind, e.detail) not in existing_details:
                    existing.evidence.append(e)
                    existing_details.add((e.kind, e.detail))
            if not existing.source_photo_ref and c.source_photo_ref:
                existing.source_photo_ref = c.source_photo_ref
    return [merged[k] for k in order]


def _rank(candidates: list[Candidate]) -> list[Candidate]:
    """Order by confidence desc; ties broken by MORE evidence first."""
    return sorted(candidates, key=lambda c: (c.confidence, len(c.evidence)), reverse=True)


def _warning(*, field: str, code: str, message: str) -> dict[str, Any]:
    return {"field": field, "severity": "warning", "code": code, "message": message}

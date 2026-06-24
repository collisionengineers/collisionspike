"""clue_extraction — pure, dependency-free clue parsing.

Turns the raw inputs (OCR text lines off the photos + the two verbatim text
clues) into geocodable QUERY strings and the per-query provenance the response
needs. No network, no Azure — pure functions, fully unit-tested.

Two jobs:

  * ``extract_postcode`` / ``extract_place`` — a best-effort pull of a UK
    postcode and/or a place phrase from free text (the EVA accident
    circumstances; the claimant address). This is the lightweight in-Function
    stand-in for the sibling ``cedocumentmapper_v2.0`` place/postcode pull
    described in the spec; it deliberately stays simple and conservative.
  * ``signage_queries`` — tidy OCR text lines into plausible business-name /
    sign queries to geocode (drop pure-numeric / too-short / plate-like lines).

Plain-language rule: nothing here emits engineering terms — the only strings that
reach a human are the address ``label`` and the ``detail`` provenance, which the
orchestrator phrases in business language ("sign reads '...'", "near the accident
location", "near the claimant address").
"""

from __future__ import annotations

import re

# UK postcode (outward + inward), tolerant of an optional space. Matches the
# common formats (A9 9AA, A99 9AA, AA9 9AA, AA99 9AA, A9A 9AA, AA9A 9AA).
_UK_POSTCODE_RE = re.compile(
    r"\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b",
    re.IGNORECASE,
)

# UK number-plate shapes — used to DROP an OCR line that IS (just) a plate, so a
# registration read off the overview photo is never geocoded as a "place". Matched
# against the WHOLE (space-normalised) line via fullmatch in signage_queries, so a
# business-name line that merely CONTAINS a plate substring is KEPT. Covers the
# current + prefix + suffix formats; dateless plates are deliberately NOT matched
# (too ambiguous with real signage).
_VRM_RE = re.compile(
    r"[A-Z]{2}\d{2}\s?[A-Z]{3}"      # current:  AA00 AAA
    r"|[A-Z]\d{1,3}\s?[A-Z]{3}"      # prefix:   A0 AAA .. A000 AAA
    r"|[A-Z]{3}\s?\d{1,3}[A-Z]",     # suffix:   AAA 0A .. AAA 000A
    re.IGNORECASE,
)

# Lines that are mostly digits / punctuation carry no place signal.
_MOSTLY_DIGITS_RE = re.compile(r"^[\d\W]+$")


def normalise_postcode(raw: str) -> str:
    """Normalise a UK postcode to the canonical 'OUTWARD INWARD' upper-case form."""
    m = _UK_POSTCODE_RE.search(raw or "")
    if not m:
        return (raw or "").strip().upper()
    return f"{m.group(1).upper()} {m.group(2).upper()}"


def extract_postcode(text: str | None) -> str | None:
    """Return the first UK postcode found in ``text`` (normalised), or None."""
    if not text:
        return None
    m = _UK_POSTCODE_RE.search(text)
    if not m:
        return None
    return f"{m.group(1).upper()} {m.group(2).upper()}"


def extract_place(text: str | None) -> str | None:
    """Best-effort: a short geocodable place phrase from free text.

    Conservative — if a postcode is present we prefer the WHOLE trimmed text as
    the geocode query (Maps handles "<somewhere near> <postcode>" well). When no
    postcode is present we return the trimmed text only if it is short enough to
    plausibly be a place reference rather than a long narrative. Returns None for
    empty / clearly-non-place text so the orchestrator can skip the geocode.
    """
    if not text:
        return None
    s = " ".join(text.split())
    if not s:
        return None
    if extract_postcode(s):
        # A postcode anchors the query well; pass the trimmed text through.
        return s
    # No postcode: only use it if it is a compact phrase (avoid geocoding a long
    # accident narrative — that produces noise, not a place).
    word_count = len(s.split())
    if word_count <= 12 and len(s) <= 120:
        return s
    return None


def signage_queries(ocr_lines: list[str], *, max_queries: int = 6) -> list[str]:
    """Tidy OCR text lines into plausible business-name / sign queries.

    Drops: blank lines, plate-like lines, mostly-numeric lines, and lines shorter
    than 3 chars. De-duplicates case-insensitively, preserving order. Caps the
    list so a busy photo cannot fan out into too many geocode calls.
    """
    seen: set[str] = set()
    out: list[str] = []
    for raw in ocr_lines:
        line = " ".join((raw or "").split())
        if len(line) < 3:
            continue
        if _MOSTLY_DIGITS_RE.match(line):
            continue
        # Drop a line only when the WHOLE line is a plate (not merely contains one),
        # so a sign like "Smith Recovery AB12 CDE" keeps its business name.
        if _VRM_RE.fullmatch(line):
            continue
        key = line.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(line)
        if len(out) >= max_queries:
            break
    return out

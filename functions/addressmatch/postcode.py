"""UK postcode parsing + the EVA field-9 (6-line) serializer — pure, no I/O.

[BUILD] — authored offline, exercised directly by ``pytest``. NOTHING here makes
a network call, reads Dataverse, or touches Azure: it is deterministic string
work shared by the matcher and the HTTP handler.

Two jobs:

1. **Parse** a UK ``Loc`` string into ``outward`` (the district / outward code,
   e.g. ``CH5``) and ``inward`` (e.g. ``2AB``), classifying it as ``full`` (a
   complete unit like ``OL1 3QR``) or ``part`` (district only like ``CH5``).
   This mirrors the shared UK-postcode parser used by the corpus analysis
   (``raw/principalandrepairersheets/outputs/_scripts/_lib.py``) so the service
   speaks the same dialect as ``loc_principal_analysis.md``.

2. **Serialize** a resolved physical address (six address lines + postcode) into
   the EVA *inspection address* field — **exactly six newline-separated lines**
   (integrations.md / the 12-field EVA contract). The ``Image Based Assessment``
   alternative form is a single literal line and is produced ONLY by the policy
   layer (``matching.serialize_inspection_address``), never silently here.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Canonical UK postcode regex (GOV.UK / Cabinet Office "bulk data transfer"
# pattern, area-anchored). Matches a FULL unit postcode with optional internal
# space. Mirrors the corpus parser so "full vs part" agrees byte-for-byte.
_FULL_POSTCODE_RE = re.compile(
    r"^(?P<outward>[A-Z]{1,2}[0-9R][0-9A-Z]?)\s*(?P<inward>[0-9][ABD-HJLNP-UW-Z]{2})$"
)

# An OUTWARD code on its own (district / part postcode), e.g. ``CH5``, ``SW1A``.
_OUTWARD_RE = re.compile(r"^[A-Z]{1,2}[0-9R][0-9A-Z]?$")

# EVA inspection address is ALWAYS six lines (pad/truncate to exactly six).
EVA_ADDRESS_LINES = 6

# The canonical image-based literal (mirrors IMAGE_BASED_LITERAL in
# mockup-app/src/domain/address-policy.ts). Single line — NOT six.
IMAGE_BASED_LITERAL = "Image Based Assessment"


@dataclass(frozen=True)
class ParsedPostcode:
    """Outcome of parsing a ``Loc`` / postcode string."""

    raw: str
    """The original input (trimmed)."""
    kind: str
    """``"full"`` | ``"part"`` | ``"none"`` (non-postcode / empty text)."""
    outward: str
    """Outward code (district) in canonical UPPERCASE, e.g. ``CH5``; ``""`` if none."""
    inward: str
    """Inward code, e.g. ``2AB``; ``""`` for a part postcode or non-postcode."""

    @property
    def normalized(self) -> str:
        """Canonical single-space form (``CH5 2AB``) for a full postcode, else
        the bare outward code, else ``""``."""
        if self.kind == "full":
            return f"{self.outward} {self.inward}"
        if self.kind == "part":
            return self.outward
        return ""


def parse_postcode(value: str | None) -> ParsedPostcode:
    """Parse a ``Loc`` / postcode string into outward/inward + a full|part|none kind.

    * Case-insensitive; internal whitespace tolerated and normalised.
    * ``full`` only when the inward code is present and well-formed.
    * ``part`` when the whole token is a valid outward code.
    * ``none`` for empty input or free text that is not a postcode at all
      (e.g. ``"Image Based Assessment"``, ``"storage yard"``).
    """
    if not value:
        return ParsedPostcode(raw="", kind="none", outward="", inward="")
    raw = value.strip()
    if not raw:
        return ParsedPostcode(raw="", kind="none", outward="", inward="")

    compact = raw.upper()
    m = _FULL_POSTCODE_RE.match(compact)
    if m:
        return ParsedPostcode(
            raw=raw, kind="full", outward=m.group("outward"), inward=m.group("inward")
        )

    # Not a full unit — is the whole (space-stripped) token a bare outward code?
    token = compact.replace(" ", "")
    if _OUTWARD_RE.match(token):
        return ParsedPostcode(raw=raw, kind="part", outward=token, inward="")

    return ParsedPostcode(raw=raw, kind="none", outward="", inward="")


def outward_of(value: str | None) -> str:
    """The outward code (district) for any postcode-ish string, or ``""``.

    Used to compare a Case ``Loc`` district against a candidate site's postcode
    via the ROADMAP-4a rule: *district ``startswith(outwardCode)``*.
    """
    return parse_postcode(value).outward


def district_matches(case_outward: str, candidate_postcode: str | None) -> bool:
    """ROADMAP-4a district test: does ``candidate_postcode``'s outward code EQUAL
    the Case's part-postcode district?

    The Case ``Loc`` is an outward code (e.g. ``CH5``); a candidate yard carries a
    full postcode (e.g. ``CH5 2AB`` → outward ``CH5``). We match on outward-code
    **equality** — UK outward codes are token-distinct, so a 2-char district like
    ``B5`` must NOT swallow ``B50``. (``'B50'.startswith('B5')`` is True at the
    string level — exactly the cross-district false positive that equality avoids;
    a prior ``startswith`` implementation had this bug.) This mirrors the corpus
    rule (``district == repairer district``, ``raw/.../_scripts/task4.py``). Empty
    inputs never match.
    """
    co = (case_outward or "").strip().upper()
    if not co:
        return False
    cand_out = outward_of(candidate_postcode)
    if not cand_out:
        return False
    return cand_out == co


def serialize_six_lines(lines: list[str], postcode: str | None = None) -> str:
    """Render an address as EXACTLY six newline-separated lines for EVA field 9.

    * Drops blank/whitespace-only lines, then pads with empty strings to six
      (or truncates extras into the last line so no data is lost).
    * If ``postcode`` is supplied and not already the final non-empty line, it is
      appended as its own line before padding (UK addresses end with the
      postcode). Caller passes the already-normalised postcode.
    * Always returns a string with exactly five ``\\n`` separators (six lines),
      matching the EVA contract's "6 newline-separated lines".
    """
    cleaned = [ln.strip() for ln in (lines or []) if ln and ln.strip()]

    pc = (postcode or "").strip()
    if pc and (not cleaned or cleaned[-1].upper() != pc.upper()):
        cleaned.append(pc)

    if len(cleaned) > EVA_ADDRESS_LINES:
        # Fold the overflow into the final slot rather than discard it.
        head = cleaned[: EVA_ADDRESS_LINES - 1]
        tail = ", ".join(cleaned[EVA_ADDRESS_LINES - 1 :])
        cleaned = head + [tail]

    while len(cleaned) < EVA_ADDRESS_LINES:
        cleaned.append("")

    return "\n".join(cleaned)

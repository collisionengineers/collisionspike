"""Case-type detection helpers.

A *marker* prefix on the Case/PO value (carried in ``FieldKey.REFERENCE``)
distinguishes the non-standard case-types from a provider's regular work
(``PCH26...``). The marker set (collisionspike ADR-0021, extending ADR-0014):

===========  ==================  ============================================
Marker       case_type           Meaning
===========  ==================  ============================================
``A.``       ``audit``           A second, independent CE inspection auditing
                                 a THIRD-PARTY engineer's original report on a
                                 repairable vehicle (e.g. ``A.PCH261269``).
``AP.``      ``audit_total_loss``  The same audit work where the vehicle is a
                                 total loss (Pre-Accident Valuation outcome,
                                 e.g. ``AP.QDOS261530``). NEVER inferred from
                                 instruction content — the repairable vs
                                 total-loss split only becomes known at/after
                                 inspection, so this marker is only ever READ
                                 (from an already-marked reference), not
                                 detected.
``D.``       ``diminution``      A Diminution in Value engagement
                                 (e.g. ``D.PCH26190``).
===========  ==================  ============================================

Each case-type is parsed for the same EVA fields by the same pipeline -- the
case-type is metadata, not a different parse path. Detection is robust to
surrounding whitespace and case.

``is_audit`` / ``case_type`` are INTERNAL state only -- they must never reach
the EVA JSON export (the bundled eva-json schema would reject an extra
property).
"""

from __future__ import annotations

import re

# Marker -> case_type. Iteration order is longest-marker-first so ``AP.`` can
# never be half-read as ``A.`` (the regex alternation below mirrors it).
CASE_TYPE_BY_MARKER: dict[str, str] = {
    "AP.": "audit_total_loss",
    "A.": "audit",
    "D.": "diminution",
}

# Matches a marker prefix (optionally surrounded by whitespace, any case)
# followed by an alphabetic character that begins the real Case/PO (e.g.
# "A.PCH261269", " ap. qdos261530 ", "D.PCH26190"). The trailing [A-Za-z]
# guards against false positives such as bare initials or "A.4" numeric noise.
# The alternation is longest-first ("AP" before "A") so "AP." is never
# consumed as "A" + a failed literal dot.
MARKER_REFERENCE_RE = re.compile(r"^\s*(AP|A|D)\.\s*[A-Za-z]", re.IGNORECASE)

# Kept for backward compatibility (pre-ADR-0021 callers/tests match the audit
# marker only). Prefer marker_for_reference / case_type_for_reference.
AUDIT_REFERENCE_RE = re.compile(r"^\s*A\.\s*[A-Za-z]", re.IGNORECASE)


def marker_for_reference(reference: str | None) -> str | None:
    """Return the canonical marker (``'A.'``/``'AP.'``/``'D.'``) on a Case/PO
    ``reference``, or ``None`` when it carries no marker."""
    if not reference:
        return None
    match = MARKER_REFERENCE_RE.match(reference)
    if not match:
        return None
    return f"{match.group(1).upper()}."


def case_type_for_reference(reference: str | None) -> str | None:
    """Return the case-type named by the reference's marker prefix, or ``None``.

    ``'A.PCH261269'`` -> ``'audit'``, ``'AP.QDOS261530'`` ->
    ``'audit_total_loss'``, ``'D.PCH26190'`` -> ``'diminution'``,
    ``'PCH26050'`` -> ``None``.
    """
    marker = marker_for_reference(reference)
    if marker is None:
        return None
    return CASE_TYPE_BY_MARKER[marker]


def is_audit_reference(reference: str | None) -> bool:
    """Return True when a Case/PO ``reference`` carries an audit marker.

    Both audit kinds count: ``A.`` (repairable) and ``AP.`` (total loss) are
    audits of a third-party report; ``D.`` (diminution) is NOT an audit.
    """
    return case_type_for_reference(reference) in ("audit", "audit_total_loss")


def case_type_signal_for_reference(reference: str | None) -> str | None:
    """Return an auditable signal string when the reference carries a case-type
    marker.

    The signal records *why* the case-type fired so the decision is traceable
    in the record's ``audit_signals``. Returns ``None`` for unmarked references.
    """
    marker = marker_for_reference(reference)
    if marker is None:
        return None
    case_type = CASE_TYPE_BY_MARKER[marker]
    return (
        f"reference '{(reference or '').strip()}' carries the '{marker}' "
        f"{case_type} case-type prefix"
    )


def audit_signal_for_reference(reference: str | None) -> str | None:
    """Backward-compatible alias: signal string for AUDIT-marked references only.

    Pre-ADR-0021 name; new callers should use
    :func:`case_type_signal_for_reference` (which also covers ``D.``).
    """
    if not is_audit_reference(reference):
        return None
    return case_type_signal_for_reference(reference)

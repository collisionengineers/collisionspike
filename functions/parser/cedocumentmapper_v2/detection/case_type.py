"""Case-type detection helpers.

An *audit* case-type is a second, independent CE inspection that audits a
THIRD-PARTY engineer's original report. It is parsed for the same EVA fields by
the same pipeline -- "audit" is a CASE-TYPE, not a different parse path.

The marker is an ``A.`` prefix on the Case/PO value (carried in
``FieldKey.REFERENCE``), e.g. ``A.PCH261269`` distinguishes audit work from the
provider's regular work (``PCH26...``). Detection is robust to surrounding
whitespace and case.

``is_audit`` is INTERNAL state only -- it must never reach the EVA JSON export
(the bundled eva-json schema would reject an extra property).
"""

from __future__ import annotations

import re

# Matches an "A." prefix (optionally surrounded by whitespace, any case) followed
# by an alphabetic character that begins the real Case/PO (e.g. "A.PCH261269",
# " a. pch261272 "). The trailing [A-Za-z] guards against false positives such as
# bare initials or "A.4" numeric noise.
AUDIT_REFERENCE_RE = re.compile(r"^\s*A\.\s*[A-Za-z]", re.IGNORECASE)


def is_audit_reference(reference: str | None) -> bool:
    """Return True when a Case/PO ``reference`` carries the ``A.`` audit marker."""
    if not reference:
        return False
    return bool(AUDIT_REFERENCE_RE.match(reference))


def audit_signal_for_reference(reference: str | None) -> str | None:
    """Return an auditable signal string when the reference marks an audit case.

    The signal records *why* the audit flag fired so the decision is traceable in
    the record's ``audit_signals``. Returns ``None`` for non-audit references.
    """
    if is_audit_reference(reference):
        return f"reference '{(reference or '').strip()}' carries the 'A.' audit-case prefix"
    return None

"""Unit tests for the engine's content-based AUDIT-case detector.

``detect_audit_signals`` is pure (no readers / PyMuPDF), so it runs in the lean
suite without the heavy deps. It guards the high-precision marker set grounded in
real PCH audit instructions (see collisionspike ADR-0014): a genuine audit
instruction fires and lists the phrases that fired; a NORMAL instruction does NOT
(a false positive would mis-mark a standard case as an audit and corrupt its
Case/PO numbering).
"""

from __future__ import annotations

from cedocumentmapper_v2.rules.engine import detect_audit_signals


def test_genuine_audit_instruction_is_detected_with_signals():
    # Phrasing mirrors the real PCH audit instructions in the fixture catalog.
    # (A.PCH261269 / A.PCH261272): "Engineers 2", "audit report", "original engineer".
    text = (
        "Enclosing Inspection Request to Engineers 2 (Collision Engineers Ltd).\n"
        "An audit report is needed. Please review the original engineer's findings."
    )
    is_audit, signals = detect_audit_signals(text)
    assert is_audit is True
    assert "audit report" in signals
    assert "engineers 2" in signals
    assert "original engineer" in signals


def test_normal_instruction_is_not_audit():
    text = (
        "New Inspection Instruction. Please inspect vehicle AB12 CDE following an "
        "accident and provide your engineer's assessment and a valuation."
    )
    is_audit, signals = detect_audit_signals(text)
    assert is_audit is False
    assert signals == ()


def test_empty_or_none_text_is_not_audit():
    assert detect_audit_signals("") == (False, ())
    assert detect_audit_signals(None) == (False, ())  # type: ignore[arg-type]


def test_detection_is_case_insensitive():
    is_audit, signals = detect_audit_signals("AUDIT REPORT REQUIRED FOR THIS VEHICLE")
    assert is_audit is True
    assert "audit report" in signals


def test_bare_word_audit_does_not_trigger():
    # High-precision: an incidental "audit trail" / "audited accounts" must NOT
    # flip a standard case to audit. Only the anchored phrases count.
    is_audit, signals = detect_audit_signals(
        "Our audit trail shows the claim was audited internally last year."
    )
    assert is_audit is False
    assert signals == ()

"""Direct unit tests for detection/attachment_typing.py's type_document_text().

PLAN-014 D5 backtest finding: the real corpus surfaced a genuine false positive — a
QDOS "dual" commissioning letter (heading "ENGINEER NOTIFICATION (REPORT + AUDIT
REPORT)") was typed `report` outright because "audit report" is a standalone report
title phrase, when the letter is actually an INSTRUCTION commissioning both a report
and an audit. These tests pin the fix (a dual-commissioning phrase demotes a title hit
to needing the same corroboration Rule 1b already requires) and guard the ordinary,
unaffected case.
"""

from cedocumentmapper_v2.detection.attachment_typing import type_document_text

_CNX_CATALOG = [
    {
        "id": "cnx",
        "name": "CNX (Engineers)",
        "detect_phrases": ["Connexus Vehicle Assessors"],
        "engineer_report": True,
    }
]


def test_dual_commissioning_title_phrase_alone_does_not_promote_to_report():
    """The exact real-corpus shape: a heading containing 'audit report' riding on a
    dual-commissioning phrase, no engineer_report provider, no structure corroboration —
    must NOT type as report (it is an instruction commissioning one)."""
    text = (
        "ENGINEER NOTIFICATION (REPORT + AUDIT REPORT)\n"
        "Dear Sirs, please inspect the vehicle and prepare the requested report."
    )
    result = type_document_text(text, [])
    assert result["doc_type"] != "report"


def test_dual_commissioning_with_engineer_report_corroboration_still_promotes_to_report():
    """The same dual-commissioning phrase, but this time the text IS corroborated by a
    detected engineer_report provider plus genuine report-structure wording — this is a
    real report, and should still type as one (Rule 1b's existing corroboration path)."""
    text = (
        "ENGINEER NOTIFICATION (REPORT + AUDIT REPORT)\n"
        "Connexus Vehicle Assessors\n"
        "Findings and opinion: the vehicle sustained significant impact damage."
    )
    result = type_document_text(text, _CNX_CATALOG)
    assert result["doc_type"] == "report"


def test_ordinary_report_title_without_dual_commissioning_still_stands_alone():
    """Regression guard: a plain report title with no dual-commissioning phrase present
    must still promote to report on its own, unaffected by the fix above."""
    text = "Engineer's Report\nVehicle inspected on site; damage assessed as follows."
    result = type_document_text(text, [])
    assert result["doc_type"] == "report"
    assert any(m.startswith("report_title:") for m in result["markers"])


def test_junk_verdict_still_fires_on_junk_markers():
    """Regression guard: the junk bucket is untouched by this change."""
    text = "Unsubscribe from our newsletter. View this email in your browser. Click here to opt out."
    result = type_document_text(text, [])
    assert result["doc_type"] in {"junk", "unknown"}  # depends on the live junk-phrase list; not report/instruction
    assert result["doc_type"] != "report"

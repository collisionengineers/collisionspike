"""Offline tests for the pure CE-report classifier (TKT-095 detector (b)).

[BUILD] — pure functions, zero network. The discriminator (see
report_classifier.py): PDF AND (Case/PO in filename, space/punct-tolerant,
OR a whole 'report'/'assessment' token).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))

from report_classifier import (  # noqa: E402
    filename_has_report_token,
    filename_mentions_case_po,
    is_ce_report,
    is_pdf,
)


# ==========================================================================
# is_pdf
# ==========================================================================

def test_is_pdf_by_extension_case_insensitive():
    assert is_pdf("CCPY26050 Report.pdf") is True
    assert is_pdf("REPORT.PDF") is True
    assert is_pdf("report.pdf ") is True  # trailing space tolerated


def test_is_pdf_rejects_non_pdf():
    assert is_pdf("IMG_1.jpg") is False
    assert is_pdf("report.docx") is False
    assert is_pdf("") is False
    assert is_pdf(None) is False


def test_is_pdf_content_type_wins_when_supplied():
    assert is_pdf("download", content_type="application/pdf") is True
    assert is_pdf("report.pdf", content_type="image/jpeg") is False


# ==========================================================================
# filename_mentions_case_po (space/punct-tolerant containment)
# ==========================================================================

@pytest.mark.parametrize(
    "filename",
    [
        "CCPY26050 Report.pdf",
        "ccpy26050-final.pdf",
        "CCPY 26050.pdf",
        "CE_CCPY-26050_v2.pdf",
    ],
)
def test_case_po_matches_tolerantly(filename):
    assert filename_mentions_case_po(filename, "CCPY26050") is True


def test_case_po_marker_dot_form_matches():
    # Audit-marker Case/PO forms normalise the dot away on both sides.
    assert filename_mentions_case_po("A.PCH261269 report.pdf", "A.PCH261269") is True


def test_case_po_no_match_or_empty_po():
    assert filename_mentions_case_po("invoice_scan.pdf", "CCPY26050") is False
    assert filename_mentions_case_po("CCPY26050.pdf", "") is False
    assert filename_mentions_case_po("CCPY26050.pdf", None) is False
    assert filename_mentions_case_po(None, "CCPY26050") is False


# ==========================================================================
# filename_has_report_token (whole tokens, not substrings)
# ==========================================================================

@pytest.mark.parametrize(
    "filename",
    [
        "Engineer Report.pdf",
        "CE-Report-v2.pdf",
        "final_REPORT.pdf",
        "vehicle assessment.pdf",
        "Assessment-2026.pdf",
    ],
)
def test_report_token_hits(filename):
    assert filename_has_report_token(filename) is True


@pytest.mark.parametrize(
    "filename",
    [
        "reportage.pdf",       # substring, not a token
        "assessments-guide.pdf",  # plural token deliberately not matched
        "photo_1.pdf",
        "",
        None,
    ],
)
def test_report_token_misses(filename):
    assert filename_has_report_token(filename) is False


# ==========================================================================
# is_ce_report (the composed discriminator)
# ==========================================================================

def test_report_requires_pdf():
    assert is_ce_report("CCPY26050 Report.jpg", "CCPY26050") is False
    assert is_ce_report("CCPY26050 Report.pdf", "CCPY26050") is True


def test_report_by_case_po_only():
    assert is_ce_report("ccpy 26050 final.pdf", "CCPY26050") is True


def test_report_by_token_when_case_po_unknown():
    # Schema-tolerant path: an older API returns no casePo -> the token arm still works.
    assert is_ce_report("Engineer Report.pdf", None) is True


def test_not_report_when_neither_signal():
    assert is_ce_report("invoice_scan.pdf", "CCPY26050") is False
    assert is_ce_report("invoice_scan.pdf", None) is False

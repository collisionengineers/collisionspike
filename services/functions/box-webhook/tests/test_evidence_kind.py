"""TKT-133 — the pure evidence-kind classifier (extension PRIMARY, MIME fallback).

Table-driven parity check against the api's shared domain mapping
(packages/domain/src/domain/classification.ts classifyAttachment + the TKT-124
re-kind delta 2026-07-09-tkt124-rekind-box-evidence.sql). Pure — no I/O.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))

from evidence_kind import classify_evidence_kind, extension_of  # noqa: E402


@pytest.mark.parametrize(
    ("filename", "content_type", "expected"),
    [
        # --- extension table (primary signal) --------------------------------
        ("IMG_1.jpg", None, "image"),
        ("photo.JPEG", None, "image"),
        ("scan.png", None, "image"),
        ("instructions.pdf", None, "instruction"),
        ("brief.docx", None, "instruction"),
        ("brief.doc", None, "instruction"),
        ("message.eml", None, "email"),
        ("dashcam.mp4", None, "other"),
        ("archive.zip", None, "other"),
        # --- extension WINS over a contradicting MIME ------------------------
        ("instructions.pdf", "image/jpeg", "instruction"),
        ("IMG_1.jpg", "application/pdf", "image"),
        ("message.eml", "image/png", "email"),
        # --- MIME fallback (unknown/absent extension) -------------------------
        ("scan.heic", "image/heic", "image"),  # image/* wildcard (SQL-delta parity)
        ("upload", "image/jpeg", "image"),
        ("upload", "application/pdf", "instruction"),
        ("upload", "application/msword", "instruction"),
        (
            "upload",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "instruction",
        ),
        ("upload", "message/rfc822", "email"),
        ("upload", "application/octet-stream", "other"),
        ("upload", None, "other"),
        ("upload", "", "other"),
        # MIME parameters are stripped before the lookup.
        ("upload", "message/rfc822; charset=utf-8", "email"),
        ("upload", "IMAGE/PNG", "image"),
        # Dotfiles / trailing dots have no extension -> MIME resolves.
        (".hidden", "application/pdf", "instruction"),
        ("trailingdot.", "image/png", "image"),
    ],
)
def test_classify_table(filename, content_type, expected):
    assert classify_evidence_kind(filename, content_type) == expected


def test_extension_of_shapes():
    assert extension_of("IMG_1.JPG") == "jpg"
    assert extension_of("a.b.c.PDF") == "pdf"
    assert extension_of("noext") == ""
    assert extension_of(".dotfile") == ""
    assert extension_of("trailing.") == ""
    assert extension_of("  padded.eml  ") == "eml"


def test_engineer_report_never_produced_here():
    # The TKT-095 override is the receiver's; the pure table can never emit it.
    for name in ("CCPY26050 Report.pdf", "report.pdf", "assessment.docx"):
        assert classify_evidence_kind(name) == "instruction"

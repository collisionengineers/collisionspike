"""Offline unit tests for claimant telephone / email extraction.

These exercise the REAL engine logic (no monkeypatch): the normalizers and the
``RuleEngine`` fallback rules that derive ``claimant_telephone`` /
``claimant_email`` from document text near claimant/insured context, with
provenance, leaving them empty when absent. ``DocumentModel`` is built directly
in-memory, so PyMuPDF / Tesseract are NOT required.

Run from services/functions/parser/:
    python -m pytest tests/test_contact_extraction.py
"""

from __future__ import annotations

from pathlib import Path

import pytest

from cedocumentmapper_v2.domain.models import (
    DocumentModel,
    DocumentPage,
    DocumentLine,
    FieldKey,
    FIELD_ORDER,
)
from cedocumentmapper_v2.normalization import normalize_telephone, normalize_email
from cedocumentmapper_v2.rules.engine import RuleEngine


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #
def _doc(*text_lines: str) -> DocumentModel:
    lines = tuple(
        DocumentLine(text=t, page_index=0, line_index=i) for i, t in enumerate(text_lines)
    )
    return DocumentModel(
        source_path=Path("synthetic.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=lines),),
        plain_text="\n".join(text_lines),
    )


_PROVIDER = {"id": "demo", "name": "Demo Provider", "work_provider": "Demo Provider", "field_rules": {}}


def _extract(*text_lines: str):
    return RuleEngine().extract_record(_doc(*text_lines), _PROVIDER).fields


# --------------------------------------------------------------------------- #
# Normalizers — UK telephone                                                   #
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "raw, expected",
    [
        ("07700 900123", "07700900123"),          # mobile, spaces
        ("Mob: 07911 123456", "07911123456"),      # labelled mobile
        ("(01632) 960123", "01632960123"),         # landline w/ area parens
        ("0161-496-0142", "01614960142"),          # hyphen separators
        ("020 7946 0958", "02079460958"),          # London landline
        ("+44 7700 900123", "+447700900123"),      # international +44
        ("+44 (0)20 7946 0958", "+442079460958"),  # +44 (0) trunk form
        ("0044 7700 900999", "+447700900999"),     # 0044 international
        ("not a number 12", ""),                    # noise -> empty
        ("our ref ABC/123/456", ""),                # reference, not a phone
        ("01/02/2026", ""),                         # a date, not a phone
        ("", ""),                                    # empty -> empty
    ],
)
def test_normalize_telephone(raw, expected):
    assert normalize_telephone(raw) == expected


# --------------------------------------------------------------------------- #
# Normalizers — email                                                          #
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "raw, expected",
    [
        ("jane.doe@example.co.uk", "jane.doe@example.co.uk"),
        ("Email: J.SMITH@Example.COM.", "j.smith@example.com"),     # trailing period stripped + lowered
        ("contact (a.b+tag@sub.example.org)", "a.b+tag@sub.example.org"),
        ("no email here", ""),
        ("foo@bar", ""),                                             # no TLD -> empty
        ("", ""),
    ],
)
def test_normalize_email(raw, expected):
    assert normalize_email(raw) == expected


# --------------------------------------------------------------------------- #
# Engine — fields are always emitted (contract membership)                     #
# --------------------------------------------------------------------------- #
def test_engine_emits_the_two_native_contact_keys():
    fields = _extract("Claimant: Mr John Sample", "Tel: 07700 900123")
    # Both native parser keys exist on every record (so the adapter maps them).
    assert FieldKey.CLAIMANT_TELEPHONE in fields
    assert FieldKey.CLAIMANT_EMAIL in fields
    # And they are part of the canonical native field order.
    assert FieldKey.CLAIMANT_TELEPHONE in FIELD_ORDER
    assert FieldKey.CLAIMANT_EMAIL in FIELD_ORDER


# --------------------------------------------------------------------------- #
# Engine — derivation from claimant context, with provenance                   #
# --------------------------------------------------------------------------- #
def test_claimant_label_telephone_and_email_are_extracted():
    fields = _extract(
        "Re: Our Client Mr John Sample",
        "Claimant Telephone: 07700 900123",
        "Claimant Email: John.Sample@example.co.uk",
    )
    tel = fields[FieldKey.CLAIMANT_TELEPHONE]
    em = fields[FieldKey.CLAIMANT_EMAIL]
    assert tel.value == "07700900123"
    assert tel.rule_id == "fallback_telephone_claimant_label"
    assert tel.confidence and tel.confidence >= 0.8
    assert em.value == "john.sample@example.co.uk"
    assert em.rule_id == "fallback_email_claimant_label"


def test_context_scan_prefers_claimant_over_solicitor_signature():
    """The claimant's own number/email (near 'Claimant'/'Our client') is chosen
    over the instructing solicitor's switchboard/firm email in the sign-off."""
    fields = _extract(
        "Our client: Mr John Sample",
        "Tel 07700 900123",
        "john.sample@example.co.uk",
        "Vehicle Registration: AB12 CDE",
        "",
        "Yours faithfully,",
        "Big Solicitors LLP",
        "Switchboard: 020 7946 0958",
        "enquiries@bigsolicitors.com",
    )
    assert fields[FieldKey.CLAIMANT_TELEPHONE].value == "07700900123"
    assert fields[FieldKey.CLAIMANT_EMAIL].value == "john.sample@example.co.uk"
    # Definitely NOT the firm's details.
    assert fields[FieldKey.CLAIMANT_TELEPHONE].value != "02079460958"
    assert fields[FieldKey.CLAIMANT_EMAIL].value != "enquiries@bigsolicitors.com"


def test_sole_occurrence_is_used_when_no_explicit_context():
    """With no claimant label/context but exactly one phone + one email in the
    document, the unambiguous value is used (low confidence, provenanced)."""
    fields = _extract(
        "Instruction to inspect vehicle AB12 CDE.",
        "Please call 07700 900123 to arrange.",
        "Reports to reports@example.org",
    )
    tel = fields[FieldKey.CLAIMANT_TELEPHONE]
    em = fields[FieldKey.CLAIMANT_EMAIL]
    assert tel.value == "07700900123"
    assert tel.rule_id == "fallback_telephone_sole"
    assert em.value == "reports@example.org"
    assert em.rule_id == "fallback_email_sole"


def test_absent_contact_leaves_fields_empty_for_staff():
    """No phone/email in the text -> both fields empty (NEVER invented)."""
    fields = _extract(
        "Re: Our Client Mr John Sample",
        "Vehicle Registration: AB12 CDE",
        "Date of accident: 01/02/2026",
        "Please provide a report.",
    )
    assert fields[FieldKey.CLAIMANT_TELEPHONE].value == ""
    assert fields[FieldKey.CLAIMANT_EMAIL].value == ""


def test_ambiguous_multiple_numbers_without_context_stay_empty():
    """Two different phone numbers and no claimant context -> not guessed."""
    fields = _extract(
        "General enquiries 020 7946 0958 or 0161 496 0142.",
        "Vehicle Registration: AB12 CDE",
    )
    assert fields[FieldKey.CLAIMANT_TELEPHONE].value == ""


def test_ax_credit_repair_team_inbox_is_not_claimant_email():
    """AX instruction PDFs carry a provider team inbox — blank beats wrong."""
    fields = _extract(
        "AX Reference",
        ": 1074398",
        "Verbal authority to be provided on the day of inspection. If this",
        "cannot be done for any reason, please contact the Credit Repair",
        "team on 01675 432266 or by email on",
        "CreditRepair_TeamInbox@ax-uk.com",
        "Name: Mr Sample Claimant",
        "VRM: AB12 CDE",
    )
    assert fields[FieldKey.CLAIMANT_EMAIL].value == ""

"""Tests for content-based attachment typing (rules-engine-v2 Phase 3).

``cedocumentmapper_v2.detection.attachment_typing.type_document_text`` is a PURE
function -- phrase/provider matching only, no I/O -- so this suite is plain
table-driven unit tests, mirroring the style of ``test_email_classifier.py``.

Coverage:
  * A recognised provider's ``detect_phrases`` alone types 'instruction'.
  * Strong instruction wording (``_WORK_KEYWORDS``) alone types 'instruction',
    even with no recognised provider.
  * A report-title phrase alone types 'report', with no provider required.
  * An ``engineer_report`` provider (CNX/EVA-shaped) PLUS report-structure
    wording types 'report' -- the corroboration-gate pairing.
  * The corroboration gate itself: structure wording alone (no engineer_report
    provider) does NOT promote to 'report'.
  * An engineer_report provider's own detect_phrase, with NO report markers at
    all, still types 'instruction' (a covering letter FROM that provider is
    not automatically the report itself).
  * A marketing/unsubscribe flyer types 'junk'.
  * Empty and garbage text both abstain to 'unknown'.
  * ``catalog`` accepts either the full ``load_provider_catalog()`` dict shape
    or a bare provider list.
"""

from __future__ import annotations

import pytest

from cedocumentmapper_v2.detection.attachment_typing import (
    DOC_TYPE_INSTRUCTION,
    DOC_TYPE_JUNK,
    DOC_TYPE_REPORT,
    DOC_TYPE_UNKNOWN,
    type_document_text,
)

# A tiny, realistic two-provider catalog in the v2 shape
# ``load_provider_catalog()`` returns -- one ordinary instruction provider
# (mirrors the real ALISON entry in the sibling's root providers.json) and one
# ``engineer_report`` provider (mirrors the real CNX (Engineers) entry).
_CATALOG: dict[str, object] = {
    "schema_version": 2,
    "providers": [
        {
            "id": "alison",
            "name": "ALISON",
            "enabled": True,
            "priority": 0,
            "detect": {
                "required_phrases": ["ALISON LAW SOLICITORS"],
                "optional_phrases": [],
                "negative_phrases": [],
                "minimum_confidence": 0.75,
            },
            "engineer_report": False,
        },
        {
            "id": "cnx_engineers",
            "name": "CNX (Engineers)",
            "enabled": True,
            "priority": 0,
            "detect": {
                "required_phrases": ["Connexus Vehicle Assessors"],
                "optional_phrases": [],
                "negative_phrases": [],
                "minimum_confidence": 0.75,
            },
            "engineer_report": True,
        },
    ],
}


@pytest.mark.parametrize(
    "name,text,expected_doc_type,expected_provider_name",
    [
        (
            "provider_detect_phrase_alone_is_instruction",
            "ALISON LAW SOLICITORS\n\n"
            "We write further to our instructions. Please could you confirm receipt.",
            DOC_TYPE_INSTRUCTION,
            "ALISON",
        ),
        (
            "strong_work_wording_alone_is_instruction_no_provider",
            "We instruct you to inspect the vehicle and prepare a report for our client.",
            DOC_TYPE_INSTRUCTION,
            None,
        ),
        (
            "report_title_phrase_alone_is_report_no_provider",
            "ENGINEER'S REPORT\n\n"
            "Instructed by: XYZ Solicitors\nVehicle: Ford Focus\n\n"
            "I attended and inspected the vehicle on 12 June 2026.",
            DOC_TYPE_REPORT,
            None,
        ),
        (
            "engineer_report_provider_plus_structure_wording_is_report",
            "Connexus Vehicle Assessors\n\n"
            "Findings and opinion: the vehicle sustained rear bumper damage "
            "consistent with the reported incident.",
            DOC_TYPE_REPORT,
            "CNX (Engineers)",
        ),
        (
            "structure_wording_alone_without_engineer_report_provider_stays_unknown",
            "Findings and opinion: the vehicle sustained rear bumper damage "
            "consistent with the reported incident.",
            DOC_TYPE_UNKNOWN,
            None,
        ),
        (
            "engineer_report_provider_without_report_markers_is_instruction",
            "Connexus Vehicle Assessors have been instructed to inspect the "
            "above vehicle. Please find our earlier correspondence attached "
            "for reference.",
            DOC_TYPE_INSTRUCTION,
            "CNX (Engineers)",
        ),
        (
            "unsubscribe_flyer_is_junk",
            "You've won a free vehicle health check! Book now.\n\n"
            "Unsubscribe from these emails at any time by clicking here.",
            DOC_TYPE_JUNK,
            None,
        ),
        (
            "empty_text_is_unknown",
            "",
            DOC_TYPE_UNKNOWN,
            None,
        ),
        (
            "garbage_text_is_unknown",
            "asdkjhasdkjh 12321 !!! zzz qqqqq",
            DOC_TYPE_UNKNOWN,
            None,
        ),
    ],
)
def test_type_document_text_table(name, text, expected_doc_type, expected_provider_name):
    result = type_document_text(text, _CATALOG)
    assert result["doc_type"] == expected_doc_type, name
    assert result["provider_name"] == expected_provider_name, name
    if expected_doc_type == DOC_TYPE_UNKNOWN:
        assert result["markers"] == [], name
    else:
        assert result["markers"], name  # every non-unknown call explains itself


def test_markers_explain_the_instruction_provider_hit():
    result = type_document_text(
        "ALISON LAW SOLICITORS\n\nWe write further to our instructions.", _CATALOG
    )
    assert result["doc_type"] == DOC_TYPE_INSTRUCTION
    assert "provider_detect_phrase:ALISON" in result["markers"]


def test_markers_explain_the_report_title_hit():
    result = type_document_text("ENGINEER'S REPORT\n\nI attended the vehicle.", _CATALOG)
    assert result["doc_type"] == DOC_TYPE_REPORT
    assert any(marker.startswith("report_title:") for marker in result["markers"])


def test_markers_explain_the_junk_hit():
    result = type_document_text("Unsubscribe from this newsletter at any time.", _CATALOG)
    assert result["doc_type"] == DOC_TYPE_JUNK
    assert any(marker.startswith("junk_marker:") for marker in result["markers"])


def test_accepts_bare_provider_list_in_place_of_full_catalog_dict():
    text = "ALISON LAW SOLICITORS\n\nWe write further to our instructions."
    by_dict = type_document_text(text, _CATALOG)
    by_list = type_document_text(text, _CATALOG["providers"])
    assert by_dict == by_list


def test_missing_catalog_providers_key_is_treated_as_empty():
    result = type_document_text("Nothing relevant here.", {})
    assert result == {"doc_type": DOC_TYPE_UNKNOWN, "provider_name": None, "markers": []}


def test_disabled_provider_is_not_detected():
    catalog = {
        "providers": [
            {
                "id": "alison",
                "name": "ALISON",
                "enabled": False,
                "detect": {"required_phrases": ["ALISON LAW SOLICITORS"]},
                "engineer_report": False,
            }
        ]
    }
    result = type_document_text("ALISON LAW SOLICITORS instructions attached.", catalog)
    # No provider detected (disabled), but "instructions attached" is a
    # _WORK_KEYWORDS phrase, so this still promotes to instruction -- with no
    # provider name attributed.
    assert result["doc_type"] == DOC_TYPE_INSTRUCTION
    assert result["provider_name"] is None

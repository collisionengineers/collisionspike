"""Claimant-name precision and recall regressions for collisionspike TKT-150."""

import json
from pathlib import Path

import pytest

from cedocumentmapper_v2.domain.models import (
    DocumentLine,
    DocumentModel,
    DocumentPage,
    FieldKey,
)
from cedocumentmapper_v2.readers import get_reader_for_path
from cedocumentmapper_v2.rules import RuleEngine


FIXTURES = Path(__file__).parent / "fixtures"


def _email_doc(*text_lines: str) -> DocumentModel:
    lines = tuple(
        DocumentLine(text=text, page_index=0, line_index=index)
        for index, text in enumerate(text_lines)
    )
    return DocumentModel(
        source_path=Path("synthetic.eml"),
        source_type="eml",
        pages=(DocumentPage(page_index=0, lines=lines),),
        plain_text="\n".join(text_lines),
    )


_UNKNOWN_PROVIDER = {
    "id": "unknown_temp",
    "name": "New Provider (Auto-Detected)",
    "work_provider": "UNKNOWN",
    "field_rules": {},
}


def _claimant(*text_lines: str):
    record = RuleEngine().extract_record(_email_doc(*text_lines), _UNKNOWN_PROVIDER)
    return record.fields[FieldKey.CLAIMANT_NAME]


@pytest.mark.parametrize(
    "golden_name",
    ["CLAIMANT_PROSE_01.expected.json", "EMAIL_SIGNATURE_ONLY_01.expected.json"],
)
def test_non_pii_email_fixture(golden_name: str):
    golden = json.loads((FIXTURES / "expected" / golden_name).read_text(encoding="utf-8"))
    source = FIXTURES / "instructions" / golden["source_file"]
    document = get_reader_for_path(source).read(source)
    record = RuleEngine().extract_record(document, _UNKNOWN_PROVIDER)

    for field_name, expected in golden["expected_values"].items():
        assert record.fields[FieldKey(field_name)].value == expected


def test_ordinary_our_client_prose_recovers_claimant_before_signature():
    extracted = _claimant(
        "Please assess the vehicle belonging to our client, Ms Jane Example.",
        "Vehicle Registration: AB12 CDE",
        "Kind regards,",
        "Alex Handler",
        "Name: Alex Handler",
    )

    assert extracted.value == "Ms Jane Example"
    assert extracted.rule_id == "fallback_claimant_prose"


def test_explicit_claimant_label_outranks_earlier_prose_candidate():
    extracted = _claimant(
        "Please contact our client, Ms Preliminary Example, about access.",
        "Claimant Name: Dr Evelyn Confirmed",
        "Kind regards,",
        "Alex Handler",
    )

    assert extracted.value == "Dr Evelyn Confirmed"
    assert extracted.rule_id == "fallback_claimant_label"


def test_signature_name_is_not_used_when_claimant_is_absent():
    extracted = _claimant(
        "Vehicle Registration: CD34 EFG",
        "Please assess the vehicle and provide a report.",
        "Kind regards,",
        "Alex Handler",
        "Senior Case Handler",
        "Name: Alex Handler",
    )

    assert extracted.value == ""


def test_configured_name_rule_cannot_take_value_from_email_signature():
    provider_with_weak_name_rule = {
        **_UNKNOWN_PROVIDER,
        "field_rules": {
            "claimant_name": {
                "id": "weak_name_rule",
                "kind": "label_same_line",
                "labels": ["Name"],
            }
        },
    }
    record = RuleEngine().extract_record(
        _email_doc(
            "Vehicle Registration: EF56 GHI",
            "Kind regards,",
            "Alex Handler",
            "Name: Alex Handler",
        ),
        provider_with_weak_name_rule,
    )

    assert record.fields[FieldKey.CLAIMANT_NAME].value == ""


def test_third_party_and_repairer_names_are_not_claimant_fallbacks():
    extracted = _claimant(
        "Third Party: Mr Trevor Example",
        "Repairer: Pat Workshop",
        "Your Insured: Ms Irene Example",
        "Vehicle Registration: GH67 JKL",
    )

    assert extracted.value == ""

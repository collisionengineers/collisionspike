"""Claimant-name precision and recall regressions for collisionspike TKT-150."""

import json
import sys
from pathlib import Path

import pytest

from cedocumentmapper_v2.config import migrate_providers_config
from cedocumentmapper_v2.domain.models import (
    DocumentLine,
    DocumentModel,
    DocumentPage,
    FieldKey,
)
from cedocumentmapper_v2.readers import get_reader_for_path
from cedocumentmapper_v2.rules import RuleEngine


FIXTURES = Path(__file__).parent / "fixtures"
REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPOSITORY_ROOT / "tests" / "fixtures" / "resolvers"))
from evidence_resolver import resolve_evidence  # noqa: E402

INSTRUCTION_LOGICAL_ROOT = "services/functions/parser/tests/fixtures/instructions"
# The sibling test reads its repository-root providers.json. This wrapper runs
# against the deployed, immutably pinned seed inside the vendored package.
PROVIDERS_JSON = Path(__file__).resolve().parents[1] / "cedocumentmapper_v2" / "providers.json"


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


def _provider(provider_id: str) -> dict:
    catalog = migrate_providers_config(
        json.loads(PROVIDERS_JSON.read_text(encoding="utf-8"))
    )
    return next(provider for provider in catalog["providers"] if provider["id"] == provider_id)


@pytest.mark.parametrize(
    "golden_name",
    [
        "CLAIMANT_PROSE_01.expected.json",
        "CLAIMANT_THREADED_01.expected.json",
        "CLAIMANT_LABEL_PROSE_01.expected.json",
        "CLAIMANT_LABEL_INTERVENING_01.expected.json",
        "CLAIMANT_SINGLE_SURNAME_01.expected.json",
        "CLAIMANT_PLACEHOLDER_SIGNATURE_01.expected.json",
        "EMAIL_SIGNATURE_ONLY_01.expected.json",
        "CLAIMANT_SIGNATURE_ONLY_DOC_01.expected.json",
    ],
)
def test_non_pii_claimant_fixture(golden_name: str):
    golden = json.loads((FIXTURES / "expected" / golden_name).read_text(encoding="utf-8"))
    source = resolve_evidence(
        original_path=f"{INSTRUCTION_LOGICAL_ROOT}/{golden['source_file']}"
    )
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


@pytest.mark.parametrize(
    ("lines", "expected"),
    [
        (("Our client: Mr John Sample requires an inspection.",), "Mr John Sample"),
        (
            (
                "Claimant Name:",
                "Ms Jane Sample requires collection from her home address.",
            ),
            "Ms Jane Sample",
        ),
    ],
)
def test_explicit_claimant_label_truncates_trailing_instruction_prose(
    lines: tuple[str, ...], expected: str
):
    extracted = _claimant(*lines, "Vehicle Registration: AB12 CDE")

    assert extracted.value == expected
    assert extracted.rule_id == "fallback_claimant_label"


def test_explicit_claimant_label_rejects_next_line_instruction_without_a_name():
    extracted = _claimant(
        "Claimant Name:",
        "Please contact the repairer to arrange access.",
        "Vehicle Registration: AB12 CDE",
    )

    assert extracted.value == ""


def test_empty_claimant_label_does_not_skip_intervening_prose_for_a_later_name():
    extracted = _claimant(
        "Claimant Name:",
        "Please arrange access.",
        "Alex Smith",
        "Vehicle Registration: AB12 CDE",
    )

    assert extracted.value == ""


@pytest.mark.parametrize(
    "lines",
    [
        ("Claimant Name: O'Brien",),
        ("Claimant Name:", "O'Brien"),
    ],
)
def test_explicit_claimant_label_accepts_a_single_surname(lines: tuple[str, ...]):
    extracted = _claimant(*lines, "Vehicle Registration: AB12 CDE")

    assert extracted.value == "O'Brien"
    assert extracted.rule_id == "fallback_claimant_label"


@pytest.mark.parametrize(
    "placeholder",
    [
        "TBC",
        "TBA",
        "N/A",
        "N.A.",
        "None",
        "Unknown",
        "Not known",
        "Not provided",
        "Not available",
        "To be confirmed",
        "To be advised",
        "-",
    ],
)
@pytest.mark.parametrize("next_line", [False, True])
def test_explicit_claimant_label_rejects_placeholders(
    placeholder: str,
    next_line: bool,
):
    lines = (
        ("Claimant Name:", placeholder)
        if next_line
        else (f"Claimant Name: {placeholder}",)
    )

    extracted = _claimant(*lines, "Vehicle Registration: AB12 CDE")

    assert extracted.value == ""


@pytest.mark.parametrize("placeholder", ["TBC", "TBA", "N/A", "None", "Unknown"])
def test_placeholder_label_does_not_block_defensible_claimant_prose(placeholder: str):
    extracted = _claimant(
        f"Claimant Name: {placeholder}",
        "Please arrange access with our client, Ms Jane Example.",
        "Vehicle Registration: AB12 CDE",
    )

    assert extracted.value == "Ms Jane Example"
    assert extracted.rule_id == "fallback_claimant_prose"


@pytest.mark.parametrize("placeholder", ["TBC", "TBA", "N/A", "None", "Unknown"])
def test_configured_claimant_rule_rejects_placeholders(placeholder: str):
    provider_with_claimant_rule = {
        **_UNKNOWN_PROVIDER,
        "field_rules": {
            "claimant_name": {
                "id": "claimant_name_rule",
                "kind": "label_same_line",
                "labels": ["Claimant Name"],
            }
        },
    }
    record = RuleEngine().extract_record(
        _email_doc(
            f"Claimant Name: {placeholder}",
            "Vehicle Registration: AB12 CDE",
        ),
        provider_with_claimant_rule,
    )

    assert record.fields[FieldKey.CLAIMANT_NAME].value == ""


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


def test_opening_pleasantry_is_not_mistaken_for_a_signature_boundary():
    extracted = _claimant(
        "Many thanks for the instruction, our client is Mr John Sample.",
        "Vehicle Registration: JK78 LMN",
    )

    assert extracted.value == "Mr John Sample"
    assert extracted.rule_id == "fallback_claimant_prose"


def test_threaded_original_claimant_survives_the_sender_signature_block():
    extracted = _claimant(
        "Please see the original instruction below.",
        "Kind regards,",
        "Alex Handler",
        "Claims Team",
        "-----Original Message-----",
        "From: original.sender@provider.example",
        "Claimant Name: Ms Jane Original",
        "Vehicle Registration: LM89 NOP",
    )

    assert extracted.value == "Ms Jane Original"
    assert extracted.rule_id == "fallback_claimant_label"


def test_configured_claimant_rule_survives_a_thread_boundary_after_signature():
    configured_provider = {
        **_UNKNOWN_PROVIDER,
        "field_rules": {
            "claimant_name": {
                "id": "claimant_name_rule",
                "kind": "label_same_line",
                "labels": ["Claimant Name"],
            }
        },
    }
    record = RuleEngine().extract_record(
        _email_doc(
            "Kind regards,",
            "Alex Handler",
            "------------------------------",
            "Claimant Name: Dr Evelyn Original",
        ),
        configured_provider,
    )

    assert record.fields[FieldKey.CLAIMANT_NAME].value == "Dr Evelyn Original"


@pytest.mark.parametrize(
    "line,expected",
    [
        ("We act for the claimant, Mr John Sample.", "Mr John Sample"),
        ("On behalf of our client Ms Jane Sample.", "Ms Jane Sample"),
        ("We represent the client named Dr Evelyn Confirmed.", "Dr Evelyn Confirmed"),
    ],
)
def test_prose_intermediary_words_are_not_captured_as_the_name(line: str, expected: str):
    extracted = _claimant(line, "Vehicle Registration: MN90 PQR")

    assert extracted.value == expected
    assert extracted.rule_id == "fallback_claimant_prose"


@pytest.mark.parametrize(
    "line",
    [
        "We write on behalf of Acme Insurance Ltd regarding the vehicle.",
        "We write on behalf of Acme International Risk Management Insurance Ltd.",
        "We act for Example Legal Services in this matter.",
        "On behalf of Northside Claims LLP, please inspect the vehicle.",
        "We write on behalf of Northside Motor Solutions regarding the vehicle.",
        "On behalf of Northside Automotive Partners, please inspect the vehicle.",
        "We represent Alpha Beta Consulting regarding the vehicle.",
        "We act for Northside Motor Solutions regarding the vehicle.",
        "We act for Jane Sample regarding the vehicle.",
    ],
)
def test_bare_representation_prose_does_not_establish_a_claimant(line: str):
    assert _claimant(line, "Vehicle Registration: MN90 PQR").value == ""


def test_person_before_an_organisation_separator_remains_a_claimant():
    extracted = _claimant(
        "We act for our client Ms Jane Lloyd of Acme Insurance Ltd.",
        "Vehicle Registration: MN90 PQR",
    )

    assert extracted.value == "Ms Jane Lloyd"
    assert extracted.rule_id == "fallback_claimant_prose"


@pytest.mark.parametrize(
    "line",
    [
        "Our Insured: Ms Irene Example",
        "Policyholder Name: Mr Peter Example",
    ],
)
def test_generic_fallback_does_not_conflate_insured_or_policyholder_with_claimant(line: str):
    """Insured/policyholder is a separate overview fact without provider context."""
    assert _claimant(line, "Vehicle Registration: NP01 QRS").value == ""


@pytest.mark.parametrize(
    "provider_id,lines,expected",
    [
        ("fw_garage", ("Our Insured: Name:", "Ms Isla Example"), "Ms Isla Example"),
        ("pch_performance", ("Policyholder Name: Mr Peter Example",), "Mr Peter Example"),
    ],
)
def test_provider_specific_alias_rule_remains_authoritative(
    provider_id: str,
    lines: tuple[str, ...],
    expected: str,
):
    """Seeded layouts may explicitly map their own alias to EVA claimant name.

    The generic fallback stays conservative because the CollisionSpike domain carries
    insuredName separately; these provider-owned rules are the reviewed exceptions.
    """
    record = RuleEngine().extract_record(_email_doc(*lines), _provider(provider_id))
    assert record.fields[FieldKey.CLAIMANT_NAME].value == expected

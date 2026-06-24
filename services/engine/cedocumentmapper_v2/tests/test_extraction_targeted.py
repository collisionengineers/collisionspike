"""Targeted extraction unit tests for P2 coverage gaps.

These complement the broad regression sweep (tests/test_regression.py) with
focused, per-API assertions against the real rule engine, normalizers, and
provider detector:

  * acsp_claim_form rule kind -> per-field extraction on the bundled ACSP DOCX
    fixture (no dependency on the private corpus).
  * ``{today}`` manual-rule token and the
    ``use_current_date_for_inspection_date`` provider flag.
  * FW vs MP provider disambiguation in detection (EPIC-03 acceptance: the more
    specific fingerprint wins via the required-phrase tie-break).
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import pytest

from cedocumentmapper_v2.config import migrate_providers_config
from cedocumentmapper_v2.detection import ProviderDetector
from cedocumentmapper_v2.domain.models import (
    DocumentLine,
    DocumentModel,
    DocumentPage,
    FieldKey,
)
from cedocumentmapper_v2.readers import get_reader_for_path
from cedocumentmapper_v2.rules import RuleEngine

REPO_ROOT = Path(__file__).resolve().parents[1]
PROVIDERS_PATH = REPO_ROOT / "providers.json"
FIXTURES_DIR = Path(__file__).parent / "fixtures"
ACSP_DOCX_FIXTURE = FIXTURES_DIR / "instructions" / "ACSP DOCX 01.docx"
ACSP_EXPECTED = FIXTURES_DIR / "expected" / "ACSP_DOCX_01.expected.json"


def _empty_doc() -> DocumentModel:
    return DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=()),),
        plain_text="x",
    )


def _doc_from_lines(texts: list[str]) -> DocumentModel:
    lines = tuple(
        DocumentLine(text=t, page_index=0, line_index=i) for i, t in enumerate(texts)
    )
    return DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=lines),),
        plain_text="\n".join(texts),
    )


def _migrated_providers() -> list[dict]:
    with open(PROVIDERS_PATH, "r", encoding="utf-8") as f:
        v1 = json.load(f)
    return migrate_providers_config(v1)["providers"]


# --------------------------------------------------------------------------- #
# acsp_claim_form rule kind: per-field extraction on the bundled ACSP fixture
# --------------------------------------------------------------------------- #


@pytest.mark.skipif(
    not ACSP_DOCX_FIXTURE.exists() or not ACSP_EXPECTED.exists(),
    reason="ACSP DOCX fixture not present",
)
def test_acsp_claim_form_per_field_extraction():
    """The acsp_claim_form rule kind extracts each field from a real ACSP DOCX.

    Asserts field-by-field (not just provider detection) so a regression in any
    single ACSP extractor is pinpointed rather than hidden in an aggregate diff.
    """
    with open(ACSP_EXPECTED, "r", encoding="utf-8") as f:
        expected = json.load(f)
    expected_values = expected["expected_values"]

    provider = next(
        (p for p in _migrated_providers() if p["id"] == expected["expected_provider"]),
        None,
    )
    assert provider is not None, "ACSP provider missing from migrated catalog"
    # Every ACSP field rule must use the dedicated rule kind.
    assert all(
        rule.get("kind") == "acsp_claim_form"
        for rule in provider["field_rules"].values()
    )

    reader = get_reader_for_path(ACSP_DOCX_FIXTURE)
    doc = reader.read(ACSP_DOCX_FIXTURE)
    record = RuleEngine().extract_record(doc, provider)

    for field_name, expected_val in expected_values.items():
        ext = record.fields.get(FieldKey(field_name))
        assert ext is not None, f"missing field {field_name}"
        assert ext.value == expected_val, (
            f"field '{field_name}': expected {expected_val!r}, got {ext.value!r}"
        )

    # Work provider is hard-coded by the ACSP rule, independent of detection.
    assert record.fields[FieldKey.WORK_PROVIDER].value == "ACSP"


def test_acsp_work_provider_is_constant_via_rule_kind():
    """The acsp_claim_form kind emits a fixed WORK_PROVIDER without any text."""
    engine = RuleEngine()
    ext = engine.extract_field(
        _empty_doc(), FieldKey.WORK_PROVIDER, {"id": "wp", "kind": "acsp_claim_form"}
    )
    assert ext.value == "ACSP"
    assert ext.confidence == 1.0


def test_acsp_vrm_extracted_from_client_vehicle_section():
    """ACSP VRM extraction reads the client (not third-party) Vehicle Details."""
    doc = _doc_from_lines(
        [
            "Vehicle Details",
            "Reg No: HK19 WTN | Make & Model: Volkswagen Sharan",
            "Third Party Vehicle Details",
            "Reg No: ZZ99 ZZZ | Make & Model: Other Car",
        ]
    )
    engine = RuleEngine()
    vrm = engine.extract_field(doc, FieldKey.VRM, {"id": "v", "kind": "acsp_claim_form"})
    model = engine.extract_field(
        doc, FieldKey.VEHICLE_MODEL, {"id": "m", "kind": "acsp_claim_form"}
    )
    assert vrm.value == "HK19 WTN"
    assert model.value == "Volkswagen Sharan"


# --------------------------------------------------------------------------- #
# {today} / use_current_date token behaviour
# --------------------------------------------------------------------------- #


def test_manual_today_token_substitutes_current_date():
    """A manual rule whose value is ``{today}`` resolves to today's date."""
    today = datetime.now().strftime("%d/%m/%Y")
    engine = RuleEngine()
    ext = engine.extract_field(
        _empty_doc(),
        FieldKey.INSTRUCTION_DATE,
        {"id": "m", "kind": "manual", "value": "{today}"},
    )
    assert ext.value == today


def test_manual_today_token_is_case_insensitive():
    """``{TODAY}`` (any case) also resolves, matching _extract_manual()."""
    today = datetime.now().strftime("%d/%m/%Y")
    engine = RuleEngine()
    ext = engine.extract_field(
        _empty_doc(),
        FieldKey.INSTRUCTION_DATE,
        {"id": "m", "kind": "manual", "value": "{TODAY}"},
    )
    assert ext.value == today


def test_manual_literal_value_is_not_treated_as_today():
    """A literal manual value is passed through verbatim (no token expansion)."""
    engine = RuleEngine()
    ext = engine.extract_field(
        _empty_doc(),
        FieldKey.REFERENCE,
        {"id": "m", "kind": "manual", "value": "REF-123"},
    )
    assert ext.value == "REF-123"


def test_use_current_date_for_inspection_date_flag():
    """The provider flag stamps INSPECTION_DATE with today's date."""
    today = datetime.now().strftime("%d/%m/%Y")
    engine = RuleEngine()
    provider = {
        "id": "p",
        "name": "P",
        "work_provider": "P",
        "use_current_date_for_inspection_date": True,
        "field_rules": {},
    }
    record = engine.extract_record(_empty_doc(), provider)
    assert record.fields[FieldKey.INSPECTION_DATE].value == today


def test_inspection_date_blank_without_use_current_date_flag():
    """Without the flag, INSPECTION_DATE is left blank (no accidental stamping)."""
    engine = RuleEngine()
    provider = {
        "id": "p",
        "name": "P",
        "work_provider": "P",
        "field_rules": {},
    }
    record = engine.extract_record(_empty_doc(), provider)
    assert record.fields[FieldKey.INSPECTION_DATE].value == ""


# --------------------------------------------------------------------------- #
# FW vs MP provider disambiguation (EPIC-03)
# --------------------------------------------------------------------------- #


def _detect_name(detector: ProviderDetector, providers: list[dict], text: str) -> str:
    doc = DocumentModel(
        source_path=Path("d.pdf"), source_type="pdf", pages=(), plain_text=text
    )
    return detector.detect(doc, providers).provider_name


def test_fw_garage_vs_solicitor_disambiguation():
    """FW (Garage) carries a second fingerprint phrase that FW (Solicitor) lacks.

    Both reach confidence 1.0 (no optional phrases), so the more-specific
    provider must win on the required-phrase-count tie-break.
    """
    providers = _migrated_providers()
    detector = ProviderDetector()

    garage = _detect_name(
        detector,
        providers,
        "Correspondence from fairwaylegal. Inspection Location: 12 High St, Leeds",
    )
    solicitor = _detect_name(
        detector,
        providers,
        "Letter from fairwaylegal regarding your client's claim.",
    )
    assert garage == "FW (Garage)"
    assert solicitor == "FW (Solicitor)"


def test_mp_branded_vs_simple_disambiguation():
    """MP (Branded) adds the 'Rose Hill Works' fingerprint over MP (Simple)."""
    providers = _migrated_providers()
    detector = ProviderDetector()

    branded = _detect_name(
        detector,
        providers,
        "Rose Hill Works. Please arrange to inspect the above vehicle at your "
        "earliest convenience.",
    )
    simple = _detect_name(
        detector,
        providers,
        "Please arrange to inspect the above vehicle at your earliest convenience.",
    )
    assert branded == "MP (Branded)"
    assert simple == "MP (Simple)"


def test_required_phrase_count_tie_break_directly():
    """The detector's tie-break prefers the larger required-phrase fingerprint."""
    detector = ProviderDetector()
    providers = [
        {
            "id": "broad",
            "name": "Broad",
            "enabled": True,
            "detect": {"required_phrases": ["alpha"]},
        },
        {
            "id": "specific",
            "name": "Specific",
            "enabled": True,
            "detect": {"required_phrases": ["alpha", "beta"]},
        },
    ]
    doc = DocumentModel(
        source_path=Path("d.pdf"),
        source_type="pdf",
        pages=(),
        plain_text="alpha and beta both present",
    )
    match = detector.detect(doc, providers)
    assert match.provider_id == "specific"

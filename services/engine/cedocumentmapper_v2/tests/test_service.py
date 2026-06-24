from __future__ import annotations

from pathlib import Path

import pytest

from cedocumentmapper_v2.application import DocumentMapperService
from cedocumentmapper_v2.domain.models import (
    DocumentModel,
    ExtractedRecord,
    FieldExtraction,
    FieldKey,
    ProviderMatch,
)


PROVIDER = {
    "id": "alison",
    "name": "Alison Solicitors",
    "work_provider": "ALISON",
    "enabled": True,
    "priority": 1,
    "detect": {
        "required_phrases": ["ALISON", "claim"],
        "optional_phrases": [],
        "negative_phrases": [],
        "minimum_confidence": 0.5,
    },
    "field_rules": {
        "work_provider": {"id": "alison_wp", "kind": "manual", "value": "ALISON"},
        "claimant_name": {
            "id": "alison_name",
            "kind": "label_same_line",
            "labels": ["Claimant"],
        },
    },
}


def _doc(text: str) -> DocumentModel:
    return DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(),
        plain_text=text,
    )


def _service() -> DocumentMapperService:
    # app_data_dir set so the service never touches the real user config and never
    # merges seed providers — tests pass providers explicitly.
    return DocumentMapperService(app_data_dir=Path("nonexistent_unused"))


def test_detect_provider_matches():
    service = _service()
    match = service.detect_provider(_doc("This is an ALISON claim document."), [PROVIDER])
    assert match.provider_id == "alison"
    assert match.confidence >= 0.5


def test_detect_provider_no_match():
    service = _service()
    match = service.detect_provider(_doc("Nothing relevant here."), [PROVIDER])
    assert match.provider_id is None


def test_extract_document_allow_unknown_true_synthesizes_placeholder():
    service = _service()
    record = service.extract_document(_doc("no match"), providers=[PROVIDER], allow_unknown=True)
    # With allow_unknown=True an unmatched document gets the synthetic placeholder
    # provider so a record (with a work_provider) is still produced.
    assert record.provider.provider_id == "unknown_temp"


def test_extract_document_allow_unknown_false_returns_unmapped():
    service = _service()
    record = service.extract_document(_doc("no match"), providers=[PROVIDER], allow_unknown=False)
    # With allow_unknown=False an unmatched document yields an unmapped record:
    # provider_id is None and no fields are extracted.
    assert record.provider.provider_id is None
    assert record.fields == {}


def test_extract_document_matched_provider():
    service = _service()
    record = service.extract_document(
        _doc("This is an ALISON claim for Claimant: John Smith"),
        providers=[PROVIDER],
        allow_unknown=False,
    )
    assert record.provider.provider_id == "alison"
    assert record.fields[FieldKey.WORK_PROVIDER].value == "ALISON"


def _record(work_provider: str, **fields: str) -> ExtractedRecord:
    field_map = {FieldKey.WORK_PROVIDER: FieldExtraction(value=work_provider)}
    for key, value in fields.items():
        field_map[FieldKey(key)] = FieldExtraction(value=value)
    return ExtractedRecord(provider=ProviderMatch("alison", "Alison", 1.0), fields=field_map)


def test_overlay_overrides_non_blank_engineer_fields():
    service = _service()
    base = _record("ALISON", claimant_name="Old Name", vrm="AB12CDE")
    engineer = _record("ENGINEER", claimant_name="New Name", vrm="")
    merged, overrides = service.overlay_records_with_overrides(
        base, engineer, engineer_source_name="eng.pdf"
    )
    # Non-blank engineer field overrides the base.
    assert merged.fields[FieldKey.CLAIMANT_NAME].value == "New Name"
    assert "claimant_name" in overrides
    # Blank engineer value does NOT override the base.
    assert merged.fields[FieldKey.VRM].value == "AB12CDE"
    # work_provider is never overridden by the engineer record.
    assert merged.fields[FieldKey.WORK_PROVIDER].value == "ALISON"
    assert "work_provider" not in overrides
    assert any("Applied engineer report: eng.pdf" in note for note in merged.notes)


def test_overlay_requires_instruction_work_provider():
    service = _service()
    base = _record("")  # blank work_provider == no valid instruction
    engineer = _record("ENGINEER", claimant_name="Name")
    with pytest.raises(ValueError):
        service.overlay_records_with_overrides(base, engineer)

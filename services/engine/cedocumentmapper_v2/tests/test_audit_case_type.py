from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from cedocumentmapper_v2.application import DocumentMapperService
from cedocumentmapper_v2.detection import audit_signal_for_reference, is_audit_reference
from cedocumentmapper_v2.detection.case_type import AUDIT_REFERENCE_RE
from cedocumentmapper_v2.domain.models import (
    DocumentModel,
    ExtractedRecord,
    FieldExtraction,
    FieldKey,
    ProviderMatch,
)
from cedocumentmapper_v2.exporters import EVAJsonExporter


def _service() -> DocumentMapperService:
    # app_data_dir set so the service never touches the real user config nor merges
    # seed providers — tests pass providers explicitly.
    return DocumentMapperService(app_data_dir=Path("nonexistent_unused"))


def _doc(text: str) -> DocumentModel:
    return DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(),
        plain_text=text,
    )


def _provider(reference: str) -> dict:
    """A minimal provider whose REFERENCE is fixed by a manual rule."""
    return {
        "id": "pch",
        "name": "PCH",
        "work_provider": "PCH",
        "enabled": True,
        "priority": 1,
        "detect": {
            "required_phrases": ["PCH"],
            "optional_phrases": [],
            "negative_phrases": [],
            "minimum_confidence": 0.5,
        },
        "field_rules": {
            "work_provider": {"id": "pch_wp", "kind": "manual", "value": "PCH"},
            "reference": {"id": "pch_ref", "kind": "manual", "value": reference},
        },
    }


def _record(reference: str, work_provider: str = "PCH") -> ExtractedRecord:
    # Populated with EVA-schema-valid values so the record can also be exported.
    return ExtractedRecord(
        provider=ProviderMatch("pch", "PCH", 1.0),
        fields={
            FieldKey.WORK_PROVIDER: FieldExtraction(work_provider),
            FieldKey.VRM: FieldExtraction("NG22FVH"),
            FieldKey.REFERENCE: FieldExtraction(reference),
            FieldKey.INSPECTION_ADDRESS: FieldExtraction("123 Street\n\n\n\n\nB5 6JX"),
        },
    )


# --- detection helper -------------------------------------------------------

@pytest.mark.parametrize(
    "reference",
    ["A.PCH261269", "A.PCH261272", "  a. pch261272 ", "A.QDOS261253", "a.EHR102191"],
)
def test_audit_prefix_is_detected(reference):
    assert is_audit_reference(reference) is True
    assert audit_signal_for_reference(reference) is not None


@pytest.mark.parametrize(
    "reference",
    ["PCH261269", "PCH26", "", "   ", "A4REG", "A.", "A.123", None, "AUDIT-1"],
)
def test_non_audit_references_are_not_flagged(reference):
    assert is_audit_reference(reference) is False
    assert audit_signal_for_reference(reference) is None


def test_audit_regex_anchored_at_start():
    # The marker must be at the start; a mid-string "A." should not match.
    assert AUDIT_REFERENCE_RE.match("PCH A.261269") is None


# --- detection wired through extract_document -------------------------------

def test_extract_sets_is_audit_on_audit_reference():
    service = _service()
    provider = _provider("A.PCH261269")
    record = service.extract_document(_doc("PCH instruction"), provider, [provider])
    assert record.is_audit is True
    assert record.case_type == "audit"
    assert record.audit_signals  # at least one signal recorded
    assert record.fields[FieldKey.REFERENCE].value == "A.PCH261269"


def test_extract_does_not_set_is_audit_on_regular_reference():
    service = _service()
    provider = _provider("PCH261269")
    record = service.extract_document(_doc("PCH instruction"), provider, [provider])
    assert record.is_audit is False
    assert record.case_type is None
    assert record.audit_signals == ()


def test_record_to_dict_surfaces_audit_flags():
    service = _service()
    record = service._apply_case_type(_record("A.PCH261269"))
    data = service.record_to_dict(record)
    assert data["is_audit"] is True
    assert data["case_type"] == "audit"
    assert data["audit_signals"]


# --- EVA JSON export must NOT carry the internal flag -----------------------

def test_is_audit_absent_from_eva_json_export():
    service = _service()
    record = service._apply_case_type(_record("A.PCH261269"))
    assert record.is_audit is True
    # The exporter validates against the bundled eva-json schema; an extra
    # property such as "is_audit" would make validation fail.
    exported = EVAJsonExporter().export(record)
    payload = json.loads(exported)
    keys = {k.lower().replace(" ", "_") for k in payload}
    assert "is_audit" not in keys
    assert "audit_signals" not in keys
    assert "case_type" not in keys
    # Sanity: the real EVA fields are present.
    assert "Work Provider" in payload
    assert payload["Reference"] == "A.PCH261269"


# --- never-overlay guard ----------------------------------------------------

def test_overlay_guard_fires_for_audit_record():
    service = _service()
    base = service._apply_case_type(_record("A.PCH261269"))
    engineer = _record("EVAREF", work_provider="EVA")
    with pytest.raises(ValueError, match="kept separate"):
        service.overlay_records_with_overrides(base, engineer)


def test_overlay_allowed_for_non_audit_record():
    service = _service()
    base = service._apply_case_type(_record("PCH261269"))
    engineer = ExtractedRecord(
        provider=ProviderMatch("eva", "EVA", 1.0),
        fields={
            FieldKey.WORK_PROVIDER: FieldExtraction("EVA"),
            FieldKey.VRM: FieldExtraction("NG22FVH"),
        },
    )
    merged, overrides = service.overlay_records_with_overrides(base, engineer)
    # work_provider is preserved from the instruction; vrm is overlaid.
    assert merged.fields[FieldKey.WORK_PROVIDER].value == "PCH"
    assert merged.fields[FieldKey.VRM].value == "NG22FVH"
    assert "vrm" in overrides


# --- OCR force-option threading --------------------------------------------

def test_force_ocr_reaches_pdf_reader(monkeypatch, tmp_path):
    """force_ocr must reach the PDF reader's keyword-only force_ocr param."""
    from cedocumentmapper_v2.readers import PDFDocumentReader

    captured: dict[str, object] = {}

    def fake_read(self, path, *, force_ocr=False, **kwargs):
        captured["force_ocr"] = force_ocr
        return _doc("PCH instruction")

    monkeypatch.setattr(PDFDocumentReader, "read", fake_read)

    service = _service()
    pdf_path = tmp_path / "instruction.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 dummy")

    service.read_document(pdf_path, force_ocr=True)
    assert captured["force_ocr"] is True

    captured.clear()
    service.read_document(pdf_path)  # default
    assert captured["force_ocr"] is False


def test_force_ocr_not_passed_to_non_pdf_reader(monkeypatch, tmp_path):
    """Non-PDF readers keep the plain read(path) signature; force_ocr is not passed."""
    from cedocumentmapper_v2.readers import DocxDocumentReader

    captured: dict[str, object] = {}

    def fake_read(self, path):  # no force_ocr kwarg — would TypeError if passed
        captured["called"] = True
        return _doc("docx text")

    monkeypatch.setattr(DocxDocumentReader, "read", fake_read)

    service = _service()
    docx_path = tmp_path / "instruction.docx"
    docx_path.write_bytes(b"PK dummy")

    # Should not raise even though force_ocr=True is requested.
    service.read_document(docx_path, force_ocr=True)
    assert captured["called"] is True


@pytest.mark.skipif(
    shutil.which("tesseract") is None,
    reason="Tesseract OCR binary not available; skipping live OCR run",
)
def test_force_ocr_live_smoke(tmp_path):
    """End-to-end: forcing OCR on a text PDF still produces a document model.

    Skipped automatically when Tesseract is not usable on this machine.
    """
    import fitz

    pdf_path = tmp_path / "text.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "PCH A.PCH261269 instruction")
    doc.save(str(pdf_path))
    doc.close()

    service = _service()
    document = service.read_document(pdf_path, force_ocr=True)
    assert document.metadata.get("ocr_forced") is True

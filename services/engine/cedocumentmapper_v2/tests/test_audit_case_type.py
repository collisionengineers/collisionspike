from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from cedocumentmapper_v2.application import DocumentMapperService
from cedocumentmapper_v2.detection import (
    audit_signal_for_reference,
    case_type_for_reference,
    case_type_signal_for_reference,
    is_audit_reference,
    marker_for_reference,
)
from cedocumentmapper_v2.detection.case_type import AUDIT_REFERENCE_RE
from cedocumentmapper_v2.rules.engine import detect_case_type_signals
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


# --- ADR-0021 marker taxonomy (A. / AP. / D.) --------------------------------

@pytest.mark.parametrize(
    ("reference", "marker", "case_type"),
    [
        ("A.PCH261269", "A.", "audit"),
        ("  a. pch261272 ", "A.", "audit"),
        ("AP.QDOS261530", "AP.", "audit_total_loss"),
        (" ap. qdos261572", "AP.", "audit_total_loss"),
        ("D.PCH26190", "D.", "diminution"),
        ("d.qdos26001", "D.", "diminution"),
    ],
)
def test_marker_taxonomy_detected(reference, marker, case_type):
    assert marker_for_reference(reference) == marker
    assert case_type_for_reference(reference) == case_type
    assert case_type_signal_for_reference(reference) is not None


@pytest.mark.parametrize(
    "reference",
    ["PCH261269", "QDOS261530", "", None, "AP", "AP.", "D.", "AD.PCH26001", "P.PCH26001"],
)
def test_unmarked_or_unknown_marker_references(reference):
    assert marker_for_reference(reference) is None
    assert case_type_for_reference(reference) is None
    assert case_type_signal_for_reference(reference) is None


def test_ap_is_audit_but_d_is_not():
    # Both audit kinds count as audits; diminution is a distinct case-type.
    assert is_audit_reference("AP.QDOS261530") is True
    assert audit_signal_for_reference("AP.QDOS261530") is not None
    assert is_audit_reference("D.PCH26190") is False
    assert audit_signal_for_reference("D.PCH26190") is None


def test_apply_case_type_maps_ap_and_d_markers():
    service = _service()
    total_loss = service._apply_case_type(_record("AP.QDOS261530"))
    assert total_loss.case_type == "audit_total_loss"
    assert total_loss.is_audit is True
    diminution = service._apply_case_type(_record("D.PCH26190"))
    assert diminution.case_type == "diminution"
    assert diminution.is_audit is False
    assert diminution.audit_signals  # the D. signal is still recorded


def test_record_to_dict_round_trips_case_type_dual():
    service = _service()
    from dataclasses import replace

    record = replace(_record("QDOS261608"), case_type="audit", case_type_dual=True)
    data = service.record_to_dict(record)
    assert data["case_type_dual"] is True
    rebuilt = service.record_from_dict(data)
    assert rebuilt.case_type_dual is True


# --- content-derived case-type signals (detect_case_type_signals) ------------

def test_detect_case_type_signals_dual_report_audit():
    text = "ENGINEER NOTIFICATION (REPORT + AUDIT REPORT) please attend"
    case_type, dual, signals = detect_case_type_signals(text)
    assert case_type == "audit"
    assert dual is True
    assert "report + audit report" in signals


def test_detect_case_type_signals_standalone_audit():
    text = "Please find enclosed the original engineer's audit report for review"
    case_type, dual, signals = detect_case_type_signals(text)
    assert case_type == "audit"
    assert dual is False
    assert signals


def test_detect_case_type_signals_diminution():
    case_type, dual, signals = detect_case_type_signals(
        "We instruct you to prepare a diminution in value report"
    )
    assert case_type == "diminution"
    assert dual is False
    assert "diminution in value" in signals


def test_detect_case_type_signals_audit_wins_over_diminution():
    # When both fire, the grounded audit set wins; review corrects the rare case.
    case_type, dual, _ = detect_case_type_signals(
        "audit report following the diminution in value claim"
    )
    assert case_type == "audit"
    assert dual is False


def test_detect_case_type_signals_nothing():
    assert detect_case_type_signals("please inspect our client vehicle") == (None, False, ())
    assert detect_case_type_signals("") == (None, False, ())


def test_extract_sets_case_type_from_dual_content():
    service = _service()
    provider = _provider("QDOS261608")
    record = service.extract_document(
        _doc("PCH ENGINEER NOTIFICATION (REPORT + AUDIT REPORT)"), provider, [provider]
    )
    assert record.case_type == "audit"
    assert record.case_type_dual is True
    assert record.is_audit is True


# --- engineer_report layouts must never leak their name as work_provider -----

def _layout(name: str, engineer_report: bool) -> dict:
    """A provider layout whose work_provider rule extracts NOTHING, so the
    engine's fallback path decides the value."""
    return {
        "id": name.lower().replace(" ", "_"),
        "name": name,
        "enabled": True,
        "priority": 1,
        "engineer_report": engineer_report,
        "detect": {
            "required_phrases": [name],
            "optional_phrases": [],
            "negative_phrases": [],
            "minimum_confidence": 0.5,
        },
        "field_rules": {
            "work_provider": {"id": "wp", "kind": "manual", "value": ""},
        },
    }


def test_engineer_report_layout_never_supplies_work_provider():
    """TKT-051: an attached EVA/CNX report parsed as a document must not leak
    its layout name ("EVA (Engineers)") into work_provider."""
    service = _service()
    layout = _layout("EVA (Engineers)", engineer_report=True)
    record = service.extract_document(_doc("EVA (Engineers) report body"), layout, [layout])
    assert record.fields[FieldKey.WORK_PROVIDER].value == ""


def test_regular_layout_keeps_name_fallback():
    """The layout-name fallback is preserved for genuine work-provider layouts."""
    service = _service()
    layout = _layout("Knightsbridge Solicitors", engineer_report=False)
    record = service.extract_document(
        _doc("Knightsbridge Solicitors instruction"), layout, [layout]
    )
    assert record.fields[FieldKey.WORK_PROVIDER].value == "Knightsbridge Solicitors"

"""Export integrity tests: non-mutation and real DOCX content.

Covers two P2 gaps that the existing exporter tests (which only assert "bytes
were produced") miss:

  * Exporting a record must NOT mutate the record's fields/values.
  * The RJS DOCX exporter must embed the actual field values in the document
    (verified by re-opening the generated .docx with python-docx), not merely
    write a non-empty file.
"""

from __future__ import annotations

import copy
import io

from docx import Document

from cedocumentmapper_v2.domain.models import (
    ExtractedRecord,
    FieldExtraction,
    FieldKey,
    ProviderMatch,
)
from cedocumentmapper_v2.exporters import EVAJsonExporter, RJSDocxExporter


def _sample_record() -> ExtractedRecord:
    fields = {
        FieldKey.WORK_PROVIDER: FieldExtraction(value="RJS"),
        FieldKey.VRM: FieldExtraction(value="RJ62RTU"),
        FieldKey.VEHICLE_MODEL: FieldExtraction(value="Skoda Superb"),
        FieldKey.CLAIMANT_NAME: FieldExtraction(value="Mr Piotr Robaczkiewicz"),
        FieldKey.REFERENCE: FieldExtraction(value="RJS-12345"),
        FieldKey.INCIDENT_DATE: FieldExtraction(value="14/04/2026"),
        FieldKey.INSTRUCTION_DATE: FieldExtraction(value="15/04/2026"),
        FieldKey.INSPECTION_DATE: FieldExtraction(value="15/04/2026"),
        # Canonical 6-line EVA address form (see normalize_address): five body
        # lines followed by the postcode.
        FieldKey.INSPECTION_ADDRESS: FieldExtraction(
            value="123 Example Street\nMidtown\n\n\n\nB5 6JX"
        ),
        FieldKey.VAT_STATUS: FieldExtraction(value="No"),
        FieldKey.MILEAGE: FieldExtraction(value="53600"),
        FieldKey.MILEAGE_UNIT: FieldExtraction(value="Km"),
        FieldKey.ACCIDENT_CIRCUMSTANCES: FieldExtraction(value="Parked vehicle hit"),
    }
    return ExtractedRecord(
        provider=ProviderMatch(
            provider_id="rjs", provider_name="RJS Solicitors", confidence=1.0
        ),
        fields=fields,
    )


def _docx_text(docx_bytes: bytes) -> str:
    doc = Document(io.BytesIO(docx_bytes))
    return "\n".join(p.text for p in doc.paragraphs)


def _field_snapshot(record: ExtractedRecord) -> dict[str, str]:
    return {key.value: ext.value for key, ext in record.fields.items()}


# --------------------------------------------------------------------------- #
# Non-mutation
# --------------------------------------------------------------------------- #


def test_rjs_export_does_not_mutate_record():
    record = _sample_record()
    before = _field_snapshot(record)

    RJSDocxExporter().export(record)

    assert _field_snapshot(record) == before


def test_eva_export_does_not_mutate_record():
    record = _sample_record()
    before = _field_snapshot(record)

    EVAJsonExporter().export(record)

    assert _field_snapshot(record) == before


def test_export_preserves_field_extraction_objects():
    """The exporter must not replace or reach into FieldExtraction objects."""
    record = _sample_record()
    objects_before = {k: id(v) for k, v in record.fields.items()}
    raw_before = copy.deepcopy({k: v.raw_value for k, v in record.fields.items()})

    RJSDocxExporter().export(record)
    EVAJsonExporter().export(record)

    assert {k: id(v) for k, v in record.fields.items()} == objects_before
    assert {k: v.raw_value for k, v in record.fields.items()} == raw_before


# --------------------------------------------------------------------------- #
# RJS DOCX content
# --------------------------------------------------------------------------- #


def test_rjs_docx_contains_field_values():
    record = _sample_record()
    text = _docx_text(RJSDocxExporter().export(record))

    # Claimant name, VRM, vehicle model and reference are rendered into the doc.
    assert "Mr Piotr Robaczkiewicz" in text
    assert "RJ62RTU" in text
    assert "Skoda Superb" in text
    assert "RJS-12345" in text


def test_rjs_docx_formats_dates_long_form():
    """Dates are rendered in 'Day Month Year' long form, not DD/MM/YYYY."""
    record = _sample_record()
    text = _docx_text(RJSDocxExporter().export(record))

    # 14/04/2026 -> 14th April 2026 (incident date appears in the narrative).
    assert "14th April 2026" in text
    assert "14/04/2026" not in text


def test_rjs_docx_renders_address_lines():
    record = _sample_record()
    text = _docx_text(RJSDocxExporter().export(record))

    # First address line and postcode (last block line) must both appear.
    assert "123 Example Street" in text
    assert "B5 6JX" in text

import json
import pytest
from cedocumentmapper_v2.domain.models import (
    ExtractedRecord,
    ProviderMatch,
    FieldKey,
    FieldExtraction,
    FIELD_ORDER,
    FIELD_LABELS,
)
from cedocumentmapper_v2.exporters import EVAJsonExporter, RJSDocxExporter


def test_eva_json_exporter():
    # Prepare ExtractedRecord
    fields = {
        FieldKey.WORK_PROVIDER: FieldExtraction(value="SBL"),
        FieldKey.VRM: FieldExtraction(value="RJ62RTU"),
        FieldKey.VEHICLE_MODEL: FieldExtraction(value="Skoda Superb"),
        FieldKey.CLAIMANT_NAME: FieldExtraction(value="Mr Piotr Robaczkiewicz"),
        FieldKey.REFERENCE: FieldExtraction(value="SBL-12345"),
        FieldKey.INCIDENT_DATE: FieldExtraction(value="14/04/2026"),
        FieldKey.INSTRUCTION_DATE: FieldExtraction(value="15/04/2026"),
        FieldKey.INSPECTION_DATE: FieldExtraction(value="15/04/2026"),
        FieldKey.INSPECTION_ADDRESS: FieldExtraction(value="123 Street\n\n\n\n\nB5 6JX"),
        FieldKey.VAT_STATUS: FieldExtraction(value="No"),
        FieldKey.MILEAGE: FieldExtraction(value="53600"),
        FieldKey.MILEAGE_UNIT: FieldExtraction(value="Km"),
        FieldKey.ACCIDENT_CIRCUMSTANCES: FieldExtraction(value="Parked vehicle hit"),
    }
    
    record = ExtractedRecord(
        provider=ProviderMatch(provider_id="sbl", provider_name="SBL Solicitors", confidence=1.0),
        fields=fields,
    )

    exporter = EVAJsonExporter()
    exported_str = exporter.export(record)
    
    # Check it parses as JSON and contains required keys
    data = json.loads(exported_str)
    assert data["Work Provider"] == "SBL"
    assert data["VRM"] == "RJ62RTU"
    assert data["VAT Status"] == "No"
    
    # Assert correct display order
    keys = list(data.keys())
    assert keys[0] == "Work Provider"
    assert keys[1] == "VRM"
    # Mileage Unit is always last in FIELD_ORDER; index shifts when fields are
    # inserted earlier (e.g. ROADMAP-B2's Claimant Telephone / Claimant Email
    # after Claimant Name), so pin it relative to length rather than a bare
    # literal.
    assert keys[-1] == "Mileage Unit"
    assert len(keys) == len(FIELD_ORDER)


def test_eva_json_exporter_accepts_every_field_in_field_order():
    """``export()`` ALWAYS validates the FIELD_ORDER-built dict against the bundled
    ``resources/eva-json.schema.json`` (``additionalProperties: false``). If a key
    is ever added to ``FIELD_ORDER`` without a matching schema property, the bundled
    schema rejects it and ``export()`` raises a ValidationError on every call. This
    test populates EVERY FIELD_ORDER key and asserts ``export()`` round-trips, so the
    schema can never silently fall out of sync with the field set again.

    (Recovered from the stranded ``feat/audit-case-type-detection`` branch
    (504c3a3) as part of upstreaming ROADMAP-B2 claimant-contact extraction --
    FIELD_ORDER now carries the Claimant Telephone / Claimant Email keys natively,
    so the parenthetical below is no longer a "vendored cloud copy" special case.)
    """
    fields = {
        key: FieldExtraction(
            value="Work Provider X" if key is FieldKey.WORK_PROVIDER else _sample_value(key)
        )
        for key in FIELD_ORDER
    }
    record = ExtractedRecord(
        provider=ProviderMatch(provider_id="x", provider_name="X", confidence=1.0),
        fields=fields,
    )

    exported = EVAJsonExporter().export(record)  # must not raise
    data = json.loads(exported)

    # Every FIELD_ORDER label appears, in order, and nothing extra leaks in.
    expected_labels = [FIELD_LABELS[key] for key in FIELD_ORDER]
    assert list(data.keys()) == expected_labels


def _sample_value(key: FieldKey) -> str:
    """A schema-valid sample value for each field (dates DD/MM/YYYY, mileage digits,
    enums from their allowed set, the 6-line inspection address)."""
    if key in {FieldKey.INCIDENT_DATE, FieldKey.INSTRUCTION_DATE, FieldKey.INSPECTION_DATE}:
        return "14/04/2026"
    if key is FieldKey.INSPECTION_ADDRESS:
        return "123 Street\n\n\n\n\nB5 6JX"  # exactly 6 lines
    if key is FieldKey.VAT_STATUS:
        return "No"
    if key is FieldKey.MILEAGE:
        return "53600"
    if key is FieldKey.MILEAGE_UNIT:
        return "Km"
    return "sample"


def test_eva_json_exporter_blocks_blank_work_provider():
    # Prepare record with empty work provider
    fields = {
        FieldKey.WORK_PROVIDER: FieldExtraction(value=""),
        FieldKey.VRM: FieldExtraction(value="RJ62RTU"),
    }
    record = ExtractedRecord(
        provider=ProviderMatch(provider_id="sbl", provider_name="SBL Solicitors", confidence=1.0),
        fields=fields,
    )

    exporter = EVAJsonExporter()
    with pytest.raises(ValueError, match="Export blocked: 'Work Provider' cannot be blank."):
        exporter.export(record)


def test_rjs_docx_exporter():
    fields = {
        FieldKey.WORK_PROVIDER: FieldExtraction(value="RJS"),
        FieldKey.VRM: FieldExtraction(value="RJ62RTU"),
        FieldKey.VEHICLE_MODEL: FieldExtraction(value="Skoda Superb"),
        FieldKey.CLAIMANT_NAME: FieldExtraction(value="Mr Piotr Robaczkiewicz"),
        FieldKey.REFERENCE: FieldExtraction(value="RJS-12345"),
        FieldKey.INCIDENT_DATE: FieldExtraction(value="14/04/2026"),
        FieldKey.INSTRUCTION_DATE: FieldExtraction(value="15/04/2026"),
        FieldKey.INSPECTION_ADDRESS: FieldExtraction(value="123 Street\n\nB5 6JX"),
    }
    record = ExtractedRecord(
        provider=ProviderMatch(provider_id="rjs", provider_name="RJS Solicitors", confidence=1.0),
        fields=fields,
    )

    exporter = RJSDocxExporter()
    docx_bytes = exporter.export(record)
    assert isinstance(docx_bytes, bytes)
    assert len(docx_bytes) > 0

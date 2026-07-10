"""Offline tests for the EVA JSON exporter's ``export()`` schema-validation path.

The cloud ``/parse`` route never calls ``EVAJsonExporter.export()`` — it builds
its payload through ``parser_adapter`` / ``record_to_dict``. But the desktop review
GUI's ``export_json`` path DOES, and ``export()`` ALWAYS validates the
``FIELD_ORDER``-built dict against the bundled ``resources/eva-json.schema.json``
(which is ``additionalProperties: false``).

This is the regression these tests lock down (PR #24 review finding #1): the
VENDORED ``FIELD_ORDER`` carries the ROADMAP-B2 ``Claimant Telephone`` /
``Claimant Email`` keys, but the bundled schema originally omitted them, so every
``export()`` call raised a ``jsonschema.ValidationError`` ("Claimant Email,
Claimant Telephone were unexpected"). No test exercised ``export()`` against the
vendored field set, so the desktop crash was invisible to CI. These tests call
``export()`` on a full record and assert the claimant-contact keys round-trip, so
a future schema/field-set drift fails loudly here.

Pure: ``DocumentModel`` / ``ExtractedRecord`` are built in-memory, no PyMuPDF or
Tesseract needed.

Run from functions/parser/:
    python -m pytest tests/test_eva_export.py
"""

from __future__ import annotations

import json

import jsonschema
import pytest

from cedocumentmapper_v2.domain.models import (
    ExtractedRecord,
    ProviderMatch,
    FieldKey,
    FieldExtraction,
    EVA_EXPORT_FIELD_ORDER,
    FIELD_ORDER,
    FIELD_LABELS,
)
from cedocumentmapper_v2.exporters import EVAJsonExporter


def _sample_value(key: FieldKey) -> str:
    """A schema-valid sample value per field: DD/MM/YYYY dates, digit-only mileage,
    enum members from their allowed sets, and the 6-line inspection address."""
    if key in {
        FieldKey.INCIDENT_DATE,
        FieldKey.INSTRUCTION_DATE,
        FieldKey.INSPECTION_DATE,
    }:
        return "14/04/2026"
    if key is FieldKey.INSPECTION_ADDRESS:
        return "123 Example Street\nLine 2\nLine 3\nLine 4\nLine 5\nB5 6JX"  # 6 lines
    if key is FieldKey.VAT_STATUS:
        return "No"
    if key is FieldKey.MILEAGE:
        return "53600"
    if key is FieldKey.MILEAGE_UNIT:
        return "Km"
    if key is FieldKey.CLAIMANT_TELEPHONE:
        return "07700900123"
    if key is FieldKey.CLAIMANT_EMAIL:
        return "claimant@example.com"
    if key is FieldKey.WORK_PROVIDER:
        return "SBL Solicitors"
    if key is FieldKey.VRM:
        return "RJ62RTU"
    return "sample"


def _full_record() -> ExtractedRecord:
    fields = {key: FieldExtraction(value=_sample_value(key)) for key in FIELD_ORDER}
    return ExtractedRecord(
        provider=ProviderMatch(provider_id="sbl", provider_name="SBL", confidence=1.0),
        fields=fields,
    )


def test_export_full_record_does_not_raise_schema_validation_error():
    """The desktop crash regression: a record populating EVERY FIELD_ORDER key —
    including the vendored ROADMAP-B2 Claimant Telephone / Claimant Email — must
    pass ``export()``'s bundled-schema validation. Pre-fix this raised a
    ValidationError because the schema's ``additionalProperties: false`` rejected
    the two claimant-contact keys the FIELD_ORDER emits.

    Since engine-v2.14 (collisionspike TKT-147) the export enumerates
    ``EVA_EXPORT_FIELD_ORDER`` — the settled EVA contract key set — never
    ``FIELD_ORDER``, which now also carries the ENVELOPE-ONLY ``vin`` key that
    must never reach the EVA payload. The record here still populates every
    FIELD_ORDER key (vin included) to prove the envelope field cannot leak."""
    exported = EVAJsonExporter().export(_full_record())  # must NOT raise
    data = json.loads(exported)

    # Every EVA-contract label appears in order; nothing extra leaks in — the
    # populated envelope-only vin stays OUT of the payload.
    assert list(data.keys()) == [FIELD_LABELS[key] for key in EVA_EXPORT_FIELD_ORDER]
    assert "VIN" not in data


def test_export_round_trips_claimant_contact_keys():
    """When FIELD_ORDER carries the claimant-contact keys (the vendored cloud copy
    does), ``export()`` must emit them with their values — they are no longer
    silently rejected by the schema."""
    if FieldKey.CLAIMANT_TELEPHONE not in FIELD_ORDER:
        pytest.skip("FIELD_ORDER does not carry claimant-contact keys (sibling shape)")

    data = json.loads(EVAJsonExporter().export(_full_record()))
    assert data["Claimant Telephone"] == "07700900123"
    assert data["Claimant Email"] == "claimant@example.com"
    # They sit immediately after Claimant Name, per FIELD_ORDER.
    keys = list(data.keys())
    name_idx = keys.index("Claimant Name")
    assert keys[name_idx + 1] == "Claimant Telephone"
    assert keys[name_idx + 2] == "Claimant Email"


def test_export_still_enforces_contract_invariants():
    """The schema fix only ADDS the two optional claimant-contact properties; it
    must not loosen the rest of the contract. A bad date / mileage / enum / address
    still fails validation."""
    record = _full_record()

    bad_date = ExtractedRecord(
        provider=record.provider,
        fields={**record.fields, FieldKey.INCIDENT_DATE: FieldExtraction(value="2026-04-14")},
    )
    with pytest.raises(jsonschema.ValidationError):
        EVAJsonExporter().export(bad_date)

    bad_vat = ExtractedRecord(
        provider=record.provider,
        fields={**record.fields, FieldKey.VAT_STATUS: FieldExtraction(value="Maybe")},
    )
    with pytest.raises(jsonschema.ValidationError):
        EVAJsonExporter().export(bad_vat)

    bad_address = ExtractedRecord(
        provider=record.provider,
        fields={**record.fields, FieldKey.INSPECTION_ADDRESS: FieldExtraction(value="one line only")},
    )
    with pytest.raises(jsonschema.ValidationError):
        EVAJsonExporter().export(bad_address)

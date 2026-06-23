from pathlib import Path
from cedocumentmapper_v2.domain.models import DocumentModel, DocumentPage, DocumentLine, FieldKey
from cedocumentmapper_v2.rules import RuleEngine
from cedocumentmapper_v2.rules.engine import IMAGE_BASED_ASSESSMENT


def _doc(lines: list[DocumentLine]) -> DocumentModel:
    return DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=tuple(lines)),),
        plain_text="\n".join(line.text for line in lines),
    )


def _inspection_address_record(address_text: str):
    """Extract the inspection-address field for an arbitrary provider whose only
    rule targets the inspection address (single labelled line). Returns the
    FieldExtraction."""
    doc = _doc([DocumentLine(text=f"Inspection Address: {address_text}", page_index=0, line_index=0)])
    provider = {
        "id": "p",
        "name": "Provider",
        "work_provider": "P",
        "field_rules": {
            "inspection_address": {
                "id": "inspection_address",
                "kind": "label_same_line",
                "labels": ["Inspection Address"],
            }
        },
    }
    record = RuleEngine().extract_record(doc, provider)
    return record.fields[FieldKey.INSPECTION_ADDRESS]


def test_rule_label_same_line():
    lines = [
        DocumentLine(text="Vehicle Reg: AA11BBB", page_index=0, line_index=0),
    ]
    doc = DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=tuple(lines)),),
        plain_text="Vehicle Reg: AA11BBB",
    )

    engine = RuleEngine()
    rule = {
        "id": "vrm_rule",
        "kind": "label_same_line",
        "labels": ["Vehicle Reg"],
    }
    extracted = engine.extract_field(doc, FieldKey.VRM, rule)
    assert extracted.value == "AA11BBB"
    assert extracted.confidence == 1.0
    assert extracted.source_span.line_index == 0


def test_rule_label_same_line_fuzzy():
    lines = [
        DocumentLine(text="Vehcle Reglstratlon: AA11BBB", page_index=0, line_index=0),
    ]
    doc = DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=tuple(lines)),),
        plain_text="Vehcle Reglstratlon: AA11BBB",
    )

    engine = RuleEngine()
    rule = {
        "id": "vrm_rule",
        "kind": "label_same_line",
        "labels": ["Vehicle Registration"],
    }
    extracted = engine.extract_field(doc, FieldKey.VRM, rule)
    assert extracted.value == "AA11BBB"
    assert extracted.confidence >= 0.8  # Should fuzzy match
    assert extracted.source_span.line_index == 0


def test_rule_label_next_line():
    lines = [
        DocumentLine(text="Claimant Name", page_index=0, line_index=0),
        DocumentLine(text="John Smith", page_index=0, line_index=1),
    ]
    doc = DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=tuple(lines)),),
        plain_text="Claimant Name\nJohn Smith",
    )

    engine = RuleEngine()
    rule = {
        "id": "claimant_rule",
        "kind": "label_next_line",
        "labels": ["Claimant Name"],
    }
    extracted = engine.extract_field(doc, FieldKey.CLAIMANT_NAME, rule)
    assert extracted.value == "John Smith"
    assert extracted.source_span.line_index == 1


def test_rule_label_same_or_next_line_falls_back_to_next_line():
    lines = [
        DocumentLine(text="Claimant Name", page_index=0, line_index=0),
        DocumentLine(text="John Smith", page_index=0, line_index=1),
    ]
    doc = DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=tuple(lines)),),
        plain_text="Claimant Name\nJohn Smith",
    )

    engine = RuleEngine()
    rule = {
        "id": "claimant_rule",
        "kind": "label_same_or_next_line",
        "labels": ["Claimant Name"],
    }
    extracted = engine.extract_field(doc, FieldKey.CLAIMANT_NAME, rule)
    assert extracted.value == "John Smith"
    assert extracted.source_span.line_index == 1


def test_rule_between_labels():
    doc = DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(),
        plain_text="START_LABEL\nInner content to extract\nEND_LABEL",
    )

    engine = RuleEngine()
    rule = {
        "id": "between_rule",
        "kind": "between_labels",
        "start_label": "START_LABEL",
        "end_label": "END_LABEL",
    }
    extracted = engine.extract_field(doc, FieldKey.ACCIDENT_CIRCUMSTANCES, rule)
    assert extracted.value == "Inner content to extract"


def test_rule_fixed_line():
    lines = [
        DocumentLine(text="Line 1", page_index=0, line_index=0),
        DocumentLine(text="Target Line Text", page_index=0, line_index=1),
    ]
    doc = DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=tuple(lines)),),
        plain_text="Line 1\nTarget Line Text",
    )

    engine = RuleEngine()
    rule = {
        "id": "fixed_line_rule",
        "kind": "fixed_line",
        "line_number": 2,
    }
    extracted = engine.extract_field(doc, FieldKey.REFERENCE, rule)
    assert extracted.value == "Target Line Text"


def test_rule_fixed_line_range_uses_blank_preserving_raw_lines():
    lines = [
        DocumentLine(text="Line 1", page_index=0, line_index=0),
        DocumentLine(text="Target A", page_index=0, line_index=1),
        DocumentLine(text="Target B", page_index=0, line_index=2),
    ]
    doc = DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=tuple(lines)),),
        plain_text="Line 1\n\nTarget A\nTarget B",
        metadata={"raw_lines": ["Line 1", "", "Target A", "Target B"]},
    )

    engine = RuleEngine()
    rule = {
        "id": "fixed_range_rule",
        "kind": "fixed_line",
        "line_start": 3,
        "line_end": 4,
    }
    extracted = engine.extract_field(doc, FieldKey.INSPECTION_ADDRESS, rule)
    assert extracted.value == "Target A\nTarget B"


def test_rule_fixed_line_label():
    lines = [
        DocumentLine(text="Line 1", page_index=0, line_index=0),
        DocumentLine(text="Reference: SBL-12345", page_index=0, line_index=1),
    ]
    doc = DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=tuple(lines)),),
        plain_text="Line 1\nReference: SBL-12345",
    )

    engine = RuleEngine()
    rule = {
        "id": "fixed_line_label_rule",
        "kind": "fixed_line_label",
        "line_number": 2,
        "labels": ["Reference:"],
    }
    extracted = engine.extract_field(doc, FieldKey.REFERENCE, rule)
    assert extracted.value == "SBL-12345"


def test_rule_line_offset():
    lines = [
        DocumentLine(text="Find Me", page_index=0, line_index=0),
        DocumentLine(text="", page_index=0, line_index=1),
        DocumentLine(text="Target Value", page_index=0, line_index=2),
    ]
    doc = DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=tuple(lines)),),
        plain_text="Find Me\n\nTarget Value",
    )

    engine = RuleEngine()
    rule = {
        "id": "offset_rule",
        "kind": "line_offset",
        "labels": ["Find Me"],
        "offset": 1,
    }
    extracted = engine.extract_field(doc, FieldKey.REFERENCE, rule)
    assert extracted.value == "Target Value"
    assert extracted.source_span.line_index == 2


def test_rule_regex():
    doc = DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(),
        plain_text="Reference Number is REF-999-XYZ",
    )

    engine = RuleEngine()
    rule = {
        "id": "regex_rule",
        "kind": "regex",
        "pattern": r"REF-\d+-[A-Z]+",
    }
    extracted = engine.extract_field(doc, FieldKey.REFERENCE, rule)
    assert extracted.value == "REF-999-XYZ"


def test_rule_presence():
    doc = DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(),
        plain_text="The invoice contains VAT registration number.",
    )

    engine = RuleEngine()
    rule = {
        "id": "presence_rule",
        "kind": "presence",
        "tokens": ["vat number", "vat registration"],
        "value": "Yes",
    }
    extracted = engine.extract_field(doc, FieldKey.VAT_STATUS, rule)
    assert extracted.value == "Yes"


def test_rule_presence_absent_value():
    doc = DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(),
        plain_text="No tax marker here.",
    )

    engine = RuleEngine()
    rule = {
        "id": "presence_rule",
        "kind": "presence",
        "tokens": ["vat registration"],
        "value": "Yes",
        "absent_value": "No",
    }
    extracted = engine.extract_field(doc, FieldKey.VAT_STATUS, rule)
    assert extracted.value == "No"


def test_record_fallback_extracts_vrm_from_vehicle_context():
    lines = [
        DocumentLine(text="Vehicle Registration: AB12 CDE", page_index=0, line_index=0),
    ]
    doc = DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=tuple(lines)),),
        plain_text="Vehicle Registration: AB12 CDE",
    )

    engine = RuleEngine()
    record = engine.extract_record(doc, {"id": "p", "name": "Provider", "work_provider": "P", "field_rules": {}})
    assert record.fields[FieldKey.VRM].value == "AB12CDE"


def test_record_fallback_extracts_engineer_vehicle_model_from_exact_vehicle_label():
    lines = [
        DocumentLine(text="Vehicle: LEXUS NX 350H CVT", page_index=0, line_index=0),
        DocumentLine(text="Reg No: ML72YNF", page_index=0, line_index=1),
    ]
    doc = DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=tuple(lines)),),
        plain_text="\n".join(line.text for line in lines),
    )

    engine = RuleEngine()
    record = engine.extract_record(doc, {"id": "p", "name": "Provider", "work_provider": "P", "field_rules": {}})
    assert record.fields[FieldKey.VEHICLE_MODEL].value == "LEXUS NX 350H CVT"


def test_record_fallback_extracts_subject_reference_and_stops_address_at_contact_lines():
    lines = [
        DocumentLine(text="Subject: Kerr Brown Solicitors - Samual Stephen - AD/VRL/1/5241", page_index=0, line_index=0),
        DocumentLine(text="Client: Samual Stephen", page_index=0, line_index=1),
        DocumentLine(text="Address: 19A Garrier Road, Springside, Irvine, KA11 3AT", page_index=0, line_index=2),
        DocumentLine(text="Tele: 0781 086 5640", page_index=0, line_index=3),
        DocumentLine(text="Vehicle: Skoda Octavia", page_index=0, line_index=4),
        DocumentLine(text="Reg: YD72 KZX", page_index=0, line_index=5),
    ]
    doc = DocumentModel(
        source_path=Path("dummy.msg"),
        source_type="msg",
        pages=(DocumentPage(page_index=0, lines=tuple(lines)),),
        plain_text="\n".join(line.text for line in lines),
    )

    engine = RuleEngine()
    record = engine.extract_record(doc, {"id": "p", "name": "Provider", "work_provider": "P", "field_rules": {}})
    address = record.fields[FieldKey.INSPECTION_ADDRESS].value
    assert record.fields[FieldKey.REFERENCE].value == "AD/VRL/1/5241"
    assert "KA11 3AT" in address
    assert "Tele:" not in address
    assert "Vehicle:" not in address
    assert "Reg:" not in address


def test_record_fallback_recovers_oak_available_claimant_and_postcode_block():
    lines = [
        DocumentLine(text="Client reg: SG12 BLS", page_index=0, line_index=0),
        DocumentLine(text="The introducer is called Undent It.", page_index=0, line_index=1),
        DocumentLine(
            text="I have advised my client of your instruction. Please make arrangements for the inspection with my client. Mr Mohammad Butt is available at:",
            page_index=0,
            line_index=2,
        ),
        DocumentLine(text="Glasgow", page_index=0, line_index=3),
        DocumentLine(text="G53 7BB", page_index=0, line_index=4),
    ]
    doc = DocumentModel(
        source_path=Path("dummy.doc"),
        source_type="doc",
        pages=(DocumentPage(page_index=0, lines=tuple(lines)),),
        plain_text="\n".join(line.text for line in lines),
    )

    engine = RuleEngine()
    record = engine.extract_record(doc, {"id": "p", "name": "Provider", "work_provider": "P", "field_rules": {}})
    address = record.fields[FieldKey.INSPECTION_ADDRESS].value
    assert record.fields[FieldKey.CLAIMANT_NAME].value == "Mr Mohammad Butt"
    assert "Glasgow" in address
    assert "G53 7BB" in address
    assert "introducer" not in address.lower()


def test_rule_manual():
    doc = DocumentModel(source_path=Path("dummy.pdf"), source_type="pdf", pages=(), plain_text="")
    engine = RuleEngine()
    rule = {
        "id": "manual_rule",
        "kind": "manual",
        "value": "SBL Solicitors",
    }
    extracted = engine.extract_field(doc, FieldKey.WORK_PROVIDER, rule)
    assert extracted.value == "SBL Solicitors"


def test_rule_email_date():
    lines = [
        DocumentLine(text="Sent Date: 2026-05-31 16:57:31+01:00", page_index=0, line_index=0),
    ]
    doc = DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=tuple(lines)),),
        plain_text="Sent Date: 2026-05-31 16:57:31+01:00",
    )

    engine = RuleEngine()
    rule = {
        "id": "email_date_rule",
        "kind": "email_date",
        "labels": ["Sent Date:"],
    }
    extracted = engine.extract_field(doc, FieldKey.INSTRUCTION_DATE, rule)
    assert extracted.value == "31/05/2026"


# ---------------------------------------------------------------------------
# Image-based / desktop assessment inspection address (B3-style canonicalisation)
# ---------------------------------------------------------------------------

CANONICAL_IMAGE_BASED = IMAGE_BASED_ASSESSMENT + "\n\n\n\n\n"


def test_inspection_address_image_based_assessment_canonicalised():
    """'Image-based Assessment' must become the canonical value, not be blanked.

    Regression for the bug where the inspection-address narrative filter detected
    image-based wording and emptied the value (raw_value preserved but value="").
    """
    ext = _inspection_address_record("Image-based Assessment")
    assert ext.value == CANONICAL_IMAGE_BASED
    # raw_value is preserved exactly as extracted.
    assert ext.raw_value == "Image-based Assessment"


def test_inspection_address_desktop_inspection_canonicalised():
    ext = _inspection_address_record("Desktop Inspection")
    assert ext.value == CANONICAL_IMAGE_BASED
    assert ext.raw_value == "Desktop Inspection"


def test_inspection_address_image_based_variants_all_canonicalise():
    """Reasonable case-insensitive variants all map to the canonical value."""
    variants = [
        "image based assessment",
        "Image Based Assessment",
        "image-based",
        "image based",
        "desktop assessment",
        "desktop based",
        "Desktop-based",
        "electronic basis",
        "IMAGE-BASED ASSESSMENT",
        "  image-based assessment  ",
    ]
    for variant in variants:
        ext = _inspection_address_record(variant)
        assert ext.value == CANONICAL_IMAGE_BASED, f"variant {variant!r} -> {ext.value!r}"


def test_inspection_address_junk_narrative_still_blanked():
    """Genuine junk narrative is still emptied, exactly as before the fix."""
    for junk in [
        "Kind regards, John Smith",
        "Please contact our office for details",
        "We await your report",
        "instructions@example.com",
    ]:
        ext = _inspection_address_record(junk)
        assert ext.value == "", f"junk {junk!r} should blank, got {ext.value!r}"


def test_inspection_address_real_physical_address_unchanged():
    """A real physical address is preserved and not replaced by the canonical value."""
    lines = [
        DocumentLine(text="Somstar Recovery", page_index=0, line_index=0),
        DocumentLine(text="Somstar House", page_index=0, line_index=1),
        DocumentLine(text="Birmingham", page_index=0, line_index=2),
        DocumentLine(text="B5 6JX", page_index=0, line_index=3),
    ]
    doc = DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=tuple(lines)),),
        plain_text="\n".join(line.text for line in lines),
        metadata={"raw_lines": [line.text for line in lines]},
    )
    provider = {
        "id": "p",
        "name": "Provider",
        "work_provider": "P",
        "field_rules": {
            "inspection_address": {
                "id": "inspection_address",
                "kind": "fixed_line",
                "line_start": 1,
                "line_end": 4,
            }
        },
    }
    record = RuleEngine().extract_record(doc, provider)
    value = record.fields[FieldKey.INSPECTION_ADDRESS].value
    assert value != CANONICAL_IMAGE_BASED
    assert "Somstar" in value
    assert "B5 6JX" in value


def test_inspection_address_real_address_with_image_wording_keeps_address():
    """Precedence: when BOTH a real address (postcode) and image-based wording are
    present, the physical address wins -- the canonical value is NOT emitted."""
    lines = [
        DocumentLine(text="Assessment to be image based", page_index=0, line_index=0),
        DocumentLine(text="12 High Street", page_index=0, line_index=1),
        DocumentLine(text="Birmingham", page_index=0, line_index=2),
        DocumentLine(text="B5 6JX", page_index=0, line_index=3),
    ]
    doc = DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=tuple(lines)),),
        plain_text="\n".join(line.text for line in lines),
        metadata={"raw_lines": [line.text for line in lines]},
    )
    provider = {
        "id": "p",
        "name": "Provider",
        "work_provider": "P",
        "field_rules": {
            "inspection_address": {
                "id": "inspection_address",
                "kind": "fixed_line",
                "line_start": 1,
                "line_end": 4,
            }
        },
    }
    record = RuleEngine().extract_record(doc, provider)
    value = record.fields[FieldKey.INSPECTION_ADDRESS].value
    assert value != CANONICAL_IMAGE_BASED
    assert "B5 6JX" in value


def test_is_image_based_inspection_helper():
    """Unit checks for the detection helper, including the real-address precedence."""
    engine = RuleEngine()
    assert engine._is_image_based_inspection("Image-based Assessment") is True
    assert engine._is_image_based_inspection("Desktop Inspection") is True
    assert engine._is_image_based_inspection("electronic basis") is True
    # Real address present (postcode) -> not treated as image-based.
    assert engine._is_image_based_inspection("Image-based, 1 High St, B5 6JX") is False
    # Genuine junk -> not image-based.
    assert engine._is_image_based_inspection("kind regards") is False
    assert engine._is_image_based_inspection("") is False


def test_inspection_address_canonical_value_passes_eva_schema():
    """The canonical value must satisfy the 6-line EVA Inspection Address contract
    and survive schema validation in the EVA JSON exporter."""
    import json

    from cedocumentmapper_v2.exporters.eva_json import EVAJsonExporter

    lines = [
        DocumentLine(text="Vehicle Reg: AB12CDE", page_index=0, line_index=0),
        DocumentLine(text="Make/Model: Skoda Superb", page_index=0, line_index=1),
        DocumentLine(text="Claimant Name: John Smith", page_index=0, line_index=2),
        DocumentLine(text="Reference: SBL-123", page_index=0, line_index=3),
        DocumentLine(text="Accident Date: 01/01/2026", page_index=0, line_index=4),
        DocumentLine(text="Instruction Date: 02/01/2026", page_index=0, line_index=5),
        DocumentLine(text="Inspection Address: Image-based Assessment", page_index=0, line_index=6),
    ]
    doc = _doc(lines)
    provider = {
        "id": "sbl",
        "name": "SBL",
        "work_provider": "SBL",
        "field_rules": {
            "vrm": {"id": "r", "kind": "label_same_line", "labels": ["Vehicle Reg"]},
            "vehicle_model": {"id": "r", "kind": "label_same_line", "labels": ["Make/Model"]},
            "claimant_name": {"id": "r", "kind": "label_same_line", "labels": ["Claimant Name"]},
            "reference": {"id": "r", "kind": "label_same_line", "labels": ["Reference"]},
            "incident_date": {"id": "r", "kind": "label_same_line", "labels": ["Accident Date"]},
            "instruction_date": {"id": "r", "kind": "label_same_line", "labels": ["Instruction Date"]},
            "inspection_address": {
                "id": "r",
                "kind": "label_same_line",
                "labels": ["Inspection Address"],
            },
        },
    }
    record = RuleEngine().extract_record(doc, provider)
    # export() validates against the EVA JSON schema and raises on failure.
    exported = json.loads(EVAJsonExporter().export(record))
    assert exported["Inspection Address"] == CANONICAL_IMAGE_BASED

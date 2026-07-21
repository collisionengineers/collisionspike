"""Isolated unit tests for the EPIC-04 rule-failure contract and the EPIC-01
domain field constants.

These guard two invariants that the rest of the pipeline relies on:

EPIC-04 (rule-failure contract): ``RuleEngine.extract_field`` must never raise
for a runtime extraction failure. Instead it returns an empty ``FieldExtraction``
carrying an ``ExtractionIssue`` (``invalid_rule_kind`` for an unknown ``kind``,
``extraction_failure`` for a crashing rule). The one documented exception is an
invalid *config* (e.g. a malformed regex pattern), which is allowed to raise.

EPIC-01 (domain constants): ``REQUIRED_FIELDS`` / ``FIELD_ORDER`` membership and
the concrete required-field set are pinned so accidental drift is caught.
"""

from pathlib import Path

from cedocumentmapper_v2.domain.models import (
    DocumentLine,
    DocumentModel,
    DocumentPage,
    ExtractionIssue,
    FieldExtraction,
    FieldKey,
    FIELD_ORDER,
    REQUIRED_FIELDS,
)
from cedocumentmapper_v2.rules import RuleEngine


def _doc(lines: list[DocumentLine] | None = None, plain_text: str | None = None) -> DocumentModel:
    lines = lines or [DocumentLine(text="Vehicle Reg: AA11BBB", page_index=0, line_index=0)]
    return DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=tuple(lines)),),
        plain_text=plain_text if plain_text is not None else "\n".join(line.text for line in lines),
    )


# ---------------------------------------------------------------------------
# EPIC-04: rule-failure contract
# ---------------------------------------------------------------------------


def test_unknown_rule_kind_returns_empty_value_and_issue_without_raising():
    """An unrecognised ``kind`` yields an empty value + an ``invalid_rule_kind``
    error issue, and must not raise."""
    engine = RuleEngine()
    result = engine.extract_field(_doc(), FieldKey.VRM, {"id": "r", "kind": "totally_bogus_kind"})

    assert isinstance(result, FieldExtraction)
    assert result.value == ""
    assert len(result.issues) == 1
    issue = result.issues[0]
    assert isinstance(issue, ExtractionIssue)
    assert issue.code == "invalid_rule_kind"
    assert issue.severity == "error"
    assert issue.field == FieldKey.VRM
    assert "totally_bogus_kind" in issue.message


def test_missing_kind_defaults_and_does_not_raise():
    """A rule config with no ``kind`` falls back to the default handler and
    returns a FieldExtraction (no crash)."""
    engine = RuleEngine()
    result = engine.extract_field(_doc(), FieldKey.VRM, {"id": "r", "labels": ["Vehicle Reg"]})
    assert isinstance(result, FieldExtraction)
    assert result.value == "AA11BBB"


def test_rule_crash_is_captured_as_extraction_failure_issue(monkeypatch):
    """If a rule handler raises at runtime, ``extract_field`` must swallow it and
    return an empty value carrying an ``extraction_failure`` issue."""
    engine = RuleEngine()

    def _boom(*args, **kwargs):
        raise RuntimeError("kaboom")

    # The presence handler is dispatched for kind == "presence"; force it to crash.
    monkeypatch.setattr(engine, "_extract_presence", _boom)

    result = engine.extract_field(
        _doc(), FieldKey.VAT_STATUS, {"id": "r", "kind": "presence", "tokens": ["vat"]}
    )

    assert isinstance(result, FieldExtraction)
    assert result.value == ""
    assert len(result.issues) == 1
    issue = result.issues[0]
    assert issue.code == "extraction_failure"
    assert issue.severity == "error"
    assert issue.field == FieldKey.VAT_STATUS
    assert "kaboom" in issue.message


def test_invalid_regex_config_is_captured_not_propagated():
    """A malformed regex pattern is raised by the handler (a config error) but is
    caught by ``extract_field`` and surfaced as an ``extraction_failure`` issue
    rather than propagating to the caller."""
    engine = RuleEngine()
    result = engine.extract_field(
        _doc(), FieldKey.REFERENCE, {"id": "r", "kind": "regex", "pattern": "([unclosed"}
    )
    assert isinstance(result, FieldExtraction)
    assert result.value == ""
    assert len(result.issues) == 1
    assert result.issues[0].code == "extraction_failure"
    assert result.issues[0].field == FieldKey.REFERENCE


def test_no_match_returns_empty_without_issue():
    """A well-formed rule that simply finds nothing returns an empty value and no
    issue (a clean miss is not a failure)."""
    engine = RuleEngine()
    result = engine.extract_field(
        _doc(), FieldKey.VRM, {"id": "r", "kind": "label_same_line", "labels": ["No Such Label Here"]}
    )
    assert result.value == ""
    assert result.issues == ()


# ---------------------------------------------------------------------------
# EPIC-01: domain field constants (drift guards)
# ---------------------------------------------------------------------------


def test_required_fields_exact_membership():
    """Pin the exact required-field set so drift is caught."""
    assert REQUIRED_FIELDS == frozenset(
        {
            FieldKey.WORK_PROVIDER,
            FieldKey.VRM,
            FieldKey.VEHICLE_MODEL,
            FieldKey.CLAIMANT_NAME,
            FieldKey.REFERENCE,
            FieldKey.INCIDENT_DATE,
            FieldKey.INSTRUCTION_DATE,
        }
    )


def test_required_fields_are_a_subset_of_field_order():
    """Every required field must be a known, ordered field."""
    assert REQUIRED_FIELDS.issubset(set(FIELD_ORDER))


def test_field_order_covers_every_field_key_exactly_once():
    """FIELD_ORDER must enumerate every FieldKey with no duplicates or omissions."""
    assert set(FIELD_ORDER) == set(FieldKey)
    assert len(FIELD_ORDER) == len(set(FIELD_ORDER)) == len(list(FieldKey))


def test_required_fields_do_not_include_optional_fields():
    """Optional fields must never creep into the required set."""
    optional = set(FIELD_ORDER) - REQUIRED_FIELDS
    assert FieldKey.INSPECTION_DATE in optional
    assert FieldKey.INSPECTION_ADDRESS in optional
    assert FieldKey.ACCIDENT_CIRCUMSTANCES in optional
    assert FieldKey.VAT_STATUS in optional
    assert FieldKey.MILEAGE in optional
    assert FieldKey.MILEAGE_UNIT in optional

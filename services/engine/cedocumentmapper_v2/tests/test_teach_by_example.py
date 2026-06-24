"""Tests for teach-by-example rule synthesis (extraction/teach.py).

The core contract: given a labelled example (a field + the correct value + where
it appeared), ``synthesize_rules`` proposes a provider rule config in the v2 rule
schema; feeding that config back through ``RuleEngine.extract_field`` on the same
document re-extracts the value. We exercise several layouts (same-line label,
next-line label, regex-shape fallback) and the no-op cases.

Synthesis is pure (it never mutates providers.json and never runs the engine);
the round-trip through the engine is performed here, in the test, to prove the
proposed config actually works.
"""

from __future__ import annotations

from pathlib import Path

from cedocumentmapper_v2.domain.models import (
    DocumentLine,
    DocumentModel,
    DocumentPage,
    FieldKey,
)
from cedocumentmapper_v2.extraction import (
    RuleProposal,
    TeachExample,
    synthesize_rule,
    synthesize_rules,
)
from cedocumentmapper_v2.rules import RuleEngine


# --- helpers ---------------------------------------------------------------


def _doc(lines: list[str]) -> DocumentModel:
    doc_lines = tuple(
        DocumentLine(text=text, page_index=0, line_index=i)
        for i, text in enumerate(lines)
    )
    return DocumentModel(
        source_path=Path("dummy.txt"),
        source_type="txt",
        pages=(DocumentPage(page_index=0, lines=doc_lines),),
        plain_text="\n".join(lines),
        metadata={"raw_lines": list(lines)},
    )


def _roundtrip(doc: DocumentModel, proposal: RuleProposal) -> str:
    """Feed a proposed rule config back through the engine; return the value."""
    return RuleEngine().extract_field(
        doc, proposal.field, proposal.rule_config
    ).value


# --- same-line label layout ------------------------------------------------


def test_same_line_label_synthesizes_label_same_line_rule():
    doc = _doc(["Some heading", "Vehicle Registration: AB12 CDE", "Footer"])
    example = TeachExample(field=FieldKey.VRM, value="AB12 CDE")

    best = synthesize_rule(doc, example)
    assert best is not None
    assert best.rule_config["kind"] == "label_same_line"
    assert best.matched_label == "Vehicle Registration"
    assert best.rule_config["labels"] == ["Vehicle Registration"]

    # Round-trip: the proposed rule re-extracts the value via the engine.
    assert _roundtrip(doc, best) == "AB12 CDE"


def test_same_line_pipe_separator():
    doc = _doc(["Make/Model | Toyota Prius"])
    example = TeachExample(field=FieldKey.VEHICLE_MODEL, value="Toyota Prius")

    best = synthesize_rule(doc, example)
    assert best is not None
    assert best.rule_config["kind"] == "label_same_line"
    assert _roundtrip(doc, best) == "Toyota Prius"


def test_same_line_dash_separator():
    doc = _doc(["Claimant - John Smith"])
    example = TeachExample(field=FieldKey.CLAIMANT_NAME, value="John Smith")

    best = synthesize_rule(doc, example)
    assert best is not None
    assert best.rule_config["kind"] == "label_same_line"
    assert best.matched_label == "Claimant"
    assert _roundtrip(doc, best) == "John Smith"


# --- next-line label layout ------------------------------------------------


def test_next_line_label_synthesizes_label_next_line_rule():
    doc = _doc(["Vehicle Registration", "AB12 CDE", "Mileage", "42000"])
    example = TeachExample(field=FieldKey.VRM, value="AB12 CDE")

    proposals = synthesize_rules(doc, example)
    # The label_next_line proposal must be present and round-trip cleanly.
    next_line = next(
        (p for p in proposals if p.rule_config["kind"] == "label_next_line"), None
    )
    assert next_line is not None
    assert next_line.rule_config["labels"] == ["Vehicle Registration"]
    assert _roundtrip(doc, next_line) == "AB12 CDE"

    # And it should be the top-ranked proposal for this layout.
    assert proposals[0].rule_config["kind"] == "label_next_line"


def test_line_index_hint_disambiguates_repeated_value():
    # The value "Smith" appears twice; the line_index hint pins the right one.
    doc = _doc(
        [
            "Driver Name: Smith",
            "unrelated Smith mention",
            "Owner Name: Smith",
        ]
    )
    example = TeachExample(
        field=FieldKey.CLAIMANT_NAME, value="Smith", page_index=0, line_index=2
    )
    best = synthesize_rule(doc, example)
    assert best is not None
    assert best.matched_label == "Owner Name"


# --- regex-shape fallback (no usable label) --------------------------------


def test_regex_shape_fallback_when_no_label():
    # Value stands alone with no label token preceding it on/around the line.
    doc = _doc(["AB12 CDE", "free flowing prose that is not a label at all really"])
    example = TeachExample(field=FieldKey.VRM, value="AB12 CDE")

    proposals = synthesize_rules(doc, example)
    kinds = {p.rule_config["kind"] for p in proposals}
    assert "regex" in kinds
    regex_proposal = next(p for p in proposals if p.rule_config["kind"] == "regex")
    assert _roundtrip(doc, regex_proposal) == "AB12 CDE"


def test_fixed_line_is_always_offered_as_last_resort():
    doc = _doc(["Heading", "Some plain value here"])
    example = TeachExample(field=FieldKey.REFERENCE, value="Some plain value here")

    proposals = synthesize_rules(doc, example)
    fixed = next(
        (p for p in proposals if p.rule_config["kind"] == "fixed_line"), None
    )
    assert fixed is not None
    assert fixed.rule_config["line_number"] == 2
    assert _roundtrip(doc, fixed) == "Some plain value here"
    # fixed_line is the lowest-confidence option.
    assert proposals[-1].rule_config["kind"] == "fixed_line"


# --- no-op / edge cases ----------------------------------------------------


def test_value_not_in_document_yields_no_proposals():
    doc = _doc(["nothing relevant here"])
    example = TeachExample(field=FieldKey.VRM, value="ZZ99 ZZZ")
    assert synthesize_rules(doc, example) == []
    assert synthesize_rule(doc, example) is None


def test_empty_value_yields_no_proposals():
    doc = _doc(["Vehicle Registration: AB12 CDE"])
    example = TeachExample(field=FieldKey.VRM, value="   ")
    assert synthesize_rules(doc, example) == []


def test_proposals_are_ranked_best_first():
    doc = _doc(["Vehicle Registration: AB12 CDE"])
    example = TeachExample(field=FieldKey.VRM, value="AB12 CDE")
    proposals = synthesize_rules(doc, example)
    confidences = [p.confidence for p in proposals]
    assert confidences == sorted(confidences, reverse=True)


def test_synthesis_does_not_mutate_or_run_engine():
    # Pure: proposing a rule must not require a provider and must not touch
    # disk. We simply assert it returns plain dicts in the v2 schema shape.
    doc = _doc(["Vehicle Registration: AB12 CDE"])
    best = synthesize_rule(doc, TeachExample(field=FieldKey.VRM, value="AB12 CDE"))
    assert best is not None
    assert set(best.rule_config) >= {"id", "kind"}
    assert isinstance(best.rule_config["id"], str)

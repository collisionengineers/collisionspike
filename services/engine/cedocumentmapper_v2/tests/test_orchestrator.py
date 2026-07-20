"""Tests for the field-extraction strategy layer + orchestrator.

Covers:
  * RuleStrategy reproduces the rule-engine result for a sample document.
  * GeometryTableStrategy primitives (right_of / below / in_cell).
  * The orchestrator picks the higher-confidence candidate across two fakes.
  * Conflict routing (close, disagreeing candidates) -> needs review.
  * Low-confidence + no-candidate routing -> needs review.
  * Provenance records the winner and every candidate considered.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Sequence

from cedocumentmapper_v2.domain.models import (
    DocumentLine,
    DocumentModel,
    DocumentPage,
    FieldKey,
    SourceSpan,
    Table,
)
from cedocumentmapper_v2.extraction import (
    Candidate,
    FieldExtractionOrchestrator,
    GeometryTableStrategy,
    RuleStrategy,
    Strategy,
)
from cedocumentmapper_v2.rules import RuleEngine


# --- helpers ---------------------------------------------------------------


def _doc(lines: list[DocumentLine], tables: tuple[Table, ...] = ()) -> DocumentModel:
    return DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=tuple(lines), tables=tables),),
        plain_text="\n".join(line.text for line in lines),
    )


class _FakeStrategy:
    """Emits a fixed list of candidates regardless of input."""

    def __init__(self, name: str, candidates: Sequence[Candidate]) -> None:
        self.name = name
        self._candidates = tuple(candidates)

    def propose(
        self,
        document: DocumentModel,
        provider: dict[str, Any] | None,
        fields: Sequence[FieldKey],
    ) -> Sequence[Candidate]:
        wanted = set(fields)
        return tuple(c for c in self._candidates if c.field in wanted)


# --- base protocol ---------------------------------------------------------


def test_fake_and_real_strategies_satisfy_protocol():
    assert isinstance(RuleStrategy(), Strategy)
    assert isinstance(GeometryTableStrategy(), Strategy)
    assert isinstance(_FakeStrategy("x", ()), Strategy)


# --- RuleStrategy reproduces the engine ------------------------------------


def _vrm_provider() -> dict[str, Any]:
    return {
        "id": "p",
        "name": "Provider",
        "work_provider": "P",
        "field_rules": {
            "vrm": {"id": "vrm_rule", "kind": "label_same_line", "labels": ["Vehicle Reg"]},
        },
    }


def test_rule_strategy_reproduces_rule_engine_result():
    doc = _doc([DocumentLine(text="Vehicle Reg: AA11BBB", page_index=0, line_index=0)])
    provider = _vrm_provider()

    # Ground truth straight from the engine.
    record = RuleEngine().extract_record(doc, provider)
    engine_vrm = record.fields[FieldKey.VRM]

    strategy = RuleStrategy()
    candidates = strategy.propose(doc, provider, (FieldKey.VRM,))
    vrm_candidates = [c for c in candidates if c.field == FieldKey.VRM]

    assert len(vrm_candidates) == 1
    candidate = vrm_candidates[0]
    assert candidate.value == engine_vrm.value
    assert candidate.rule_id == engine_vrm.rule_id
    assert candidate.confidence == engine_vrm.confidence
    assert candidate.strategy_name == "rule_engine"


def test_rule_strategy_no_provider_yields_nothing():
    doc = _doc([DocumentLine(text="Vehicle Reg: AA11BBB", page_index=0, line_index=0)])
    assert RuleStrategy().propose(doc, None, (FieldKey.VRM,)) == ()


def test_rule_strategy_propose_field_single_rule():
    doc = _doc([DocumentLine(text="Vehicle Reg: AA11BBB", page_index=0, line_index=0)])
    rule = {"id": "vrm_rule", "kind": "label_same_line", "labels": ["Vehicle Reg"]}
    candidate = RuleStrategy().propose_field(doc, FieldKey.VRM, rule)
    assert candidate is not None
    assert candidate.value == "AA11BBB"


# --- GeometryTableStrategy primitives --------------------------------------


def test_geometry_right_of_finds_value_to_the_right():
    lines = [
        DocumentLine(text="VRM", page_index=0, line_index=0, bbox=(0.0, 0.0, 30.0, 10.0)),
        DocumentLine(text="AB12 CDE", page_index=0, line_index=1, bbox=(40.0, 1.0, 90.0, 11.0)),
    ]
    strategy = GeometryTableStrategy({FieldKey.VRM: {"method": "right_of", "label": "VRM"}})
    candidates = strategy.propose(_doc(lines), None, (FieldKey.VRM,))
    assert len(candidates) == 1
    assert candidates[0].value == "AB12 CDE"
    assert candidates[0].rule_id == "geometry:right_of"


def test_geometry_below_finds_value_underneath():
    lines = [
        DocumentLine(text="Mileage", page_index=0, line_index=0, bbox=(0.0, 0.0, 50.0, 10.0)),
        DocumentLine(text="42,000", page_index=0, line_index=1, bbox=(2.0, 15.0, 60.0, 25.0)),
    ]
    strategy = GeometryTableStrategy({FieldKey.MILEAGE: {"method": "below", "label": "Mileage"}})
    candidates = strategy.propose(_doc(lines), None, (FieldKey.MILEAGE,))
    assert len(candidates) == 1
    assert candidates[0].value == "42,000"
    assert candidates[0].rule_id == "geometry:below"


def test_geometry_in_cell_by_header():
    table = Table(rows=(("Reg", "Make"), ("AB12 CDE", "Toyota")), page_index=0)
    strategy = GeometryTableStrategy(
        {FieldKey.VRM: {"method": "in_cell", "header": "Reg", "row": 1}}
    )
    candidates = strategy.propose(_doc([], tables=(table,)), None, (FieldKey.VRM,))
    assert len(candidates) == 1
    assert candidates[0].value == "AB12 CDE"
    assert candidates[0].rule_id == "geometry:in_cell"


def test_geometry_in_cell_by_explicit_col():
    table = Table(rows=(("Reg", "Make"), ("AB12 CDE", "Toyota")), page_index=0)
    strategy = GeometryTableStrategy(
        {FieldKey.VEHICLE_MODEL: {"method": "in_cell", "col": 1, "row": 1}}
    )
    candidates = strategy.propose(_doc([], tables=(table,)), None, (FieldKey.VEHICLE_MODEL,))
    assert len(candidates) == 1
    assert candidates[0].value == "Toyota"


def test_geometry_missing_label_yields_nothing():
    lines = [DocumentLine(text="something", page_index=0, line_index=0, bbox=(0.0, 0.0, 10.0, 10.0))]
    strategy = GeometryTableStrategy({FieldKey.VRM: {"method": "right_of", "label": "VRM"}})
    assert strategy.propose(_doc(lines), None, (FieldKey.VRM,)) == ()


def test_geometry_malformed_hint_is_skipped():
    # Missing "label" -> no candidate, no raise.
    strategy = GeometryTableStrategy({FieldKey.VRM: {"method": "right_of"}})
    assert strategy.propose(_doc([]), None, (FieldKey.VRM,)) == ()


# --- orchestrator: winner selection ----------------------------------------


def _cand(field: FieldKey, value: str, conf: float, name: str) -> Candidate:
    return Candidate(field=field, value=value, confidence=conf, strategy_name=name)


def test_orchestrator_picks_higher_confidence_across_two_strategies():
    low = _FakeStrategy("low", [_cand(FieldKey.VRM, "WRONG1", 0.4, "low")])
    high = _FakeStrategy("high", [_cand(FieldKey.VRM, "AB12CDE", 0.95, "high")])
    orch = FieldExtractionOrchestrator([low, high])

    result = orch.extract(_doc([]), provider={"id": "p", "name": "P"}, fields=(FieldKey.VRM,))

    assert result.fields[FieldKey.VRM].value == "AB12CDE"
    prov = result.provenance[FieldKey.VRM]
    assert prov.winner is not None
    assert prov.winner.strategy_name == "high"
    # Both candidates recorded, ranked best-first.
    assert len(prov.candidates) == 2
    assert prov.candidates[0].confidence == 0.95
    assert FieldKey.VRM not in result.needs_review


def test_orchestrator_tie_break_is_deterministic_by_strategy_order():
    first = _FakeStrategy("first", [_cand(FieldKey.VRM, "FROM_FIRST", 0.8, "first")])
    second = _FakeStrategy("second", [_cand(FieldKey.VRM, "FROM_SECOND", 0.8, "second")])
    # Equal confidence + disagreeing -> conflict (review), but the leader is
    # deterministically the earlier-declared strategy.
    orch = FieldExtractionOrchestrator([first, second])
    result = orch.extract(_doc([]), provider={"id": "p"}, fields=(FieldKey.VRM,))
    assert result.provenance[FieldKey.VRM].winner.strategy_name == "first"


# --- orchestrator: review routing ------------------------------------------


def test_orchestrator_routes_conflict_to_review():
    a = _FakeStrategy("a", [_cand(FieldKey.VRM, "AB12CDE", 0.85, "a")])
    b = _FakeStrategy("b", [_cand(FieldKey.VRM, "XY99ZZZ", 0.80, "b")])
    orch = FieldExtractionOrchestrator([a, b], conflict_margin=0.1)

    result = orch.extract(_doc([]), provider={"id": "p"}, fields=(FieldKey.VRM,))

    assert FieldKey.VRM in result.needs_review
    assert result.provenance[FieldKey.VRM].review_reason == "conflict"
    # The leader still wins the value despite being flagged.
    assert result.fields[FieldKey.VRM].value == "AB12CDE"


def test_orchestrator_no_conflict_when_close_candidates_agree():
    a = _FakeStrategy("a", [_cand(FieldKey.VRM, "AB12 CDE", 0.85, "a")])
    b = _FakeStrategy("b", [_cand(FieldKey.VRM, "ab12 cde", 0.80, "b")])
    orch = FieldExtractionOrchestrator([a, b], conflict_margin=0.1)
    result = orch.extract(_doc([]), provider={"id": "p"}, fields=(FieldKey.VRM,))
    assert FieldKey.VRM not in result.needs_review


def test_orchestrator_routes_low_confidence_to_review():
    weak = _FakeStrategy("weak", [_cand(FieldKey.VRM, "AB12CDE", 0.3, "weak")])
    orch = FieldExtractionOrchestrator([weak], review_threshold=0.6)
    result = orch.extract(_doc([]), provider={"id": "p"}, fields=(FieldKey.VRM,))
    assert FieldKey.VRM in result.needs_review
    assert result.provenance[FieldKey.VRM].review_reason == "low_confidence"


def test_orchestrator_routes_missing_field_to_review():
    empty = _FakeStrategy("empty", [])
    orch = FieldExtractionOrchestrator([empty])
    result = orch.extract(_doc([]), provider={"id": "p"}, fields=(FieldKey.VRM,))
    assert FieldKey.VRM in result.needs_review
    assert result.provenance[FieldKey.VRM].review_reason == "no_candidate"
    assert result.fields[FieldKey.VRM].value == ""
    assert result.provenance[FieldKey.VRM].winner is None


def test_orchestrator_handles_strategy_exception_gracefully():
    class _Boom:
        name = "boom"

        def propose(self, document, provider, fields):
            raise RuntimeError("boom")

    good = _FakeStrategy("good", [_cand(FieldKey.VRM, "AB12CDE", 0.9, "good")])
    orch = FieldExtractionOrchestrator([_Boom(), good])
    result = orch.extract(_doc([]), provider={"id": "p"}, fields=(FieldKey.VRM,))
    assert result.fields[FieldKey.VRM].value == "AB12CDE"


# --- end-to-end: RuleStrategy + GeometryTableStrategy via orchestrator ------


def test_orchestrator_combines_rule_and_geometry_strategies():
    lines = [
        DocumentLine(text="Vehicle Reg: AB12CDE", page_index=0, line_index=0, bbox=(0.0, 0.0, 100.0, 10.0)),
        DocumentLine(text="Mileage", page_index=0, line_index=1, bbox=(0.0, 20.0, 50.0, 30.0)),
        DocumentLine(text="42,000", page_index=0, line_index=2, bbox=(2.0, 35.0, 60.0, 45.0)),
    ]
    doc = _doc(lines)
    provider = _vrm_provider()

    rule = RuleStrategy()
    geometry = GeometryTableStrategy(
        {FieldKey.MILEAGE: {"method": "below", "label": "Mileage", "confidence": 0.8}}
    )
    orch = FieldExtractionOrchestrator([rule, geometry])

    result = orch.extract(doc, provider=provider, fields=(FieldKey.VRM, FieldKey.MILEAGE))

    assert result.fields[FieldKey.VRM].value == "AB12CDE"
    assert result.provenance[FieldKey.VRM].winner.strategy_name == "rule_engine"
    assert result.fields[FieldKey.MILEAGE].value == "42,000"
    assert result.provenance[FieldKey.MILEAGE].winner.strategy_name == "geometry_table"

"""Tests for the opt-in, offline local-model extraction assist.

Covers:
  * Off by default / endpoint unset -> no-op, NO HTTP call.
  * Active (flag on + endpoint) -> only fires for Unknown providers.
  * Mocked backend -> schema-valid, source-cited Candidates with review-only marking.
  * Uncitable model output (snippet not in document) is discarded.
  * Invalid model output (bad JSON, wrong types, unknown field) is discarded.
  * Confidence is clamped below the review threshold (never overrides determinism).
  * Strategy satisfies the Strategy protocol; transport errors degrade to [].

No test makes a real network call — the HTTP transport is always injected/mocked.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from cedocumentmapper_v2.config import LLMAssistSettings
from cedocumentmapper_v2.domain.models import (
    DocumentLine,
    DocumentModel,
    DocumentPage,
    FieldKey,
)
from cedocumentmapper_v2.extraction import (
    FieldExtractionOrchestrator,
    LLMAssistStrategy,
    MAX_LLM_CONFIDENCE,
    RuleStrategy,
    Strategy,
)
from cedocumentmapper_v2.extraction.llm_assist import STRATEGY_NAME
from cedocumentmapper_v2.extraction.orchestrator import DEFAULT_REVIEW_THRESHOLD


# --- helpers ---------------------------------------------------------------


def _doc(lines: list[str]) -> DocumentModel:
    doc_lines = tuple(
        DocumentLine(text=t, page_index=0, line_index=i) for i, t in enumerate(lines)
    )
    return DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=doc_lines),),
        plain_text="\n".join(lines),
    )


def _active_settings(**over: Any) -> LLMAssistSettings:
    base = dict(
        enabled=True,
        endpoint="http://localhost:11434/v1",
        model="test-model",
        temperature=0.0,
        timeout=5.0,
    )
    base.update(over)
    return LLMAssistSettings(**base)


def _chat_response(obj: dict[str, Any]) -> dict[str, Any]:
    """Wrap a content object in an OpenAI-compatible chat response envelope."""
    return {"choices": [{"message": {"content": json.dumps(obj)}}]}


class _SpyPoster:
    """Records calls so tests can assert HTTP was / was not attempted."""

    def __init__(self, response: dict[str, Any] | Exception | None = None) -> None:
        self.calls: list[tuple[str, dict[str, Any], float]] = []
        self._response = response

    def __call__(self, url: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
        self.calls.append((url, payload, timeout))
        if isinstance(self._response, Exception):
            raise self._response
        assert self._response is not None
        return self._response


_SAMPLE_DOC = _doc(
    [
        "Vehicle Registration: AB12 CDE",
        "Claimant: Jane Roe",
        "Mileage recorded at inspection: 54321 miles",
    ]
)


# --- protocol --------------------------------------------------------------


def test_strategy_satisfies_protocol():
    assert isinstance(LLMAssistStrategy(settings=_active_settings()), Strategy)


# --- off by default / not configured: NO HTTP ------------------------------


def test_disabled_flag_is_noop_no_http():
    spy = _SpyPoster(_chat_response({}))
    strat = LLMAssistStrategy(
        settings=LLMAssistSettings(enabled=False, endpoint="http://localhost:11434/v1"),
        http_poster=spy,
    )
    result = strat.propose(_SAMPLE_DOC, None, list(FieldKey))
    assert result == ()
    assert spy.calls == []  # never touched the network


def test_endpoint_unset_is_noop_no_http():
    spy = _SpyPoster(_chat_response({}))
    strat = LLMAssistStrategy(
        settings=LLMAssistSettings(enabled=True, endpoint=None),
        http_poster=spy,
    )
    result = strat.propose(_SAMPLE_DOC, None, list(FieldKey))
    assert result == ()
    assert spy.calls == []


def test_settings_from_env_off_by_default(monkeypatch):
    for var in ("CEDM_LLM_ASSIST", "CEDM_LLM_ENDPOINT", "CEDM_LLM_MODEL"):
        monkeypatch.delenv(var, raising=False)
    settings = LLMAssistSettings.from_env()
    assert settings.enabled is False
    assert settings.is_active is False


def test_settings_from_env_needs_both_flag_and_endpoint(monkeypatch):
    monkeypatch.setenv("CEDM_LLM_ASSIST", "1")
    monkeypatch.delenv("CEDM_LLM_ENDPOINT", raising=False)
    assert LLMAssistSettings.from_env().is_active is False

    monkeypatch.setenv("CEDM_LLM_ENDPOINT", "http://localhost:11434/v1")
    monkeypatch.setenv("CEDM_LLM_MODEL", "llama3.1")
    active = LLMAssistSettings.from_env()
    assert active.is_active is True
    assert active.endpoint == "http://localhost:11434/v1"
    assert active.model == "llama3.1"


# --- Unknown providers only ------------------------------------------------


def test_mapped_provider_is_noop_no_http():
    spy = _SpyPoster(_chat_response({}))
    strat = LLMAssistStrategy(settings=_active_settings(), http_poster=spy)
    provider = {"id": "p", "name": "Acme"}
    result = strat.propose(_SAMPLE_DOC, provider, list(FieldKey))
    assert result == ()
    assert spy.calls == []


def test_empty_document_is_noop_no_http():
    spy = _SpyPoster(_chat_response({}))
    strat = LLMAssistStrategy(settings=_active_settings(), http_poster=spy)
    empty = _doc([])
    result = strat.propose(empty, None, list(FieldKey))
    assert result == ()
    assert spy.calls == []


# --- happy path: schema-valid, source-cited --------------------------------


def test_valid_cited_candidates_are_returned_review_only():
    model_json = {
        FieldKey.VRM.value: {
            "value": "AB12 CDE",
            "source": "Vehicle Registration: AB12 CDE",
            "confidence": 0.9,
        },
        FieldKey.CLAIMANT_NAME.value: {
            "value": "Jane Roe",
            "source": "Claimant: Jane Roe",
            "confidence": 0.8,
        },
    }
    spy = _SpyPoster(_chat_response(model_json))
    strat = LLMAssistStrategy(settings=_active_settings(), http_poster=spy)

    result = strat.propose(_SAMPLE_DOC, None, list(FieldKey))
    by_field = {c.field: c for c in result}

    assert set(by_field) == {FieldKey.VRM, FieldKey.CLAIMANT_NAME}

    vrm = by_field[FieldKey.VRM]
    assert vrm.value == "AB12 CDE"
    assert vrm.strategy_name == STRATEGY_NAME
    # review-only marking
    assert vrm.metadata.get("review_only") is True
    assert vrm.metadata.get("citation") == "Vehicle Registration: AB12 CDE"
    # confidence clamped below the review threshold -> always routes to review
    assert 0.0 <= vrm.confidence <= MAX_LLM_CONFIDENCE
    assert vrm.confidence < DEFAULT_REVIEW_THRESHOLD
    # source span located against the document line
    assert vrm.source_span is not None
    assert vrm.source_span.line_index == 0

    # exactly one HTTP call, to the local endpoint, low temperature
    assert len(spy.calls) == 1
    url, payload, _timeout = spy.calls[0]
    assert url.startswith("http://localhost:11434/v1")
    assert payload["temperature"] == 0.0


# --- uncitable output is dropped -------------------------------------------


def test_uncitable_value_is_discarded():
    model_json = {
        # value present but the cited snippet is NOT in the document text
        FieldKey.VRM.value: {
            "value": "ZZ99 ZZZ",
            "source": "Registration plate ZZ99 ZZZ as seen on file",
            "confidence": 0.95,
        },
    }
    spy = _SpyPoster(_chat_response(model_json))
    strat = LLMAssistStrategy(settings=_active_settings(), http_poster=spy)
    result = strat.propose(_SAMPLE_DOC, None, list(FieldKey))
    assert result == ()


def test_missing_citation_is_discarded():
    model_json = {
        FieldKey.VRM.value: {"value": "AB12 CDE", "confidence": 0.9},  # no source
    }
    spy = _SpyPoster(_chat_response(model_json))
    strat = LLMAssistStrategy(settings=_active_settings(), http_poster=spy)
    result = strat.propose(_SAMPLE_DOC, None, list(FieldKey))
    assert result == ()


def test_fabricated_value_with_real_citation_is_discarded():
    # A real, in-document citation paired with a VALUE that does not appear in the
    # document (nor within the cited snippet) must be dropped — citing a genuine
    # line is not enough to launder a hallucinated value.
    model_json = {
        FieldKey.VRM.value: {
            "value": "WRONG",
            "source": "Vehicle Registration: AB12 CDE",  # genuinely in the document
            "confidence": 0.5,
        }
    }
    spy = _SpyPoster(_chat_response(model_json))
    strat = LLMAssistStrategy(settings=_active_settings(), http_poster=spy)
    assert strat.propose(_SAMPLE_DOC, None, list(FieldKey)) == ()


# --- invalid output is dropped ---------------------------------------------


def test_unknown_field_key_is_discarded():
    model_json = {
        "not_a_real_field": {"value": "x", "source": "Claimant: Jane Roe", "confidence": 0.5},
    }
    spy = _SpyPoster(_chat_response(model_json))
    strat = LLMAssistStrategy(settings=_active_settings(), http_poster=spy)
    assert strat.propose(_SAMPLE_DOC, None, list(FieldKey)) == ()


def test_non_string_value_is_discarded():
    model_json = {
        FieldKey.MILEAGE.value: {"value": 54321, "source": "Mileage recorded", "confidence": 0.5},
    }
    spy = _SpyPoster(_chat_response(model_json))
    strat = LLMAssistStrategy(settings=_active_settings(), http_poster=spy)
    assert strat.propose(_SAMPLE_DOC, None, list(FieldKey)) == ()


def test_malformed_json_content_is_discarded():
    bad = {"choices": [{"message": {"content": "this is not json {"}}]}
    spy = _SpyPoster(bad)
    strat = LLMAssistStrategy(settings=_active_settings(), http_poster=spy)
    assert strat.propose(_SAMPLE_DOC, None, list(FieldKey)) == ()


def test_transport_error_degrades_to_empty():
    spy = _SpyPoster(RuntimeError("endpoint down"))
    strat = LLMAssistStrategy(settings=_active_settings(), http_poster=spy)
    assert strat.propose(_SAMPLE_DOC, None, list(FieldKey)) == ()
    assert len(spy.calls) == 1  # it tried, then degraded


def test_code_fenced_json_is_parsed():
    inner = {
        FieldKey.CLAIMANT_NAME.value: {
            "value": "Jane Roe",
            "source": "Claimant: Jane Roe",
            "confidence": 0.9,
        }
    }
    fenced = "```json\n" + json.dumps(inner) + "\n```"
    spy = _SpyPoster({"choices": [{"message": {"content": fenced}}]})
    strat = LLMAssistStrategy(settings=_active_settings(), http_poster=spy)
    result = strat.propose(_SAMPLE_DOC, None, list(FieldKey))
    assert {c.field for c in result} == {FieldKey.CLAIMANT_NAME}


def test_confidence_is_clamped_even_when_model_overconfident():
    model_json = {
        FieldKey.VRM.value: {
            "value": "AB12 CDE",
            "source": "Vehicle Registration: AB12 CDE",
            "confidence": 1.0,
        }
    }
    spy = _SpyPoster(_chat_response(model_json))
    strat = LLMAssistStrategy(settings=_active_settings(), http_poster=spy)
    (cand,) = strat.propose(_SAMPLE_DOC, None, [FieldKey.VRM])
    assert cand.confidence == MAX_LLM_CONFIDENCE


# --- orchestrator integration: never overrides determinism -----------------


def test_orchestrator_routes_llm_suggestion_to_review_for_unknown_provider():
    model_json = {
        FieldKey.VRM.value: {
            "value": "AB12 CDE",
            "source": "Vehicle Registration: AB12 CDE",
            "confidence": 0.9,
        }
    }
    spy = _SpyPoster(_chat_response(model_json))
    llm = LLMAssistStrategy(settings=_active_settings(), http_poster=spy)
    orch = FieldExtractionOrchestrator([RuleStrategy(), llm])

    result = orch.extract(_SAMPLE_DOC, provider=None, fields=[FieldKey.VRM])

    # The LLM suggestion is the only candidate, but its clamped confidence keeps
    # it under the review threshold -> the field is flagged for review.
    assert FieldKey.VRM in result.needs_review
    prov = result.provenance[FieldKey.VRM]
    assert prov.winner is not None
    assert prov.winner.strategy_name == STRATEGY_NAME
    assert prov.winner.metadata.get("review_only") is True
    assert prov.review_reason == "low_confidence"


def test_orchestrator_high_confidence_deterministic_beats_llm():
    # A confident deterministic candidate must win over the model suggestion.
    from cedocumentmapper_v2.extraction import Candidate

    class _ConfidentRule:
        name = "rule_engine"

        def propose(self, document, provider, fields):
            return (
                Candidate(
                    field=FieldKey.VRM,
                    value="AB12 CDE",
                    confidence=1.0,
                    strategy_name=self.name,
                ),
            )

    # A grounded LLM suggestion (value present in the document) so it survives the
    # value-grounding guard and is a real ranked candidate — it must still lose to
    # the confident deterministic one.
    model_json = {
        FieldKey.VRM.value: {
            "value": "AB12 CDE",
            "source": "Vehicle Registration: AB12 CDE",
            "confidence": 0.5,
        }
    }
    spy = _SpyPoster(_chat_response(model_json))
    llm = LLMAssistStrategy(settings=_active_settings(), http_poster=spy)
    orch = FieldExtractionOrchestrator([_ConfidentRule(), llm])

    result = orch.extract(_SAMPLE_DOC, provider=None, fields=[FieldKey.VRM])
    winner = result.provenance[FieldKey.VRM].winner
    assert winner is not None
    assert winner.strategy_name == "rule_engine"
    assert winner.value == "AB12 CDE"
    assert FieldKey.VRM not in result.needs_review

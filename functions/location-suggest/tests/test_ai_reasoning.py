"""Unit tests for the AI vision-reasoning escalation (TKT-078). No live AOAI / no key / no MSI."""

from __future__ import annotations

import json

import httpx
import pytest

import ai_reasoning
from ai_reasoning import AiLocationReasoner, build_reasoner, parse_ai_response


def _completion(content: str, usage: dict | None = None) -> dict:
    body = {"choices": [{"message": {"content": content}}]}
    if usage is not None:
        body["usage"] = usage
    return body


# --- parse_ai_response --------------------------------------------------------------------------

def test_parse_valid_guesses():
    content = json.dumps(
        {"guesses": [
            {"query": "Smith Recovery, Acton", "postcode": "W3 7QE", "confidence": 0.8, "reasoning": "sign reads 'Smith Recovery'"},
            {"query": "Unit 4 Trade Park", "postcode": "", "confidence": 1.5, "reasoning": "unit number on wall"},
        ]}
    )
    guesses = parse_ai_response(_completion(content))
    assert [g.query for g in guesses] == ["Smith Recovery, Acton", "Unit 4 Trade Park"]
    assert guesses[0].postcode == "W3 7QE"
    assert guesses[1].postcode is None
    assert guesses[1].confidence == 1.0  # clamped to 1.0


def test_parse_empty_guesses():
    assert parse_ai_response(_completion(json.dumps({"guesses": []}))) == []


def test_parse_malformed_content_returns_empty():
    assert parse_ai_response(_completion("not json at all")) == []
    assert parse_ai_response({"choices": []}) == []
    assert parse_ai_response({}) == []


def test_parse_skips_entries_without_query():
    content = json.dumps({"guesses": [{"postcode": "W3 7QE", "confidence": 0.9}, {"query": ""}]})
    assert parse_ai_response(_completion(content)) == []


# --- build_reasoner gating (SHIPS DARK) ---------------------------------------------------------

def test_build_reasoner_none_when_gate_off(monkeypatch):
    monkeypatch.delenv("LOCATION_ASSIST_AI_ENABLED", raising=False)
    monkeypatch.setenv("AI_MODEL_ENDPOINT", "https://x.cognitiveservices.azure.com")
    monkeypatch.setenv("AI_MODEL_DEPLOYMENT", "gpt-5")
    assert build_reasoner() is None


def test_build_reasoner_none_when_unconfigured(monkeypatch):
    monkeypatch.setenv("LOCATION_ASSIST_AI_ENABLED", "true")
    monkeypatch.delenv("AI_MODEL_ENDPOINT", raising=False)
    monkeypatch.delenv("AI_MODEL_DEPLOYMENT", raising=False)
    assert build_reasoner() is None


def test_build_reasoner_none_without_msi_token(monkeypatch):
    # Gate on + configured, but no IDENTITY_ENDPOINT => no token => None (honest no-op).
    monkeypatch.setenv("LOCATION_ASSIST_AI_ENABLED", "true")
    monkeypatch.setenv("AI_MODEL_ENDPOINT", "https://x.cognitiveservices.azure.com")
    monkeypatch.setenv("AI_MODEL_DEPLOYMENT", "gpt-5")
    monkeypatch.delenv("IDENTITY_ENDPOINT", raising=False)
    assert build_reasoner() is None


# --- AiLocationReasoner.suggest — request-form discipline + parsing -----------------------------

def test_suggest_uses_reasoning_model_form_and_parses():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["auth"] = request.headers.get("Authorization")
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json=_completion(
                json.dumps({"guesses": [{"query": "Acme Bodyshop", "confidence": 0.7, "reasoning": "signage"}]}),
                usage={"total_tokens": 1234},
            ),
        )

    reasoner = AiLocationReasoner(
        "https://x.cognitiveservices.azure.com", "gpt-5", token="tok", transport=httpx.MockTransport(handler)
    )
    guesses = reasoner.suggest([b"\xff\xd8fakejpeg"], accident="rear-ended at B5 6JX")
    assert len(guesses) == 1 and guesses[0].query == "Acme Bodyshop"
    # GA v1 keyless surface + bearer token
    assert captured["url"].endswith("/openai/v1/chat/completions")
    assert captured["auth"] == "Bearer tok"
    # reasoning-model call form: max_completion_tokens + reasoning_effort, NO temperature/max_tokens
    body = captured["body"]
    assert "max_completion_tokens" in body and "reasoning_effort" in body
    assert "temperature" not in body and "max_tokens" not in body
    # the photo was attached as an image_url data URL
    user = body["messages"][1]["content"]
    assert any(part.get("type") == "image_url" for part in user)


def test_suggest_no_photos_returns_empty():
    reasoner = AiLocationReasoner("https://x", "gpt-5", token="t")
    assert reasoner.suggest([]) == []


def test_suggest_non_200_returns_empty():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, text="rate limited")

    reasoner = AiLocationReasoner("https://x", "gpt-5", token="t", transport=httpx.MockTransport(handler))
    assert reasoner.suggest([b"img"]) == []

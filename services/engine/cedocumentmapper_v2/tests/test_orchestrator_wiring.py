"""Wiring tests: opt-in orchestrator + teach paths through service.py and cli.py.

These prove the additive, default-OFF integration of the new extraction layer:
  * the service orchestrator path returns a record + provenance,
  * CLI `extract --use-orchestrator` works on a real fixture and stays exit-0,
  * CLI `teach` prints a synthesized rule config (and never writes providers.json),
  * `--llm-assist` with the feature flag OFF is a pure no-op (no LLM strategy,
    no network call).

No network calls are made anywhere in this module.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from cedocumentmapper_v2.application import DocumentMapperService
from cedocumentmapper_v2.cli import main
from cedocumentmapper_v2.config import (
    LLM_ASSIST_ENABLED_ENV,
    LLM_ENDPOINT_ENV,
)
from cedocumentmapper_v2.domain.models import DocumentModel, FieldKey
from cedocumentmapper_v2.extraction import (
    LLM_ASSIST_STRATEGY_NAME,
    LLMAssistStrategy,
)


FIXTURE = Path(__file__).parent / "fixtures" / "instructions" / "ALISON WORD 01.docx"

PROVIDER = {
    "id": "alison",
    "name": "Alison Solicitors",
    "work_provider": "ALISON",
    "enabled": True,
    "priority": 1,
    "detect": {
        "required_phrases": ["ALISON", "claim"],
        "minimum_confidence": 0.5,
    },
    "field_rules": {
        "work_provider": {"id": "alison_wp", "kind": "manual", "value": "ALISON"},
        "claimant_name": {
            "id": "alison_name",
            "kind": "label_same_line",
            "labels": ["Claimant"],
        },
    },
}


def _doc(text: str) -> DocumentModel:
    return DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(),
        plain_text=text,
    )


def _service() -> DocumentMapperService:
    # Isolated app data dir: never touches the real user config / seed merge.
    return DocumentMapperService(app_data_dir=Path("nonexistent_unused"))


# --------------------------------------------------------------------------
# Service orchestrator path
# --------------------------------------------------------------------------


def test_service_orchestrated_returns_record_and_provenance():
    service = _service()
    document = _doc("This is an ALISON claim document.")
    result = service.extract_document_orchestrated(document, provider=PROVIDER, providers=[PROVIDER])

    # Record-compatible result.
    assert result.record.provider.provider_id == "alison"
    assert result.fields[FieldKey.WORK_PROVIDER].value == "ALISON"

    # Provenance is exposed per requested field, with a winning candidate's
    # strategy recorded for the rule-sourced fields.
    assert FieldKey.WORK_PROVIDER in result.provenance
    wp_prov = result.provenance[FieldKey.WORK_PROVIDER]
    assert wp_prov.winner is not None
    assert wp_prov.winner.strategy_name == "rule_engine"
    # Fields with no candidate route to needs_review.
    assert FieldKey.VRM in result.needs_review


def test_service_orchestrated_matches_default_for_mapped_fields():
    service = _service()
    document = _doc("This is an ALISON claim document.")
    default = service.extract_document(document, provider=PROVIDER, providers=[PROVIDER])
    orchestrated = service.extract_document_orchestrated(document, provider=PROVIDER, providers=[PROVIDER])
    assert orchestrated.fields[FieldKey.WORK_PROVIDER].value == default.fields[FieldKey.WORK_PROVIDER].value


def test_service_orchestration_to_dict_is_json_safe():
    service = _service()
    document = _doc("This is an ALISON claim document.")
    result = service.extract_document_orchestrated(document, provider=PROVIDER, providers=[PROVIDER])
    payload = service.orchestration_to_dict(result)
    # Round-trips through json without error.
    text = json.dumps(payload)
    reloaded = json.loads(text)
    assert reloaded["record"]["provider"]["provider_id"] == "alison"
    assert "provenance" in reloaded
    assert "needs_review" in reloaded


# --------------------------------------------------------------------------
# LLM-assist gating (no network)
# --------------------------------------------------------------------------


def test_llm_assist_flag_off_is_noop_no_network(monkeypatch):
    # Ensure the feature is OFF in the environment.
    monkeypatch.delenv(LLM_ASSIST_ENABLED_ENV, raising=False)
    monkeypatch.delenv(LLM_ENDPOINT_ENV, raising=False)
    service = _service()
    orchestrator = service.build_orchestrator(llm_assist=True)
    # No LLM strategy added when the flag is off, so no transport can fire.
    strategy_names = {s.name for s in orchestrator._strategies}
    assert LLM_ASSIST_STRATEGY_NAME not in strategy_names


def test_llm_assist_strategy_is_noop_when_inactive():
    # A directly-constructed strategy with no active settings must NOT call its
    # transport. We inject a poster that explodes if ever invoked.
    def exploding_poster(url, payload, timeout):  # pragma: no cover - must not run
        raise AssertionError("network call attempted while LLM assist is inactive")

    strategy = LLMAssistStrategy(http_poster=exploding_poster)
    out = strategy.propose(_doc("Some text"), None, [FieldKey.VRM])
    assert out == ()


def test_build_orchestrator_default_has_no_llm_strategy():
    service = _service()
    orchestrator = service.build_orchestrator()  # llm_assist defaults False
    names = {s.name for s in orchestrator._strategies}
    assert "rule_engine" in names
    assert LLM_ASSIST_STRATEGY_NAME not in names


# --------------------------------------------------------------------------
# CLI: extract --use-orchestrator
# --------------------------------------------------------------------------


@pytest.mark.skipif(not FIXTURE.exists(), reason="ALISON fixture not present")
def test_cli_extract_use_orchestrator_exit_zero(tmp_path, capsys, monkeypatch):
    monkeypatch.delenv(LLM_ASSIST_ENABLED_ENV, raising=False)
    code = main(["extract", str(FIXTURE), "--use-orchestrator"])
    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["record"]["provider"]["provider_id"] == "alison"
    assert "provenance" in payload
    assert "needs_review" in payload


@pytest.mark.skipif(not FIXTURE.exists(), reason="ALISON fixture not present")
def test_cli_extract_use_orchestrator_with_llm_assist_off_is_exit_zero(tmp_path, capsys, monkeypatch):
    # --llm-assist passed but the env flag is OFF -> still a no-op, exit 0, no network.
    monkeypatch.delenv(LLM_ASSIST_ENABLED_ENV, raising=False)
    monkeypatch.delenv(LLM_ENDPOINT_ENV, raising=False)
    code = main(["extract", str(FIXTURE), "--use-orchestrator", "--llm-assist"])
    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["record"]["provider"]["provider_id"] == "alison"


@pytest.mark.skipif(not FIXTURE.exists(), reason="ALISON fixture not present")
def test_cli_extract_default_path_unchanged(tmp_path, capsys):
    # Without --use-orchestrator the output shape is the legacy record (no
    # "provenance" wrapper key).
    code = main(["extract", str(FIXTURE)])
    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert "provenance" not in payload
    assert payload["provider"]["provider_id"] == "alison"


# --------------------------------------------------------------------------
# CLI: teach
# --------------------------------------------------------------------------


@pytest.mark.skipif(not FIXTURE.exists(), reason="ALISON fixture not present")
def test_cli_teach_prints_rule_and_does_not_write_providers(tmp_path, capsys):
    app_data = tmp_path / "appdata"
    app_data.mkdir()
    code = main(
        [
            "--app-data-dir",
            str(app_data),
            "teach",
            str(FIXTURE),
            "--field",
            "vrm",
            "--value",
            "YH14 AMK",
        ]
    )
    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["field"] == "vrm"
    assert payload["proposals"], "expected at least one synthesized proposal"
    best = payload["proposals"][0]
    assert "kind" in best["rule_config"]
    # Synthesis must NOT have written a providers.json.
    assert not (app_data / "providers.json").exists()


@pytest.mark.skipif(not FIXTURE.exists(), reason="ALISON fixture not present")
def test_cli_teach_best_prints_single_config(tmp_path, capsys):
    code = main(
        [
            "teach",
            str(FIXTURE),
            "--field",
            "vrm",
            "--value",
            "YH14 AMK",
            "--best",
        ]
    )
    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["rule_config"]["kind"]


@pytest.mark.skipif(not FIXTURE.exists(), reason="ALISON fixture not present")
def test_cli_teach_value_not_found_is_exit_zero_empty(tmp_path, capsys):
    code = main(
        [
            "teach",
            str(FIXTURE),
            "--field",
            "vrm",
            "--value",
            "ZZ99 ZZZ-not-in-doc",
        ]
    )
    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["proposals"] == []

"""Tests for the scored extraction comparator (cedocumentmapper_v2.eval.comparator).

These run the comparator over the tiny in-repo labelled corpus (tests/fixtures)
and assert the score-report shape plus that exact-match for the already-passing
regression fixtures is 100%. They also cover the v1-wins placeholder limitation
with an explicit, logged skip.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from cedocumentmapper_v2.eval import comparator
from cedocumentmapper_v2.eval.comparator import (
    CorpusScore,
    FieldScore,
    iter_fixtures,
    normalize_value,
    score_corpus,
    summarize,
    v2_engine,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
FIXTURES_DIR = REPO_ROOT / "tests" / "fixtures"
V1_WINS_DIR = FIXTURES_DIR / "v1_wins"


# --------------------------------------------------------------------------- #
# Value normalization / matching unit tests
# --------------------------------------------------------------------------- #
def test_normalize_collapses_blank_lines_and_whitespace():
    assert normalize_value("a\n\n\nb") == "a\nb"
    assert normalize_value("  hello   world  ") == "hello world"
    assert normalize_value("") == ""
    assert normalize_value(None) == ""


def test_normalize_handles_multiline_address_equivalence():
    a = "22 Blenheim Rd\nBradford\nW Yorks\n\n\nBD8 7LH"
    b = "22 Blenheim Rd\nBradford\nW Yorks\nBD8 7LH"
    assert normalize_value(a) == normalize_value(b)


# --------------------------------------------------------------------------- #
# FieldScore math
# --------------------------------------------------------------------------- #
def test_fieldscore_precision_recall_f1():
    fs = FieldScore("vrm", tp=8, fp=2, fn=2, tn=0)
    assert fs.precision == pytest.approx(0.8)
    assert fs.recall == pytest.approx(0.8)
    assert fs.f1 == pytest.approx(0.8)
    assert fs.labelled == 12
    assert fs.exact_match == pytest.approx(8 / 12)


def test_fieldscore_empty_is_perfect_by_convention():
    fs = FieldScore("x")
    assert fs.precision == 1.0
    assert fs.recall == 1.0
    assert fs.exact_match == 1.0


# --------------------------------------------------------------------------- #
# Corpus scoring against an in-memory fake engine (deterministic, no readers)
# --------------------------------------------------------------------------- #
def _fake_engine_from_expected(corpus_dir: Path):
    """Return an engine that replays each fixture's own expected values.

    This isolates the scoring logic from the real reader/rule stack and proves a
    perfect engine yields exact_match == 1.0.
    """
    by_source: dict[str, dict[str, str]] = {}
    for fx in iter_fixtures(corpus_dir):
        by_source[str(fx.source_path)] = dict(fx.data.get("expected_values", {}))

    def _run(source_path: Path):
        return by_source.get(str(source_path), {})

    return _run


def test_perfect_engine_scores_all_exact():
    engine = _fake_engine_from_expected(FIXTURES_DIR)
    score = score_corpus(FIXTURES_DIR, engine=engine, engine_name="fake-perfect")
    assert isinstance(score, CorpusScore)
    assert score.fixture_count >= 3
    assert not score.skipped
    overall = score.overall
    assert overall.exact_match == pytest.approx(1.0)
    assert overall.fp == 0
    assert overall.fn == 0
    for fs in score.per_field.values():
        assert fs.exact_match == pytest.approx(1.0)


def test_score_report_shape_is_serializable_and_documented():
    engine = _fake_engine_from_expected(FIXTURES_DIR)
    score = score_corpus(FIXTURES_DIR, engine=engine, engine_name="fake-perfect")
    report = score.to_dict()

    # Top-level shape.
    for key in (
        "schema_version",
        "engine",
        "corpus_dir",
        "fixture_count",
        "overall",
        "per_field",
        "per_fixture",
        "skipped",
    ):
        assert key in report, f"missing top-level key {key!r}"

    # Each per-field entry exposes the documented metrics.
    for field_name, fs in report["per_field"].items():
        for key in ("field", "tp", "fp", "fn", "tn", "labelled", "precision", "recall", "f1", "exact_match"):
            assert key in fs, f"field {field_name} missing {key!r}"

    # Per-fixture entries carry field-level outcomes (the regression diff).
    assert report["per_fixture"]
    first = report["per_fixture"][0]
    for key in ("fixture_id", "source_file", "expected_provider", "error", "exact_match", "fields"):
        assert key in first

    # Whole report must round-trip through JSON.
    json.loads(json.dumps(report, ensure_ascii=False))


def test_imperfect_engine_is_penalized():
    """A wrong non-blank value counts against both precision and recall."""

    def bad_engine(_source_path: Path):
        return {"vrm": "WRONGVAL", "work_provider": ""}

    score = score_corpus(FIXTURES_DIR, engine=bad_engine, engine_name="bad")
    vrm = score.per_field["vrm"]
    # Wrong value -> one fp and one fn for vrm across each fixture labelling it.
    assert vrm.fp >= 1
    assert vrm.fn >= 1
    assert vrm.exact_match < 1.0


def test_summary_text_mentions_engine_and_overall():
    engine = _fake_engine_from_expected(FIXTURES_DIR)
    score = score_corpus(FIXTURES_DIR, engine=engine, engine_name="fake-perfect")
    text = summarize(score)
    assert "engine=fake-perfect" in text
    assert "Overall:" in text
    assert "exact=" in text


# --------------------------------------------------------------------------- #
# Real v2 engine over the in-repo fixtures: the already-passing fixtures must
# stay at 100% exact-match (this is the regression gate the task asks for).
# --------------------------------------------------------------------------- #
def test_v2_engine_exact_match_on_passing_fixtures(tmp_path):
    # Use an isolated app_data_dir so the engine seeds providers.json from the
    # repo seed without touching the user's real config.
    engine = v2_engine(app_data_dir=tmp_path, seed_path=REPO_ROOT / "providers.json")
    score = score_corpus(FIXTURES_DIR, engine=engine, engine_name="v2")
    assert score.fixture_count >= 3
    assert not score.skipped, f"v2 engine errored on fixtures: {score.skipped}"
    # The committed fixtures are the already-passing set; exact-match must be 100%.
    assert score.overall.exact_match == pytest.approx(1.0), summarize(score)


# --------------------------------------------------------------------------- #
# v1-wins limitation: placeholder fixture is logged and skipped.
# --------------------------------------------------------------------------- #
def test_v1_wins_placeholder_is_unresolvable_without_v1():
    """The v1-wins corpus currently holds only a clearly-marked placeholder.

    Its source document is intentionally absent (cannot assert a true expected
    value without v1, which lives in a separate repo), so the comparator loader
    resolves zero scorable fixtures. We record that limitation explicitly here.
    """
    expected_files = list((V1_WINS_DIR / "expected").glob("*.expected.json"))
    assert expected_files, "expected at least the placeholder fixture file"

    placeholder = json.loads(expected_files[0].read_text(encoding="utf-8"))
    assert placeholder["fixture_id"].startswith("__placeholder__")

    resolvable = list(iter_fixtures(V1_WINS_DIR))
    if not resolvable:
        pytest.skip(
            "v1-wins fixture is a documented placeholder: the true expected value "
            "cannot be asserted without v1 (separate repo) and the comparison-report "
            "example documents contain no such field. See tests/fixtures/v1_wins/README.md."
        )
    # If a real v1-wins fixture has been activated (source added, value pasted),
    # it must score against the v2 engine without erroring.
    score = score_corpus(V1_WINS_DIR, engine=v2_engine(), engine_name="v2")
    assert isinstance(score, CorpusScore)


# --------------------------------------------------------------------------- #
# CLI entry point smoke test.
# --------------------------------------------------------------------------- #
def test_cli_main_writes_json_and_returns_zero(tmp_path, capsys):
    out = tmp_path / "report.json"
    # Monkeypatch-free: main() builds a real v2 engine; run over fixtures.
    rc = comparator.main([str(FIXTURES_DIR), "--json-out", str(out)])
    captured = capsys.readouterr()
    assert rc == 0
    assert out.exists()
    report = json.loads(out.read_text(encoding="utf-8"))
    assert report["fixture_count"] >= 3
    assert "Overall:" in captured.out

"""CI eval-harness regression gate (cedocumentmapper_v2.eval.ci_eval).

The headline test runs the shipped v2 engine over the small in-repo labelled
corpus (``tests/fixtures``) and asserts the per-field (and overall) exact-match
meets-or-exceeds the committed baseline. A future extraction regression that
drops any labelled field below its baseline floor will fail this test in CI.

The remaining tests cover the comparison logic in isolation (no readers): a
below-baseline field is flagged, a within-tolerance dip is tolerated, a
baseline field missing from the live score is flagged, and the baseline JSON
round-trips. The corpus is intentionally tiny + deterministic; nothing here
touches a private corpus or the network.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from cedocumentmapper_v2.eval.ci_eval import (
    DEFAULT_BASELINE_PATH,
    EvalGateResult,
    build_baseline,
    compare_to_baseline,
    load_baseline,
    run_eval,
    write_baseline,
)
from cedocumentmapper_v2.eval.comparator import CorpusScore, FieldScore

REPO_ROOT = Path(__file__).resolve().parents[1]
FIXTURES_DIR = REPO_ROOT / "tests" / "fixtures"
SEED_PATH = REPO_ROOT / "providers.json"


# --------------------------------------------------------------------------- #
# The CI gate: real engine over the labelled corpus vs the committed baseline.
# --------------------------------------------------------------------------- #
def test_baseline_file_exists_and_is_well_formed():
    baseline = load_baseline(DEFAULT_BASELINE_PATH)
    assert baseline["schema_version"] == 1
    assert baseline["corpus"] == "tests/fixtures"
    assert baseline["per_field_exact_match"], "baseline must record per-field floors"
    # Every floor is a ratio in [0, 1].
    for floor in baseline["per_field_exact_match"].values():
        assert 0.0 <= float(floor) <= 1.0


def test_v2_corpus_meets_or_exceeds_baseline(tmp_path):
    """Per-field exact-match must not regress below the committed baseline.

    Uses an isolated ``app_data_dir`` so the engine seeds providers.json from the
    repo seed without touching the user's real config.
    """
    score = run_eval(
        corpus_dir=FIXTURES_DIR,
        app_data_dir=tmp_path,
        seed_path=SEED_PATH,
    )
    assert score.fixture_count >= 3
    assert not score.skipped, f"v2 engine errored on fixtures: {score.skipped}"

    baseline = load_baseline(DEFAULT_BASELINE_PATH)
    gate = compare_to_baseline(score, baseline)

    # The assertion that future regressions trip in CI.
    assert gate.passed, gate.render()
    # And the corpus must keep covering every baselined field.
    assert not gate.regressions
    # No newly-labelled-but-unbaselined field is silently escaping the gate.
    assert not gate.new_fields, (
        "new fields scored but absent from baseline; run "
        "`python -m cedocumentmapper_v2.eval.ci_eval --update-baseline`: "
        f"{gate.new_fields}"
    )


def test_live_baseline_matches_current_engine_output(tmp_path):
    """The committed baseline should reflect the current engine (no stale drift).

    Each live per-field exact-match equals its baseline floor (the baseline is
    generated from this same engine, so equality is expected to ~tolerance).
    """
    score = run_eval(
        corpus_dir=FIXTURES_DIR,
        app_data_dir=tmp_path,
        seed_path=SEED_PATH,
    )
    baseline = load_baseline(DEFAULT_BASELINE_PATH)
    floors = baseline["per_field_exact_match"]
    for name, fs in score.per_field.items():
        assert name in floors, f"{name} scored but missing from baseline"
        assert fs.exact_match >= float(floors[name]) - 1e-4


# --------------------------------------------------------------------------- #
# Comparison logic in isolation (no readers).
# --------------------------------------------------------------------------- #
def _score_with(per_field: dict[str, FieldScore]) -> CorpusScore:
    return CorpusScore(
        engine="fake",
        corpus_dir="mem",
        fixture_count=1,
        per_field=per_field,
        per_fixture=[],
    )


def _baseline(per_field: dict[str, float], overall: float = 1.0, tol: float = 1e-4):
    return {
        "schema_version": 1,
        "engine": "v2",
        "corpus": "tests/fixtures",
        "tolerance": tol,
        "overall_exact_match": overall,
        "per_field_exact_match": per_field,
    }


def test_gate_passes_when_scores_meet_baseline():
    score = _score_with({"vrm": FieldScore("vrm", tp=3)})
    gate = compare_to_baseline(score, _baseline({"vrm": 1.0}))
    assert isinstance(gate, EvalGateResult)
    assert gate.passed
    assert not gate.regressions


def test_gate_fails_on_below_baseline_field():
    # 2/3 exact vs a 1.0 floor -> regression.
    score = _score_with({"vrm": FieldScore("vrm", tp=2, fp=1)})
    gate = compare_to_baseline(score, _baseline({"vrm": 1.0}, overall=1.0))
    assert not gate.passed
    fields = {r.field for r in gate.regressions}
    assert "vrm" in fields
    assert any(r.reason == "below_baseline" for r in gate.regressions)


def test_gate_tolerates_tiny_float_dip():
    # exact_match 0.9999something vs floor 1.0 within tolerance passes.
    score = _score_with({"vrm": FieldScore("vrm", tp=9999, fp=1)})
    gate = compare_to_baseline(score, _baseline({"vrm": 1.0}, overall=0.0, tol=1e-3))
    assert gate.passed, gate.render()


def test_gate_fails_when_baselined_field_missing_from_corpus():
    score = _score_with({"vrm": FieldScore("vrm", tp=3)})
    gate = compare_to_baseline(
        score, _baseline({"vrm": 1.0, "claimant_name": 1.0}, overall=0.0)
    )
    assert not gate.passed
    missing = [r for r in gate.regressions if r.reason == "missing_field"]
    assert {r.field for r in missing} == {"claimant_name"}


def test_gate_reports_new_unbaselined_fields():
    score = _score_with(
        {"vrm": FieldScore("vrm", tp=3), "new_field": FieldScore("new_field", tp=1)}
    )
    gate = compare_to_baseline(score, _baseline({"vrm": 1.0}, overall=0.0))
    assert gate.new_fields == ["new_field"]


def test_gate_fails_on_overall_regression():
    score = _score_with({"vrm": FieldScore("vrm", tp=1, fp=1)})
    gate = compare_to_baseline(score, _baseline({"vrm": 0.0}, overall=1.0))
    assert not gate.passed
    assert any(r.field == "__overall__" for r in gate.regressions)


# --------------------------------------------------------------------------- #
# Baseline build / IO round-trip.
# --------------------------------------------------------------------------- #
def test_build_and_roundtrip_baseline(tmp_path):
    score = _score_with(
        {"vrm": FieldScore("vrm", tp=3), "work_provider": FieldScore("work_provider", tp=3)}
    )
    baseline = build_baseline(score, corpus="tests/fixtures")
    assert baseline["schema_version"] == 1
    assert baseline["overall_exact_match"] == 1.0
    assert set(baseline["per_field_exact_match"]) == {"vrm", "work_provider"}

    out = tmp_path / "baseline.json"
    write_baseline(baseline, out)
    reloaded = load_baseline(out)
    assert reloaded == json.loads(out.read_text(encoding="utf-8"))
    assert reloaded["per_field_exact_match"]["vrm"] == 1.0


def test_load_baseline_rejects_unknown_schema(tmp_path):
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"schema_version": 999}), encoding="utf-8")
    with pytest.raises(ValueError):
        load_baseline(bad)

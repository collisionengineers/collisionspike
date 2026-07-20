"""CI-runnable scored eval harness (investigation/07 Phase 1).

This wraps the scored :mod:`cedocumentmapper_v2.eval.comparator` so that CI can
gate on *extraction regressions* per field. The flow is:

1. Run the shipped v2 engine over the in-repo labelled corpus (``tests/fixtures``
   -- the same regression fixtures the suite already exercises).
2. Read a small, version-controlled **baseline JSON** that records the minimum
   acceptable per-field exact-match (and overall exact-match) the corpus must
   keep meeting.
3. Compare the freshly-computed scores against that baseline. Any field whose
   exact-match drops below its baseline (beyond a tiny float tolerance) is a
   **regression** -> CI fails.

Why a stored JSON baseline (not a hard-coded ``== 1.0``)?
---------------------------------------------------------
The baseline is *updatable*: when a deliberate change moves a field's score (up
or down with sign-off), a maintainer regenerates it with
``--update-baseline`` and commits the diff. CI then guards the new floor. This
lets the floor start at the current 100%-exact corpus yet remain a single,
reviewable JSON rather than a constant scattered through test code.

Baseline file
-------------
Default location: ``src/cedocumentmapper_v2/eval/baseline.json`` (next to this
module, so it ships with the package). Shape::

    {
      "schema_version": 1,
      "engine": "v2",
      "corpus": "tests/fixtures",
      "tolerance": 0.0001,
      "overall_exact_match": 1.0,
      "per_field_exact_match": {
        "vrm": 1.0,
        "work_provider": 1.0,
        ...
      }
    }

``per_field_exact_match`` is the *floor* for each field's exact-match ratio;
``overall_exact_match`` is the floor for the corpus aggregate. Fields present in
the live score but absent from the baseline are reported (and, in
``require_all_fields`` mode, treated as a regression) so that newly-labelled
fields cannot silently escape the gate.

CLI usage (see also ``python -m cedocumentmapper_v2.eval.comparator``)::

    # Check the live corpus against the committed baseline (CI gate):
    python -m cedocumentmapper_v2.eval.ci_eval

    # Regenerate the baseline from the current engine output (after sign-off):
    python -m cedocumentmapper_v2.eval.ci_eval --update-baseline

    # Point at a different corpus / baseline:
    python -m cedocumentmapper_v2.eval.ci_eval --corpus path/to/corpus \\
        --baseline path/to/baseline.json
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from cedocumentmapper_v2.eval.comparator import (
    CorpusScore,
    Engine,
    score_corpus,
    summarize,
    v2_engine,
)

BASELINE_SCHEMA_VERSION = 1

# The baseline ships next to this module so it travels with the package.
DEFAULT_BASELINE_PATH = Path(__file__).resolve().parent / "baseline.json"

# This engine now lives as a subtree inside collisionspike, not as its own repo
# root; resolve relative to this file: .../src/cedocumentmapper_v2/eval/ci_eval.py
# -> the engine's own root (services/engine/cedocumentmapper_v2/) is 4 up.
_ENGINE_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CORPUS_DIR = _ENGINE_ROOT / "tests" / "fixtures"
DEFAULT_SEED_PATH = _ENGINE_ROOT / "providers.json"

# Float wobble guard: scores are ratios, so equal values can differ by ~1e-16.
DEFAULT_TOLERANCE = 1e-4


# --------------------------------------------------------------------------- #
# Baseline build / IO
# --------------------------------------------------------------------------- #
def build_baseline(
    score: CorpusScore,
    *,
    corpus: str = "tests/fixtures",
    tolerance: float = DEFAULT_TOLERANCE,
) -> dict[str, object]:
    """Project a :class:`CorpusScore` into the small, committable baseline dict."""
    return {
        "schema_version": BASELINE_SCHEMA_VERSION,
        "engine": score.engine,
        "corpus": corpus,
        "tolerance": tolerance,
        "overall_exact_match": round(score.overall.exact_match, 4),
        "per_field_exact_match": {
            name: round(fs.exact_match, 4)
            for name, fs in sorted(score.per_field.items())
        },
    }


def load_baseline(path: Path = DEFAULT_BASELINE_PATH) -> dict[str, object]:
    """Read and lightly validate the baseline JSON."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("schema_version") != BASELINE_SCHEMA_VERSION:
        raise ValueError(
            f"baseline schema_version {data.get('schema_version')!r} != "
            f"expected {BASELINE_SCHEMA_VERSION}"
        )
    if "per_field_exact_match" not in data:
        raise ValueError("baseline missing 'per_field_exact_match'")
    return data


def write_baseline(baseline: dict[str, object], path: Path = DEFAULT_BASELINE_PATH) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(baseline, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


# --------------------------------------------------------------------------- #
# Comparison
# --------------------------------------------------------------------------- #
@dataclass
class FieldRegression:
    field: str
    baseline: float
    actual: float
    reason: str  # "below_baseline" | "missing_field"


@dataclass
class EvalGateResult:
    passed: bool
    overall_actual: float
    overall_baseline: float
    regressions: list[FieldRegression] = field(default_factory=list)
    skipped: list[dict[str, str]] = field(default_factory=list)
    # Fields scored live but absent from the baseline (informational).
    new_fields: list[str] = field(default_factory=list)

    def render(self) -> str:
        lines: list[str] = []
        status = "PASS" if self.passed else "FAIL"
        lines.append(f"CI eval gate: {status}")
        lines.append(
            f"Overall exact-match: actual={self.overall_actual:.4f} "
            f"baseline>={self.overall_baseline:.4f}"
        )
        if self.regressions:
            lines.append("Regressions:")
            for reg in self.regressions:
                lines.append(
                    f"  - {reg.field}: actual={reg.actual:.4f} "
                    f"baseline>={reg.baseline:.4f} ({reg.reason})"
                )
        if self.new_fields:
            lines.append(
                "New fields scored but not in baseline (run --update-baseline "
                "to record): " + ", ".join(self.new_fields)
            )
        if self.skipped:
            lines.append("Skipped / errored fixtures:")
            for item in self.skipped:
                lines.append(f"  - {item['fixture_id']}: {item['reason']}")
        return "\n".join(lines)


def compare_to_baseline(
    score: CorpusScore,
    baseline: dict[str, object],
    *,
    require_all_fields: bool = True,
) -> EvalGateResult:
    """Compare a live corpus score to ``baseline`` and decide pass/fail.

    A field fails when its live exact-match falls below the baseline floor by
    more than ``tolerance``. When ``require_all_fields`` is True, a baseline
    field absent from the live score is also a regression (a labelled field
    silently vanishing from the corpus would otherwise hide a problem).
    """
    tolerance = float(baseline.get("tolerance", DEFAULT_TOLERANCE))
    overall_baseline = float(baseline.get("overall_exact_match", 0.0))
    per_field_baseline: dict[str, float] = {
        k: float(v) for k, v in dict(baseline.get("per_field_exact_match", {})).items()
    }

    live_per_field = {name: fs.exact_match for name, fs in score.per_field.items()}
    overall_actual = score.overall.exact_match

    regressions: list[FieldRegression] = []

    # Overall floor.
    if overall_actual < overall_baseline - tolerance:
        regressions.append(
            FieldRegression(
                field="__overall__",
                baseline=overall_baseline,
                actual=overall_actual,
                reason="below_baseline",
            )
        )

    # Per-field floors.
    for fname, floor in sorted(per_field_baseline.items()):
        if fname not in live_per_field:
            if require_all_fields:
                regressions.append(
                    FieldRegression(
                        field=fname,
                        baseline=floor,
                        actual=0.0,
                        reason="missing_field",
                    )
                )
            continue
        actual = live_per_field[fname]
        if actual < floor - tolerance:
            regressions.append(
                FieldRegression(
                    field=fname,
                    baseline=floor,
                    actual=actual,
                    reason="below_baseline",
                )
            )

    new_fields = sorted(set(live_per_field) - set(per_field_baseline))

    return EvalGateResult(
        passed=not regressions,
        overall_actual=overall_actual,
        overall_baseline=overall_baseline,
        regressions=regressions,
        skipped=list(score.skipped),
        new_fields=new_fields,
    )


# --------------------------------------------------------------------------- #
# High-level run helper (used by the CI test + CLI)
# --------------------------------------------------------------------------- #
def run_eval(
    *,
    corpus_dir: Path = DEFAULT_CORPUS_DIR,
    engine: Engine | None = None,
    app_data_dir: Path | None = None,
    seed_path: Path | None = DEFAULT_SEED_PATH,
    engine_name: str = "v2",
) -> CorpusScore:
    """Score ``corpus_dir`` with the v2 engine (or a supplied ``engine``).

    ``app_data_dir`` is forwarded to :func:`v2_engine` so callers (tests) can use
    an isolated config dir seeded from ``seed_path`` without touching real config.
    """
    if engine is None:
        engine = v2_engine(app_data_dir=app_data_dir, seed_path=seed_path)
    return score_corpus(Path(corpus_dir), engine=engine, engine_name=engine_name)


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m cedocumentmapper_v2.eval.ci_eval",
        description=(
            "Score v2 extraction over the labelled corpus and gate on per-field "
            "exact-match regression against a committed baseline."
        ),
    )
    parser.add_argument(
        "--corpus",
        type=Path,
        default=DEFAULT_CORPUS_DIR,
        help=f"Labelled corpus directory (default: {DEFAULT_CORPUS_DIR}).",
    )
    parser.add_argument(
        "--baseline",
        type=Path,
        default=DEFAULT_BASELINE_PATH,
        help=f"Baseline JSON path (default: {DEFAULT_BASELINE_PATH}).",
    )
    parser.add_argument(
        "--seed-path",
        type=Path,
        default=DEFAULT_SEED_PATH,
        help="providers.json seed for the isolated engine config.",
    )
    parser.add_argument(
        "--app-data-dir",
        type=Path,
        default=None,
        help="Isolated app-data dir for the engine's provider config. Defaults to "
        "a fresh temporary directory per run so a real local desktop-app "
        "install on the machine running this can never contaminate the score.",
    )
    parser.add_argument(
        "--update-baseline",
        action="store_true",
        help="Recompute and overwrite the baseline JSON from the current engine "
        "output (use after a reviewed, intentional score change).",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress the text summary on stdout.",
    )
    args = parser.parse_args(argv)

    if not args.corpus.exists():
        parser.error(f"corpus not found: {args.corpus}")

    if args.app_data_dir is not None:
        score = run_eval(corpus_dir=args.corpus, seed_path=args.seed_path, app_data_dir=args.app_data_dir)
    else:
        with tempfile.TemporaryDirectory(prefix="ce-eval-") as scratch:
            score = run_eval(corpus_dir=args.corpus, seed_path=args.seed_path, app_data_dir=Path(scratch))

    if args.update_baseline:
        # Record a stable, repo-relative corpus label when possible so the
        # committed baseline does not embed a machine-specific absolute path.
        try:
            corpus_label = str(args.corpus.resolve().relative_to(_ENGINE_ROOT)).replace("\\", "/")
        except ValueError:
            corpus_label = str(args.corpus)
        baseline = build_baseline(score, corpus=corpus_label)
        write_baseline(baseline, args.baseline)
        if not args.quiet:
            print(summarize(score))
            print(f"\nWrote baseline -> {args.baseline}")
        return 0

    baseline = load_baseline(args.baseline)
    gate = compare_to_baseline(score, baseline)

    if not args.quiet:
        print(summarize(score))
        print()
        print(gate.render())

    # CI gate: non-zero on regression OR on any errored fixture.
    return 0 if (gate.passed and not score.skipped) else 1


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())

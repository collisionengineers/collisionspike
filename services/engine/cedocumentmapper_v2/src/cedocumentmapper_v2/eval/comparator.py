"""Scored extraction comparator over a labelled fixture corpus.

This harness answers the EPIC-08 question "did a parser change make extraction
better or worse, per field?" repeatably, and lets an alternative engine (v1 or a
prospective "new engine") be scored side-by-side against the shipped v2 engine.

Concepts
--------
* **Labelled corpus** - a directory of ``*.expected.json`` files (validating
  against ``docs/contracts/expected-fixture.schema.json``) paired with their
  source documents in a sibling ``instructions/`` directory. This is exactly the
  shape ``tests/fixtures`` already uses, so the regression fixtures double as the
  comparator corpus.
* **Engine** - a callable ``(source_path: Path) -> Mapping[str, str]`` returning a
  ``{field_name: value}`` map. The default :func:`v2_engine` wraps the shipped
  :class:`DocumentMapperService`. v1 lives in a *separate repo* and is **never**
  imported here; to score v1 you pass your own ``Engine`` adapter.

Scoring (per field, computed only over the fields a fixture labels)
-------------------------------------------------------------------
For each labelled field we compare the engine's value to the expected value with
an exact (whitespace-normalized) string match, and bucket the outcome:

* **true positive (tp)** - expected non-blank and engine value matches.
* **false positive (fp)** - engine produced a non-blank value that does NOT match
  the expected value (wrong value, or value where a blank/listed-blank was
  expected).
* **false negative (fn)** - expected non-blank but engine produced blank (or a
  mismatching value - a mismatch is counted once as fp and once as fn, mirroring
  standard slot-filling scoring).
* **true negative (tn)** - expected blank (or listed in ``allowed_blank_fields``)
  and engine produced blank.

From the aggregated buckets:

    precision = tp / (tp + fp)
    recall    = tp / (tp + fn)
    f1        = 2 * p * r / (p + r)
    exact_match = (#fields where engine == expected) / (#labelled fields)

``allowed_blank_fields`` are treated as "blank is acceptable": an engine blank on
such a field is an exact-match (tn), and a non-blank engine value there is NOT
penalized as fp (the label simply does not assert a value).
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterator, Mapping

# An engine maps a source document path to a {field_name: value} dict.
Engine = Callable[[Path], Mapping[str, str]]

SCHEMA_VERSION = 1


# --------------------------------------------------------------------------- #
# Value comparison
# --------------------------------------------------------------------------- #
def normalize_value(value: str | None) -> str:
    """Normalize a field value for comparison.

    Trims surrounding whitespace and collapses internal runs of blank lines /
    spaces so that cosmetic reader differences (e.g. an extra blank line in a
    multi-line address) do not register as a mismatch. Newlines are preserved as
    single ``\\n`` separators because some fields (addresses) are intentionally
    multi-line.
    """
    if not value:
        return ""
    lines = [" ".join(line.split()) for line in str(value).splitlines()]
    # Drop blank lines so "a\n\n\nb" == "a\nb"; join survivors with single \n.
    return "\n".join(line for line in lines if line).strip()


def values_match(expected: str, actual: str) -> bool:
    return normalize_value(expected) == normalize_value(actual)


# --------------------------------------------------------------------------- #
# Score containers
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class FieldScore:
    """Aggregated confusion-matrix buckets + derived metrics for one field."""

    field: str
    tp: int = 0
    fp: int = 0
    fn: int = 0
    tn: int = 0

    @property
    def labelled(self) -> int:
        return self.tp + self.fp + self.fn + self.tn

    @property
    def exact(self) -> int:
        # An exact match is any non-error bucket: a correct value (tp) or an
        # acceptable blank (tn).
        return self.tp + self.tn

    @property
    def precision(self) -> float:
        denom = self.tp + self.fp
        return self.tp / denom if denom else 1.0

    @property
    def recall(self) -> float:
        denom = self.tp + self.fn
        return self.tp / denom if denom else 1.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return (2 * p * r / (p + r)) if (p + r) else 0.0

    @property
    def exact_match(self) -> float:
        return self.exact / self.labelled if self.labelled else 1.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "field": self.field,
            "tp": self.tp,
            "fp": self.fp,
            "fn": self.fn,
            "tn": self.tn,
            "labelled": self.labelled,
            "precision": round(self.precision, 4),
            "recall": round(self.recall, 4),
            "f1": round(self.f1, 4),
            "exact_match": round(self.exact_match, 4),
        }


@dataclass
class FixtureFieldOutcome:
    field: str
    expected: str
    actual: str
    bucket: str  # "tp" | "fp" | "fn" | "tn"
    matched: bool


@dataclass
class FixtureResult:
    fixture_id: str
    source_file: str
    expected_provider: str
    error: str | None = None
    outcomes: list[FixtureFieldOutcome] = field(default_factory=list)

    @property
    def exact_match(self) -> float:
        if self.error or not self.outcomes:
            return 0.0 if self.error else 1.0
        matched = sum(1 for o in self.outcomes if o.matched)
        return matched / len(self.outcomes)

    def to_dict(self) -> dict[str, Any]:
        return {
            "fixture_id": self.fixture_id,
            "source_file": self.source_file,
            "expected_provider": self.expected_provider,
            "error": self.error,
            "exact_match": round(self.exact_match, 4),
            "fields": [asdict(o) for o in self.outcomes],
        }


@dataclass
class CorpusScore:
    engine: str
    corpus_dir: str
    fixture_count: int
    per_field: dict[str, FieldScore]
    per_fixture: list[FixtureResult]
    skipped: list[dict[str, str]] = field(default_factory=list)

    @property
    def overall(self) -> FieldScore:
        total = FieldScore("__overall__")
        tp = sum(fs.tp for fs in self.per_field.values())
        fp = sum(fs.fp for fs in self.per_field.values())
        fn = sum(fs.fn for fs in self.per_field.values())
        tn = sum(fs.tn for fs in self.per_field.values())
        return FieldScore("__overall__", tp, fp, fn, tn)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": SCHEMA_VERSION,
            "engine": self.engine,
            "corpus_dir": self.corpus_dir,
            "fixture_count": self.fixture_count,
            "overall": self.overall.to_dict(),
            "per_field": {name: fs.to_dict() for name, fs in self.per_field.items()},
            "per_fixture": [fr.to_dict() for fr in self.per_fixture],
            "skipped": self.skipped,
        }


# --------------------------------------------------------------------------- #
# Corpus loading
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class LoadedFixture:
    expected_path: Path
    source_path: Path
    data: dict[str, Any]


def iter_fixtures(corpus_dir: Path) -> Iterator[LoadedFixture]:
    """Yield ``(expected_path, source_path, data)`` for each resolvable fixture.

    A corpus directory is expected to contain an ``expected/`` subdirectory of
    ``*.expected.json`` files and a sibling ``instructions/`` directory holding
    the source documents named by each fixture's ``source_file``. To stay
    flexible the loader also accepts ``*.expected.json`` files placed directly in
    ``corpus_dir`` (with sources alongside).
    """
    corpus_dir = Path(corpus_dir)
    expected_dir = corpus_dir / "expected"
    instructions_dir = corpus_dir / "instructions"
    if not expected_dir.exists():
        expected_dir = corpus_dir
        instructions_dir = corpus_dir

    for expected_path in sorted(expected_dir.glob("*.expected.json")):
        try:
            data = json.loads(expected_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        source_file = data.get("source_file")
        if not source_file:
            continue
        source_path = instructions_dir / source_file
        if not source_path.exists():
            continue
        yield LoadedFixture(expected_path, source_path, data)


# --------------------------------------------------------------------------- #
# Engines
# --------------------------------------------------------------------------- #
def v2_engine(
    *,
    app_data_dir: Path | None = None,
    seed_path: Path | None = None,
) -> Engine:
    """Build the default engine backed by the shipped v2 service.

    Returns a callable that reads + extracts a document and yields its
    ``{field_name: value}`` map. Imports are deferred so that merely importing the
    comparator (e.g. for its scoring helpers) does not pull the whole reader/rule
    stack.
    """
    from cedocumentmapper_v2.application.service import DocumentMapperService

    service = DocumentMapperService(app_data_dir=app_data_dir, seed_path=seed_path)

    def _run(source_path: Path) -> Mapping[str, str]:
        providers = service.load_providers()
        document = service.read_document(source_path)
        record = service.extract_document(document, providers=providers)
        return {key.value: value.value for key, value in record.fields.items()}

    return _run


# --------------------------------------------------------------------------- #
# Scoring
# --------------------------------------------------------------------------- #
def _score_fixture(
    fixture: LoadedFixture,
    engine: Engine,
) -> FixtureResult:
    data = fixture.data
    result = FixtureResult(
        fixture_id=data.get("fixture_id", fixture.expected_path.stem),
        source_file=data.get("source_file", ""),
        expected_provider=data.get("expected_provider", ""),
    )
    try:
        produced = dict(engine(fixture.source_path))
    except Exception as exc:  # pragma: no cover - engine-specific failure path
        result.error = f"{type(exc).__name__}: {exc}"
        return result

    expected_values: dict[str, str] = data.get("expected_values", {})
    allowed_blanks = set(data.get("allowed_blank_fields", []))

    for field_name, expected_val in expected_values.items():
        actual_val = produced.get(field_name, "")
        expected_blank = not normalize_value(expected_val) or field_name in allowed_blanks
        actual_blank = not normalize_value(actual_val)
        matched = values_match(expected_val, actual_val)

        if expected_blank:
            if actual_blank or field_name in allowed_blanks:
                # Blank acceptable: a blank (or any value on an allowed-blank
                # field) is not penalized.
                bucket = "tn"
                matched = True
            else:
                bucket = "fp"
                matched = False
        else:
            if matched:
                bucket = "tp"
            elif actual_blank:
                bucket = "fn"
            else:
                # Wrong non-blank value: counts against both precision and recall.
                bucket = "fp_fn"
                matched = False
        result.outcomes.append(
            FixtureFieldOutcome(
                field=field_name,
                expected=expected_val,
                actual=actual_val,
                bucket=bucket,
                matched=matched,
            )
        )
    return result


def score_corpus(
    corpus_dir: Path,
    engine: Engine | None = None,
    engine_name: str = "v2",
) -> CorpusScore:
    """Run ``engine`` over the labelled corpus and aggregate per-field scores."""
    corpus_dir = Path(corpus_dir)
    engine = engine or v2_engine()

    fixtures = list(iter_fixtures(corpus_dir))
    per_fixture: list[FixtureResult] = []
    buckets: dict[str, Counter[str]] = {}
    skipped: list[dict[str, str]] = []

    for fixture in fixtures:
        result = _score_fixture(fixture, engine)
        per_fixture.append(result)
        if result.error:
            skipped.append({"fixture_id": result.fixture_id, "reason": result.error})
            continue
        for outcome in result.outcomes:
            counter = buckets.setdefault(outcome.field, Counter())
            if outcome.bucket == "fp_fn":
                counter["fp"] += 1
                counter["fn"] += 1
            else:
                counter[outcome.bucket] += 1

    per_field = {
        name: FieldScore(
            field=name,
            tp=counter.get("tp", 0),
            fp=counter.get("fp", 0),
            fn=counter.get("fn", 0),
            tn=counter.get("tn", 0),
        )
        for name, counter in sorted(buckets.items())
    }

    return CorpusScore(
        engine=engine_name,
        corpus_dir=str(corpus_dir),
        fixture_count=len(fixtures),
        per_field=per_field,
        per_fixture=per_fixture,
        skipped=skipped,
    )


# --------------------------------------------------------------------------- #
# Reporting
# --------------------------------------------------------------------------- #
def summarize(score: CorpusScore) -> str:
    """Render a short human-readable text summary of a corpus score."""
    lines: list[str] = []
    lines.append(f"Comparator report - engine={score.engine}")
    lines.append(f"Corpus: {score.corpus_dir}")
    lines.append(f"Fixtures scored: {score.fixture_count} ({len(score.skipped)} skipped/errored)")
    overall = score.overall
    lines.append(
        f"Overall: P={overall.precision:.3f} R={overall.recall:.3f} "
        f"F1={overall.f1:.3f} exact={overall.exact_match:.3f} "
        f"(tp={overall.tp} fp={overall.fp} fn={overall.fn} tn={overall.tn})"
    )
    lines.append("")
    lines.append(f"{'field':<24} {'P':>6} {'R':>6} {'F1':>6} {'exact':>6} {'n':>4}")
    lines.append("-" * 56)
    for name, fs in score.per_field.items():
        lines.append(
            f"{name:<24} {fs.precision:>6.3f} {fs.recall:>6.3f} "
            f"{fs.f1:>6.3f} {fs.exact_match:>6.3f} {fs.labelled:>4}"
        )
    if score.skipped:
        lines.append("")
        lines.append("Skipped / errored fixtures:")
        for item in score.skipped:
            lines.append(f"  - {item['fixture_id']}: {item['reason']}")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# CLI entry point
# --------------------------------------------------------------------------- #
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m cedocumentmapper_v2.eval.comparator",
        description="Score v2 extraction over a labelled fixture corpus.",
    )
    parser.add_argument(
        "corpus_dir",
        type=Path,
        help="Corpus directory containing expected/*.expected.json and instructions/.",
    )
    parser.add_argument(
        "--engine-name",
        default="v2",
        help="Label for the engine in the report (default: v2).",
    )
    parser.add_argument(
        "--json-out",
        type=Path,
        default=None,
        help="Write the structured JSON score report to this path.",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress the text summary on stdout.",
    )
    args = parser.parse_args(argv)

    if not args.corpus_dir.exists():
        parser.error(f"corpus_dir not found: {args.corpus_dir}")

    score = score_corpus(args.corpus_dir, engine=v2_engine(), engine_name=args.engine_name)

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(
            json.dumps(score.to_dict(), indent=2, ensure_ascii=False), encoding="utf-8"
        )

    if not args.quiet:
        print(summarize(score))

    # Non-zero exit when any fixture errored, so CI can gate on it.
    return 1 if score.skipped else 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())

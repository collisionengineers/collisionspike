# Eval Harness

The eval harness answers, repeatably and per field: *did a parser change make
extraction better or worse?* It has two parts:

- a **scored comparator** that runs an engine over a labelled corpus and reports
  per-field precision / recall / F1 / exact-match, and
- a **CI eval gate** that compares the live scores against a committed baseline and
  fails on any per-field regression.

Code: `src/cedocumentmapper_v2/eval/` (`comparator.py`, `ci_eval.py`,
`baseline.json`). Design origin:
`investigation/07-refactor-and-revamp-recommendation.md` Phase 1.

## The comparator

`python -m cedocumentmapper_v2.eval.comparator <corpus_dir>`

```bash
# Score the in-repo regression fixtures and print a text summary:
python -m cedocumentmapper_v2.eval.comparator tests/fixtures

# Also write a structured JSON report:
python -m cedocumentmapper_v2.eval.comparator tests/fixtures --json-out score.json

# Quiet (no stdout summary), custom engine label:
python -m cedocumentmapper_v2.eval.comparator tests/fixtures --quiet --engine-name v2
```

Exit code is non-zero when any fixture errored, so the comparator alone can gate
CI.

### Corpus shape

A corpus directory holds an `expected/` subdirectory of `*.expected.json` files
(validating against `docs/contracts/expected-fixture.schema.json`) and a sibling
`instructions/` directory with the source documents named by each fixture's
`source_file`. This is exactly the shape `tests/fixtures` already uses, so the
regression fixtures double as the comparator corpus. As a fallback, the loader also
accepts `*.expected.json` files placed directly in the corpus dir, with sources
alongside.

### Engine

An *engine* is a callable `(source_path) -> {field_name: value}`. The default
`v2_engine` wraps the shipped `DocumentMapperService`. A v1 (or prospective "new")
engine lives in a separate repo and is **never** imported here; to score an
alternative engine you pass your own adapter to `score_corpus`.

### Scoring

Scoring is computed only over the fields a fixture labels. Each labelled field's
engine value is compared to the expected value with an exact, whitespace-normalized
match (internal blank lines/spaces collapsed; newlines preserved so multi-line
fields like addresses still compare correctly), and bucketed:

- **tp** — expected non-blank and engine value matches.
- **fp** — engine produced a non-blank value that does not match.
- **fn** — expected non-blank but engine produced blank.
- **tn** — expected blank (or listed in `allowed_blank_fields`) and engine blank.

A wrong non-blank value counts once as fp and once as fn (standard slot-filling
scoring). `allowed_blank_fields` are treated as "blank is acceptable": an engine
blank there is an exact match, and a non-blank value there is not penalized.

Aggregated per field:

```
precision   = tp / (tp + fp)
recall      = tp / (tp + fn)
f1          = 2 * p * r / (p + r)
exact_match = (tp + tn) / labelled
```

The JSON report (`--json-out`) carries `overall`, `per_field`, `per_fixture`, and
`skipped` (errored fixtures).

## The CI eval gate

`python -m cedocumentmapper_v2.eval.ci_eval` wraps the comparator so CI can gate on
*per-field exact-match regression* against a committed baseline.

```bash
# Check the live corpus against the committed baseline (CI gate):
python -m cedocumentmapper_v2.eval.ci_eval

# Regenerate the baseline after a reviewed, intentional score change:
python -m cedocumentmapper_v2.eval.ci_eval --update-baseline

# Point at a different corpus / baseline:
python -m cedocumentmapper_v2.eval.ci_eval --corpus path/to/corpus \
    --baseline path/to/baseline.json
```

Flow:

1. Run the shipped v2 engine over the labelled corpus (default `tests/fixtures`).
2. Read the version-controlled baseline JSON (the minimum acceptable per-field and
   overall exact-match).
3. Any field whose live exact-match drops below its baseline floor (beyond a small
   float tolerance) is a **regression** and CI fails.

Exit code is `0` only when the gate passes **and** no fixture errored; otherwise
`1`.

### The baseline

Default location: `src/cedocumentmapper_v2/eval/baseline.json` (next to the module,
so it ships with the package). Shape:

```json
{
  "schema_version": 1,
  "engine": "v2",
  "corpus": "tests/fixtures",
  "tolerance": 0.0001,
  "overall_exact_match": 1.0,
  "per_field_exact_match": {
    "vrm": 1.0,
    "work_provider": 1.0
  }
}
```

`per_field_exact_match` is the *floor* per field; `overall_exact_match` is the
floor for the corpus aggregate.

Using a stored, updatable JSON baseline (rather than a hard-coded `== 1.0`) lets the
floor start at the current 100%-exact corpus yet remain a single, reviewable file.
When a deliberate change moves a field's score, a maintainer regenerates it with
`--update-baseline` and commits the diff; CI then guards the new floor. The
`--update-baseline` write records a repo-relative corpus label so the committed
baseline does not embed a machine-specific absolute path.

A field present in the baseline but absent from the live score is reported as a
`missing_field` regression (in the default `require_all_fields` mode), so a
labelled field silently vanishing from the corpus cannot hide a problem. Fields
scored live but absent from the baseline are reported as informational `new fields`
to record via `--update-baseline`.

## Notes

The repository's regression-fixture suite already exercises the same corpus; see
[`regression-strategy.md`](regression-strategy.md) for the broader fixture policy.
The test suite includes a deterministic v1-wins comparator placeholder that is
currently skipped.

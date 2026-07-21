# Extraction eval harness

Two layers live here:

- **`comparator.py`** — the scored comparator. Runs an extraction *engine* over a
  labelled corpus and computes per-field precision / recall / F1 / exact-match
  against the expected JSON. Ad-hoc / side-by-side use:

  ```bash
  PYTHONPATH=src python -m cedocumentmapper_v2.eval.comparator tests/fixtures
  PYTHONPATH=src python -m cedocumentmapper_v2.eval.comparator tests/fixtures \
      --json-out out/report.json
  ```

- **`ci_eval.py`** — the CI regression gate built on top of the comparator. It
  scores the in-repo labelled corpus (`tests/fixtures`) with the shipped v2
  engine and compares per-field exact-match against a committed baseline.

## CI usage

Gate the build (exit non-zero on any per-field/overall regression or errored
fixture):

```bash
PYTHONPATH=src python -m cedocumentmapper_v2.eval.ci_eval
```

This is also asserted by `tests/test_eval_harness.py`
(`test_v2_corpus_meets_or_exceeds_baseline`), so a regression fails `pytest` /
CI without needing the CLI wired into a separate pipeline step.

## The baseline (`baseline.json`)

A small, version-controlled JSON recording the **floor** each field's
exact-match must keep meeting:

```json
{
  "schema_version": 1,
  "engine": "v2",
  "corpus": "tests/fixtures",
  "tolerance": 0.0001,
  "overall_exact_match": 1.0,
  "per_field_exact_match": { "vrm": 1.0, "work_provider": 1.0, "...": 1.0 }
}
```

It ships next to `ci_eval.py` so it travels with the package. To **update** it
after a reviewed, intentional score change:

```bash
PYTHONPATH=src python -m cedocumentmapper_v2.eval.ci_eval --update-baseline
```

Then review and commit the `baseline.json` diff. Newly-labelled fields that
appear in the corpus but not the baseline are reported and (by default) treated
as a gate failure until recorded, so a field can't silently escape the gate.

The corpus is intentionally tiny and deterministic; the harness has no
private-corpus or network dependency.

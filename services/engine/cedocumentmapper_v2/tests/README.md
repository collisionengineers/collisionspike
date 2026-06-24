# Tests

The v2 test suite is fixture-first and exists today. As of 2026-06-24 it runs
**241 passed, 3 skipped** (the skips are environment-gated: Tesseract binary
absent x2, DOC-reader dependencies absent x1, plus a deterministic v1-wins
comparator placeholder).

Run it with:

```powershell
pytest
```

Groups:

- `tests/contract/`: JSON schema and domain contract tests.
- `tests/regression/`: end-to-end extraction tests over real sample documents.
- `tests/fixtures/`: source documents, expected provider matches, expected field values.

No parser change is complete until a fixture proves the behavior.

See the scored eval harness (`docs/testing/eval-harness.md`) for the corpus
comparator and CI eval gate that guard against per-field regression.

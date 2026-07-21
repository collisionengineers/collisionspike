# Evidence — Codex review findings on PR #145 (engine merge)

Captured from the automated Codex review inline comments on PR #145
(`engine/cedocumentmapper-merge`). Locations are relative to the canonical engine source
`services/engine/cedocumentmapper_v2/` unless noted.

| # | Location | Finding |
|---|---|---|
| 1 | `src/cedocumentmapper_v2/eval/comparator.py:100` | Exact-match denominator counts a wrong-non-blank field twice (`fp` + `fn`). |
| 2 | `src/cedocumentmapper_v2/eval/comparator.py:244` | Missing fixture source is silently dropped, not an error. |
| 3 | `src/cedocumentmapper_v2/eval/ci_eval.py:348` | `--update-baseline` writes even when fixtures errored/skipped. |
| 4 | `pyproject.toml:39` | Wheel omits `eval/baseline.json`, default corpus, root `providers.json`. |
| 5 | `src/cedocumentmapper_v2/readers/pdf.py:337` | Process-global `pytesseract` monkeypatch race under `OCR_PROVIDER=docintel`. |
| 6 | `services/functions/parser/function_app.py:100` | Fingerprint response keeps `ce-parser-fingerprint-v1` id after dropping its v1 fields — bump the contract id before redeploy. |

Findings 1–5 are non-blocking tooling/packaging refinements (eval code carried over from the archived
sibling; docintel path not currently in production use). Finding 6 is a contract-versioning concern to
resolve before the parser Function is redeployed.

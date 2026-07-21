# cedocumentmapper engine (`services/engine/cedocumentmapper_v2`)

Canonical, in-repo home of the document-extraction engine that parses instruction documents,
engineer reports, and scanned PDFs into the structured EVA field set. Authored here directly since
the engine merge (ADR supersedes ADR-0018); the former `cedocumentmapper_v2.0` sibling repository is
archived and no longer the authoring source.

## Ownership & contract

- **Owns:** the pure extraction pipeline — `readers/` (PDF/DOCX/DOC/EML/MSG + OCR fallback),
  `detection/` (content typing, provider detection), `rules/` (`email_classifier.py`,
  `engine.py`), `normalization/`, `exporters/`, `domain/`, `config/`, `resources/`, and
  `providers.json` (the provider-layout catalogue). `ui/paths.py` is retained only for its default
  path helpers (cloud callers override them); the desktop app (`__main__.py`, `cli.py`,
  `ui/host.py`, `frontend/`, PyInstaller build) is intentionally **not** part of this module.
- **Contract:** a Python package (`cedocumentmapper_v2`) whose public entry points are the
  `classify_email(...)` inbound-mail router and the per-document parse/extract API the parser
  Function invokes.

## Callers (do not import this path directly from a Function)

This directory is the **single authoring source**. It is not imported by any deployed Function
directly. Instead it is **materialized** — byte-for-byte — into each deployable copy by
`scripts/build/sync-engine.py`:

- `services/functions/parser/cedocumentmapper_v2/` — the `/api/parse` + `/api/classify-email` Function.
- `services/functions/ocr/cedocumentmapper_v2/` — the scanned-PDF OCR Function.

`scripts/checks/check-engine-materialized.py` (CI, in the hygiene + engine jobs) fails the build if
either materialized copy drifts from this source. **Edit here, then run `sync-engine.py`** — never
hand-edit a materialized copy.

## Tests & eval gate

- `python -m pytest tests -q` — unit + regression tests.
- The eval regression gate (`src/cedocumentmapper_v2/eval/ci_eval.py`) scores the fixture corpus
  under `tests/fixtures/` against `src/cedocumentmapper_v2/eval/baseline.json` and fails if the
  overall or per-field exact-match ratio drops below the committed floor. It requires the native
  `tesseract` binary for scanned-PDF fixtures (installed in the CI `engine` job).

## Configuration

- `providers.json` — provider-layout definitions (also materialized into each Function copy).
- No secrets. Cloud callers supply document bytes and override `ui/paths.py` defaults at runtime.

## Deployment

Not deployed on its own. Its materialized copies ship inside the parser and OCR Function Apps; run
`scripts/build/sync-engine.py` and commit the refreshed copies whenever this source changes.

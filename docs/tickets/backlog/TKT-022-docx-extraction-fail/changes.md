# Changes — TKT-022: .docx claim-form extraction fails
## Status
Distilled 2026-06-30 from spike-tickets-to-distill; not yet built.
## Commits
- No code changes yet.
## Summary
Captures a parsing failure on a Word .docx claim form (fields garbled / mis-mapped /
overflowing). Related to TKT-001 (parsing/classification at intake). Note: the
operator-note.md was empty, so the ask was reconstructed from the screenshots and
the sample .docx in evidence/.

## Reconciliation note (2026-07-07) — stays backlog, re-check before building
`.docx`/`.doc` are now **first-class readers** in the sibling/vendored engine
(`functions/parser/cedocumentmapper_v2/readers/docx.py` + `doc.py`) with a committed fixture
(`functions/parser/tests/fixtures/expected/ACSP_DOCX_01.expected.json`). The extraction path this ticket
reported as failing has materially changed since distillation (2026-06-30). **Re-run the Cheema
`A Cheema Claim Form docx.docx` sample against the current engine before assuming the field mis-mapping
still reproduces** — the residual (if any) may be narrower than the original drop-note. Stays backlog
pending that re-check.

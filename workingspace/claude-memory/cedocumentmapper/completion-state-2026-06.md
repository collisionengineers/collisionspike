---
name: completion-state-2026-06
description: "Real completion state of cedocumentmapper_v2.0 vs the stale \"scaffold/75%\" framing"
metadata: 
  node_type: memory
  type: project
  originSessionId: a0c18ed6-864d-43c3-8700-e021535e33bd
---

As of 2026-06-24, a multi-agent audit established the real completion picture (the "75% complete" figure the user referenced appears in NO tracked doc — it was an impression, not a written claim).

- **Two baselines.** Baseline A = v1 feature-parity behind v2 contracts (EPIC-00..11 + docs/plans/implementation-todos.md): **~82% complete**. Baseline B = the forward revamp vision (investigation/07 Phases 0-4 + audit case-type): **~8% complete** (only audit *detection* shipped). A blended "75%" is misleading.
- **The app is NOT a scaffold.** ~5,800 LOC: 1,639-line rule engine, full CLI with `console_scripts` entry point, readers (pdf/docx/doc/email), exporters (eva_json/rjs_docx), 529-line application service, 742-line pywebview host, 1,708-line React App.tsx. **pytest = 54 passed** (runnable in system Python 3.14.5 — PyMuPDF/python-docx/extract_msg/pytesseract/jsonschema/pydantic all installed; only `pywebview` is missing, GUI-only).
- **The docs are stale in BOTH directions** (the root cause of confusion): README.md:3,7,69 + AGENTS.md:5-7 call it a "scaffold / not implemented yet"; meanwhile cliplan.md:558-560 + comparisonreport.md:134-142 call the CLI a "launcher only / 5 percent / failed" — both contradicted by the working, tested code. Test counts drift (36 vs 53 vs actual 54). Fixing this is the final phase of the current effort.
- P0 contract gaps found (now being implemented): unmapped docs still emit a synthetic `unknown_temp` JSON record (service.py:96-110, violates EPIC-03); EVA JSON writes to Documents not the Shell Desktop (service.py:297, violates EPIC-06); EVA schema validation silently skips when the unbundled schema file is absent (eva_json.py:34); exit codes 3/6/7 + provider-import validation unimplemented.

See [[fullbuild-decisions-2026-06]] for the implementation scope the user chose.

**Update 2026-06-24 — the full build was executed and verified (still UNCOMMITTED on `feat/audit-case-type-detection`).** Test suite now **241 passed, 3 skipped** (skips env-gated: Tesseract×2, DOC deps×1, + a deterministic v1-wins comparator placeholder); frontend `tsc -b && vite build` clean (~1759 modules), eslint clean. Delivered across 4 waves: P0 contract fixes + P1 tests/CLI; audit case-type (`A.`-prefix → internal `is_audit`, kept out of EVA export) + OCR `--force-ocr` + scored comparator (`eval/`); opt-in extraction orchestrator + table/geometry strategies (`extraction/`) + full opt-in OFFLINE local-model assist (`extraction/llm_assist.py`, env `CEDM_LLM_ASSIST`/`CEDM_LLM_ENDPOINT`/`CEDM_LLM_MODEL`, OFF by default, review-only) + teach-by-example + CI eval gate + Tesseract footprint trim; frontend componentized (`bridge.ts`/`types.ts`/`components/`/`hooks/`) with PDF source overlay, diagnostics panel, confidence triage, keyboard a11y, batch mode, AUDIT badge, LLM suggestions panel. Docs reconciled: README/AGENTS de-scaffolded, EPIC tickets became acceptance trackers, cliplan/comparisonreport marked SUPERSEDED, new docs (extraction-orchestrator, llm-assist, eval-harness, audit-case-type) + `docs/STATUS.md`. **Caveat:** GUI review-UX is build/lint-verified only — pending manual QA in a running pywebview app (pywebview can't run headlessly here). I also fixed a regression the table work introduced (PyMuPDF `find_tables()` advisory polluting CLI JSON stdout — suppressed at fd level in `readers/pdf.py`).

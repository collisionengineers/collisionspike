# Changes — TKT-017: Registration-recognition model research + bench

## Status
now → ready for verify — the benchmark + recommendation deliverable is written; a runnable harness
with a captured real (TIER A) run is in place. No pipeline built (that is TKT-016). Research/bench only.

## Commits
- `<pending>` — docs(tickets): TKT-017 reg-OCR benchmark + recommendation + runnable harness (TIER A real run)

## Files touched
- `docs/tickets/now/TKT-017-ai-reg-ocr/evidence/reg-ocr-benchmark.md` (the deliverable — benchmark + recommendation)
- `docs/tickets/now/TKT-017-ai-reg-ocr/evidence/harness/plate_bench.py` (scorer: TIER A shared-decision-layer real run + TIER B engine-adapter contract)
- `docs/tickets/now/TKT-017-ai-reg-ocr/evidence/harness/bench-manifest.json` (labelling schema + PII-safe corpus refs)
- `docs/tickets/now/TKT-017-ai-reg-ocr/evidence/harness/README.md` (how to run; PII rules; TKT-016 hand-off)
- `docs/tickets/now/TKT-017-ai-reg-ocr/evidence/harness/results/decision-layer-run.{txt,json}` (captured TIER A run)
- `docs/tickets/now/TKT-017-ai-reg-ocr/changes.md`, `verification.md` (this)

## Summary
Delivered the reg-OCR **benchmark + recommendation** ([evidence/reg-ocr-benchmark.md](./evidence/reg-ocr-benchmark.md))
comparing the candidates on accuracy/cost/latency/residency. Key live-fact correction: `digital-3339-resource`
now has **gpt-5** deployed (the research pack's "zero deployments" is stale), and **two reg-read paths are
already live** — the incumbent `fast-alpr` `/api/plate-ocr` route and the gpt-5 vision classifier
(`image-classify.ts`, TKT-064). **Recommendation:** reg-OCR of record = local `fast-alpr` (primary) / DI Read
(uksouth fallback) — both UK-resident, zero-egress; a **vision model-egress flip is NOT justified for reg-OCR
alone** (that is the PLAN-001 Phase-4 gate this ticket answers); keep the GlobalStandard gpt-5 VLM for the
richer observations only it does well (role, visibility tri-state, reflection, location) under a DPIA owned by
TKT-016. A detected VRM stays a suggestion, never `case_.vrm` (ADR-0013). A runnable harness mirrors the
`scripts/eval-email/` pattern: TIER A scored the **real shipped** `ocr/plate_adapter.py` decision layer
(10/10 to contract, 3 named findings — F1 scene-text false positive, F2 split-line recall gap, F3 no
visible-but-unreadable tri-state); TIER B (raw-OCR-on-image accuracy) is a pluggable stub because this box has
no ONNX wheels (Python 3.14) and no live Azure token, ready for the operator to run against a labelled photo
corpus. No labelled overview corpus exists in-repo (only 4 TKT-040 damage photos, one with a partial plate) —
stated plainly, with the labelling schema defined for the G5 corpus that TIER B needs.

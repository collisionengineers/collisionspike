# Verification — TKT-017: Registration-recognition model research + bench

## Verdict
PENDING

## Evidence
The Acceptance ("a short benchmark + recommendation comparing the candidate models on
accuracy/cost/latency") is a **document** deliverable, not a live pipeline. It exists:

- [`evidence/reg-ocr-benchmark.md`](./evidence/reg-ocr-benchmark.md) — the benchmark + recommendation
  (candidate set with verified live state, metric definitions across 3 axes, accuracy/cost/latency/residency
  comparison, and a clear recommendation with the Phase-4 flip verdict).
- [`evidence/harness/`](./evidence/harness/README.md) — a runnable harness. TIER A scored the **real shipped**
  `ocr/plate_adapter.py::_build_result`: **10/10 scenarios match the documented contract**, mean ~17 µs/call;
  captured in [`evidence/harness/results/decision-layer-run.txt`](./evidence/harness/results/decision-layer-run.txt).
  Three findings surfaced (F1 scene-text false positive, F2 split-line recall gap, F3 no visible-but-unreadable
  tri-state).

This is a research/bench ticket — the implementer cannot self-certify; a verifier should confirm the checks
below.

## Pending / gaps
- **TIER B not run** (raw-OCR-on-image accuracy per engine) — no labelled overview corpus exists in-repo
  (only 4 TKT-040 damage photos, one with a partially-cropped plate). This is an expected gap, honestly
  stated in §7; the labelling schema is defined and the harness is ready. It needs a G5 photo corpus with
  ground-truth VRMs in a gitignored overlay — an operator/azure-integration-engineer task, not a bug.
- Confidence-calibration metric is unmeasured (needs the TIER B corpus).

## How to re-verify (concrete checks for the verifier)
1. **Deliverable exists + is reachable:** `evidence/reg-ocr-benchmark.md` is present and linked from
   `changes.md`; `node scripts/check-doc-links.mjs` passes (no broken links, no orphan, no live-number
   leakage). `node scripts/check-tickets.mjs` passes.
2. **Recommendation is sound + grounded in live facts:** the doc names `fast-alpr` (primary) + DI Read
   (uksouth fallback) as reg-OCR of record and gpt-5 vision as the (DPIA-gated) image-analysis producer;
   cross-check its live claims against `LIVE_FACTS.json` — (a) `PLATE_OCR_ENABLED=true` on `cespk-orch-dev`
   and the `/api/plate-ocr` route on `cespkocr-fn-dev-glju3v`; (b) `IMAGE_ROLE_CLASSIFY_ENABLED=true` +
   gpt-5 deployed on `digital-3339-resource` (GlobalStandard); (c) `cespkdocintel-dev` present (DI Read F0,
   uksouth). All three are in the registry.
3. **The real run reproduces:** from `evidence/harness/`, `python plate_bench.py` prints "10/10 scenarios
   match the layer's documented contract" and the F1/F2/F3 findings; output matches
   `results/decision-layer-run.txt`.
4. **Hand-off is actionable:** §9 gives TKT-016 the reg-read decision, the DPIA scope, the observation-record
   schema, and the ready TIER B harness.

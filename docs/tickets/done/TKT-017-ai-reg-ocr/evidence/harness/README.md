# reg-OCR benchmark harness (TKT-017)

A reproducible yardstick for the registration-recognition comparison in
[`../reg-ocr-benchmark.md`](../reg-ocr-benchmark.md). Deliberately shaped like the
email-classifier eval harness (`scripts/eval-email/`): a labelled corpus
([`bench-manifest.json`](./bench-manifest.json)) + a scorer
([`plate_bench.py`](./plate_bench.py)) + a redacted results file, with the same
PII discipline.

## Two tiers (reg-OCR has two separable layers)

**TIER A — the shared post-processing decision layer (runs here, zero deps).**
Every candidate engine (fast-alpr, Document Intelligence Read, gpt-5 vision)
eventually hands raw OCR candidate strings to the *same* production code that
decides `registration_visible` / `vrm_match` / `plate_text`:
`ocr/plate_adapter.py` (`normalise_vrm`, `_looks_like_plate`, `_build_result`).
Those functions are pure and import nothing heavy, so the harness scores them
directly over a labelled set of candidate scenarios and reports the metrics that
are **identical across engines** (exact normalised-VRM match, VRM normalisation,
one-char misread, scene-text false positive, split-across-lines, empty). The
captured run is in [`results/decision-layer-run.txt`](./results/decision-layer-run.txt)
(+ `.json`).

```bash
python plate_bench.py                                # TIER A (real run, no deps)
python plate_bench.py --json-out results/run.json    # + machine-readable
```

**TIER B — raw-OCR-on-image accuracy per engine (NOT run here; pluggable).**
Turning an actual JPEG into candidate strings is the engine-specific part.
`ENGINES` in `plate_bench.py` defines the adapter contract; the three adapters
are **stubbed** because this box cannot run them:

- `fast_alpr` — needs `onnxruntime` + `fast-alpr` (no cp314 wheels; this box is
  Python 3.14 with no numpy). Wire it to `ocr/plate_adapter.read_plate(provider="fast_alpr")`.
- `docintel` — needs a live `cespkdocintel-dev` credential. Wire to
  `ocr/plate_adapter.read_plate(provider="docintel")`.
- `gpt5_vision` — needs a Cognitive Services token for `digital-3339-resource`.
  Reuse the semantics of `orchestration/src/lib/image-classify.ts`.

```bash
# once an adapter + a labelled photo corpus exist:
python plate_bench.py --engine fast_alpr --corpus <photo-manifest.json>
```

## PII rules (same as `scripts/eval-email/README.md`)

The real evidence photos carry customer registrations. Therefore:

1. **`bench-manifest.json` (committed)** carries **no ground-truth registration** —
   only file paths, axis, and a PII-safe `shape_note`. Ground-truth VRMs go in a
   **gitignored overlay** keyed by `overlayKey` (put it under
   `test-cases-and-data/e-mail-examinations/` or another `.gitignore`d path).
2. **`results/*.json|txt` (committed)** for TIER A are synthetic-only (fake VRMs).
   A TIER B results file MUST be redacted (aggregate accuracy + per-metric counts,
   **no** detected/ground-truth VRM tokens) before it is committed — prefer keeping
   raw per-image TIER B output local (`--json-out /tmp/...`).
3. **Reporting** cites ticket ids + filenames + aggregate numbers only — never a
   registration, name, or claim ref.

## Assembling a real TIER B corpus

The 4 committed items are TKT-040 damage close-ups (one has a partially-cropped
plate). They are **not** the whole-vehicle *overview* shot the EVA image-rule
needs. A representative run wants ~30-50 labelled real overview photos pulled from
the evidence store under the **G5** allowance — see `corpusGaps` in the manifest.
This is the one piece a research/desk session cannot fabricate; the harness is
ready for the operator / `azure-integration-engineer` to run it once that corpus
and an engine adapter exist.

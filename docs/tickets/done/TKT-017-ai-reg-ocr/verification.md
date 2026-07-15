# Verification — TKT-017: Registration-recognition model research + bench

Verified by: ticket-verifier dispatch, 08-07-26

## Verdict
TESTED (offline)

This is a research/bench ticket whose Acceptance ("a short benchmark + recommendation comparing the
candidate models on accuracy/cost/latency") is a **document + runnable harness** deliverable, explicitly
allowing offline-only proof (nothing is deployed; the batch is dark). TESTED (offline) is the expected
ceiling and is sufficient to close.

## Evidence

**Acceptance line — "a short benchmark + recommendation on accuracy/cost/latency":**
- `evidence/reg-ocr-benchmark.md` is a genuine 10-section comparison, not a stub: three separable axes
  (A clean-crop OCR / B full-photo end-to-end / C visibility), four candidates (`fast-alpr` incumbent,
  Azure DI Read `prebuilt-read`, gpt-5 GlobalStandard VLM, specialist UK ALPR), dedicated accuracy (§5),
  cost+latency+residency (§6) tables, and a clear headline recommendation (§Recommendation TL;DR + §8) with
  the PLAN-001 Phase-4 flip verdict.

**Harness reproduces** (ran `python evidence/harness/plate_bench.py` from repo root, exit 0; see
[`evidence/harness/`](./evidence/harness/README.md)):
- Prints `10/10 scenarios match the layer's DOCUMENTED contract` and all three findings
  `[F1_scene_text_false_positive]`, `[F2_split_line_recall_gap]`, `[F3_no_visible_but_unreadable_tristate]`
  — identical to the captured `results/decision-layer-run.txt`.
- Scores the **real shipped production code**: `import plate_adapter` from `services/functions/ocr/plate_adapter.py`;
  `normalise_vrm`, `_looks_like_plate`, `_build_result` confirmed present; `_looks_like_plate` is
  `len∈[MIN,MAX]` + `letters>=2 and digits>=1`, exactly matching the F1 "MAX 30 → MAX30 passes the lenient
  gate" claim. Not a mock. (Only difference: mean latency ~34 µs vs captured ~17 µs — expected per-machine
  variance on a µs-scale pure-function timing; the substantive result is byte-identical.)

**Live claims reconcile against `LIVE_FACTS.json`** (read the file, not live Azure):
- `PLATE_OCR_ENABLED=true` on `cespk-orch-dev` — confirmed; `/api/plate-ocr` on OCR Function
  `cespkocr-fn-dev-glju3v` — confirmed (with the TKT-115 host correction).
- gpt-5 on `digital-3339-resource`, GlobalStandard (modelVersion 2025-08-07) — confirmed; the
  "GlobalStandard may infer in any region" egress point matches the registry `dataProcessing` note.
- `cespkdocintel-dev` (DI Read) present, uksouth — confirmed in `resourceInventory`.
- The research pack's "zero deployments" line is stale and the deliverable corrected it (benchmark §2
  "Registry correction").

**Recommendation soundness:** internally consistent — reg-OCR of record = `fast-alpr` primary (localises →
avoids the F1 whole-photo false positive) / DI Read uksouth fallback, both UK-resident/zero-egress; the
vision-model-egress flip is judged NOT justified for reg-OCR alone, with the VLM retained for
scene-understanding (axis-C visibility tri-state F3, role, reflection, location) under a DPIA scoped to
TKT-016. The ADR-0013 invariant (a detected VRM is a suggestion, never `case_.vrm`) is upheld across all
candidates.

**Ticket-integrity gates:** `node scripts/checks/check-tickets.mjs` → 0 failures / 0 warnings;
`node scripts/checks/check-doc-links.mjs` → PASS links / orphans / leakage.

## Pending / gaps

**Expected absences (not defects — allowed by research/P2 scope + offline-allowed Acceptance):**
- **TIER B (raw-OCR-on-image per-engine accuracy) not run** — no committed labelled *overview* corpus exists
  in-repo (only 4 TKT-040 damage close-ups, one with a partially-cropped plate). Honestly stated in §7 /
  `bench-manifest.json` `corpusGaps` / `changes.md`. Needs a ~30–50-photo G5 corpus with ground-truth VRMs
  in a gitignored overlay — an operator / azure-integration-engineer task. The adapter contract + labelling
  schema are ready.
- **Confidence-calibration metric unmeasured** — depends on the TIER B corpus.

**Minor registry-tracking / cosmetic notes (not acceptance failures):**
- `IMAGE_ROLE_CLASSIFY_ENABLED=true` is confirmed only via the `LIVE_FACTS.json` `verifiedBy` narrative log,
  not the structured `gates` block — a registry-hygiene nit, not a benchmark defect.
- The benchmark's "DI Read F0" SKU tier is not registry-confirmed (resource listed, uksouth, no SKU field);
  not load-bearing for the recommendation.
- `changes.md` "Files touched" still lists `now/` paths (cosmetic staleness from the now→verify move; all
  files are present under `verify/`).

## How to re-verify
1. From repo root: `python docs/tickets/done/TKT-017-ai-reg-ocr/evidence/harness/plate_bench.py` — expect
   `10/10 scenarios match` + the F1/F2/F3 findings block (exit 0). It imports the real `services/functions/ocr/plate_adapter.py`.
2. Registry cross-check in `LIVE_FACTS.json`: `gates.cespk-orch-dev.PLATE_OCR_ENABLED`,
   `.OCR_FN_URL` (cespkocr-fn-dev-glju3v); `foundry.value.deployments[].name` (gpt-5, GlobalStandard);
   `resourceInventory` contains `cespkdocintel-dev`. IMAGE_ROLE_CLASSIFY_ENABLED is in the `verifiedBy`
   narrative — grep for it.
3. Gates: `node scripts/checks/check-tickets.mjs` and `node scripts/checks/check-doc-links.mjs` — both exit 0.
4. Read `evidence/reg-ocr-benchmark.md` §Recommendation + §8 for the fast-alpr(+DI Read)/no-VLM-egress-for-reg
   call and §9 for the TKT-016 hand-off.

## Confidence + unread surfaces
High confidence for the offline verdict. The harness exercised the actual shipped decision layer (not a mock)
and reproduced the documented run; every headline live claim reconciles with the registry file. Live Azure
was not touched (read-only, dark/offline-scoped). Unprovable by design: raw-OCR accuracy on real UK plate
*images* (TIER B) — requires a labelled PII photo corpus + an installed engine this environment lacks;
correctly deferred to the operator, and does not block closing a research/bench ticket whose Acceptance
allows offline-only proof.

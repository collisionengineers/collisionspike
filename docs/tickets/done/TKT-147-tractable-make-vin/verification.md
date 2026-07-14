# Verification — TKT-147: Tractable layout: capture vehicle make (two-label rule) + a VIN field slot

## Verdict
TESTED (offline)

Certified by the orchestrating loop, 10-07-26. The Acceptance is explicitly offline-only
("with fixtures" + "no regression in the sibling suite"), so `now → done` on offline proof is the
agreed lifecycle path (docs/tickets/README.md §Lifecycle); no live claim is made — the vendored
Function rides the next parser deploy and the live /parse stays engine-v2.13 until then.

## Evidence
- **Acceptance line 1 (make + model + VIN with fixtures):**
  [evidence/fixture-extractions.txt](./evidence/fixture-extractions.txt) — TRACTABLE 01 →
  `vehicle_model="Volkswagen Touran"` + `vin="WVGZZZ1TZFW030347"`; TRACTABLE 02 (new fixture) →
  `"Hyundai i30"` + `vin=""` (the `-` placeholder; absence is not an error); LINE_LEVEL_ESTIMATE →
  `"Toyota Auris"`, vin absent. All three detect the `tractable` layout at 1.0; the 12-key EVA
  extraction block is byte-shape-identical (no vin key leaks into the EVA contract).
- **Acceptance line 2 (no sibling regression):** sibling suite baseline 439 passed / 4 skipped →
  after 451 passed / 4 skipped (+12 new, zero regressions), on sibling commit `2609b1a`, annotated
  tag `engine-v2.14` pushed to origin (ls-remote verified). Eval baseline moved only upward
  (overall 0.9483 → 0.9571; new `vin: 1.0`). Vendored-copy suite identical before/after
  (1 pre-existing environmental failure `test_multiformat_extraction[ALS_doc]` on this box,
  281 passed, drift guard green).

## Pending / gaps
- Engine work is sibling-first code-complete and re-vendored; the vendored parser
  Function rides the NEXT parser deploy (no deploy this ticket, per the dispatch
  brief) — the LIVE /parse still runs engine-v2.13 until then.
- The repair build exposes VIN as the top-level `/parse` `vin` field cell. The orchestration
  typed envelope and SPA parser adapter preserve it outside `extraction`; it is not rendered
  or written into EVA. Live proof remains pending the parser redeploy.

## How to re-verify
1. Offline (acceptance allows offline proof — fixtures): in the sibling
   `..\cedocumentmapper_v2.0`, `python -m pytest tests/test_regression.py
   tests/test_rules.py tests/test_normalization.py tests/test_exporters.py -q`
   — the `tractable_01` fixture pins `vehicle_model="Volkswagen Touran"` +
   `vin="WVGZZZ1TZFW030347"`; `tractable_02` pins the no-VIN sample
   (`vin=""` from the `'-'` placeholder; absence is not an error).
2. Vendored copy: `cd functions/parser && python -m pytest -q` — drift guard
   (`test_engine_vendored_in_sync.py`) green against the sibling
   `engine-v2.16` tree; judge against the recorded pre-existing environmental
   failure on this box (`test_multiformat_extraction[ALS_doc]`).
3. After the next parser deploy: POST a Tractable sample PDF to the live
   `/parse` route and confirm `extraction.vehicle_model.value` is make+model and
   `vin.value` is the VIN (or `""` on the no-VIN samples); assert `extraction`
   still has exactly 12 keys and does not contain `vin`.

## Regression verification — 2026-07-11

**Verdict: TESTED (offline) — deployment pending.**

This block supersedes the earlier offline/done wording for the PR 55 wrapper repair. Engine extraction
was proven before, but the repaired `/parse` envelope is not live until the parser is redeployed.

- Sibling engine `v2.16` is tagged/pushed and the vendored tree matches it. Targeted Tractable/VIN,
  banner-recall and EVA tests pass; the full Windows parser run is 270 passed / 28 skipped with the one
  recorded pre-existing legacy `.DOC` environmental failure unchanged from main.
- `functions/parser/tests/test_parse.py` and the OpenAPI contract pin top-level VIN
  value/source/confidence. Orchestration parse and SPA parser-adapter tests preserve that envelope.
  EVA serializer tests prove the settled 12-field export remains unchanged and contains no VIN.
- Deployment proof still required: deploy the parser from the merged release SHA, POST both Tractable
  fixtures, verify VIN presence/absence at the top level and reassert the 12-field EVA body is
  byte-shape compatible.

## Verdict update — 2026-07-14 (independent PLAN-005 sweep; transcribed verbatim)

## Verdict

VERIFIED-LIVE

## Evidence

- **Original acceptance 1 — Tractable fixtures extract make + model and VIN where present:**
  `evidence/fixture-extractions.txt:1-46` is the exact fixture artifact: TRACTABLE 01 →
  `Volkswagen Touran`, VIN `WVGZZZ1TZFW030347`; TRACTABLE 02 → `Hyundai i30`, VIN absent from the `-`
  placeholder; the third real sample → `Toyota Auris`, VIN absent. All detect `tractable` at 1.0 and
  retain the settled 12-key EVA shape.
- **Original acceptance 2 — no sibling regression:** `verification.md:18-23` records sibling 439 passed/4
  skipped → 451 passed/4 skipped (+12, zero regressions) for `engine-v2.14` commit `2609b1a`.
  Independent provenance verification today passed the current immutable mirror: `[vendor-pin] PASS
  engine-v2.24 @ e9cec4acb8f1f49fb81c4d279d3a31cc82356d84 (36 files; immutable tag verified)`. The official
  remote tag peels to that exact commit, and Git proves TKT-147 source commit `2609b1a` is an ancestor of
  both deployed `engine-v2.16` (`8dd4ba8`) and current locked `engine-v2.24` (`e9cec4a`).
- **Regression acceptance 1 — `/parse` exposes VIN value/source/confidence:**
  `functions/parser/tests/test_parse.py` pins the top-level VIN envelope, while
  `changes-regression-11-07-26.md:14-17` records the Function/orchestration/SPA contract propagation.
  Wrapper commit `56161d3` is an ancestor of both deployed PR 55 merge `c7e78cc` and corrected runtime
  `3cc4705`. `.azure/deployment-plan.md:334-341` records parser publication and a live `12-field/VIN`
  smoke returning 200. A fresh read-only 72-hour parser query independently shows sustained live
  `/api/parse` 200 responses from role `cespike-parser-dev-x7xt3d5ovhi7y`; no request was created for this
  verification.
- **Regression acceptance 2 — VIN remains absent from settled EVA:**
  `evidence/fixture-extractions.txt:40-46` records the VIN-bearing engine record alongside exactly 12 EVA
  keys and `vin in EVA extraction: False`; `changes.md:23-31,69-73` identifies
  `EVA_EXPORT_FIELD_ORDER` as the exclusion boundary. The deployed release's recorded `12-field/VIN`
  smoke is the live artifact for that combined boundary.
- **Regression acceptance 3 — OpenAPI and route tests pin both behaviors:** `verification.md:56-61` names
  the parser route tests, OpenAPI schema, orchestration type and SPA adapter tests; the exact released
  candidate passed parser contracts/OpenAPI and vendored-tag drift before publish
  (`.azure/deployment-plan.md:244-249,266-267,310`).

## Pending / gaps

- No acceptance line remains open. The ticket's stale `deployment pending` wording at
  `verification.md:49-64` is superseded by the 2026-07-11 release proof: parser published, VIN/12-field
  smoke returned 200, and the exact wrapper commit is in the deployed ancestry.
- The current repository has advanced from deployed `engine-v2.16` to immutable `engine-v2.24`; that is
  not a TKT-147 gap because both tags descend from the TKT-147 `engine-v2.14` source commit and the current
  vendor mirror independently verifies byte-for-byte.

## How to re-verify

1. Run the sibling Tractable/rule/normalization/export fixture slice at the locked tag and run
   `python -B functions/parser/scripts/verify_vendor_pin.py --sibling <official sibling clone>`; require
   the immutable-tag PASS.
2. Against the deployed parser, use the retained non-sensitive TRACTABLE 01 and 02 fixtures through the
   normal authorized smoke path. Require make+model on both; top-level VIN value/source/confidence on
   TRACTABLE 01; an honest absent VIN on TRACTABLE 02; exactly 12 EVA extraction keys and no `vin` key in
   EVA for either.
3. Record the response bodies with the deployed source/tag, then confirm normal `/parse` telemetry remains
   200 with no new parser exception.

## Confidence + unread surfaces

High confidence. Every acceptance line has a fixture/contract artifact, immutable sibling provenance,
deployed commit ancestry and live release evidence. The only unread surface in this independent pass is
the raw response body from the banked 2026-07-11 VIN/12-field smoke and today's naturally occurring parse
calls; the deployment record is relied on for that body assertion, while current telemetry independently
confirms the deployed route remains active and successful.

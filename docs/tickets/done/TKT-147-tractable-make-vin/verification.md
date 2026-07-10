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
- The /parse response's `fields` map carries the new `vin` key (via
  `record_to_dict`), but no api/orch consumer reads it yet (out of scope here).

## How to re-verify
1. Offline (acceptance allows offline proof — fixtures): in the sibling
   `..\cedocumentmapper_v2.0`, `python -m pytest tests/test_regression.py
   tests/test_rules.py tests/test_normalization.py tests/test_exporters.py -q`
   — the `tractable_01` fixture pins `vehicle_model="Volkswagen Touran"` +
   `vin="WVGZZZ1TZFW030347"`; `tractable_02` pins the no-VIN sample
   (`vin=""` from the `'-'` placeholder; absence is not an error).
2. Vendored copy: `cd functions/parser && python -m pytest -q` — drift guard
   (`test_engine_vendored_in_sync.py`) green against the sibling
   `engine-v2.14` tree; judge against the recorded pre-existing environmental
   failure on this box (`test_multiformat_extraction[ALS_doc]`).
3. After the next parser deploy: POST a Tractable sample PDF to the live
   `/parse` route and confirm the response `fields.vehicle_model.value` is
   make+model and `fields.vin.value` is the VIN (or `""` on the no-VIN
   samples); the 12-field EVA `extraction` block must NOT contain a vin key.

# Verification — TKT-147: Tractable layout: capture vehicle make (two-label rule) + a VIN field slot

## Verdict
PENDING

## Evidence
(not yet verified — implementer-recorded offline evidence lives in
[evidence/fixture-extractions.txt](./evidence/fixture-extractions.txt) and the
sibling suite numbers in [changes.md](./changes.md); the verifier certifies.)

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

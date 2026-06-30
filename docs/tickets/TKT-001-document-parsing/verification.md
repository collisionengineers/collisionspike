# Verification — TKT-001: Fix multi-format document extraction regression

## Verdict
VERIFIED-LIVE

## Evidence
Live e2e (2026-06-30, two cases since the 10:21Z clean-slate reset):
- `dc307411` (connexus, no provider match — partial path): 8 EVA columns populated (vrm, vehicle_model, claimant_name, claimant_telephone, date_of_loss, date_of_instruction, vat_status, mileage) + 7 `field_level_provenance` rows (source_label "From instructions").
- `ca3acf21` = Case/PO `QDOS26001` (full happy path): 6 EVA columns + 5 provenance rows, including a multiline `accidentCircumstances`.
- Orchestration `caseResolve` ran 6× with 0 failures; the parse activity ran 6/0.
- Unit test: `api/src/lib/parser-eva-fields.test.ts` (6 cases).
DB reads were cross-checked against App Insights custom events.

## Pending / gaps
Not all 12 EVA fields fill when the source instruction lacks them — `eva_claimant_email` / `eva_inspection_address` / `eva_accident_circumstances` are NULL on `dc307411`, and `eva_vat_status` is NULL on `QDOS26001`. This is EXPECTED (field absent in source), not a regression.

## How to re-verify
Send a multi-format instruction to a live intake mailbox, let the case mint, then query the case's EVA columns and `field_level_provenance` rows in Postgres and cross-check the `parse` / `caseResolve` custom events in App Insights. Run the unit test `parser-eva-fields.test.ts` for the offline mapping.

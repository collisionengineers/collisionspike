# Verification — TKT-001: Fix multi-format document extraction regression

## Verdict (original pass)
VERIFIED-LIVE

## Evidence (original pass, 2026-06-30)
Live e2e (two cases since the 10:21Z clean-slate reset):
- `dc307411` (connexus, no provider match — partial path): 8 EVA columns populated (vrm, vehicle_model, claimant_name, claimant_telephone, date_of_loss, date_of_instruction, vat_status, mileage) + 7 `field_level_provenance` rows (source_label "From instructions").
- `ca3acf21` = Case/PO `QDOS26001` (full happy path): 6 EVA columns + 5 provenance rows, including a multiline `accidentCircumstances`.
- Orchestration `caseResolve` ran 6× with 0 failures; the parse activity ran 6/0.
- Unit test: `api/src/lib/parser-eva-fields.test.ts` (6 cases).
DB reads were cross-checked against App Insights custom events.

## Follow-up verdict (2026-07-01 — QDOS triage accident circumstances)
**VERIFIED-LIVE** (parser deploy + live `/api/parse` probe). **Intake body-supplement path:** `TESTED (offline)` on follow-up narrative + deployed to `cespk-orch-dev`; Postgres re-intake proof on `QDOS26010` pending next triage email.

### Evidence — follow-up
- **Live parser** (`cespike-parser-dev`, 2026-07-01): `POST /api/parse` with follow-up triage `.eml` + `provider_hint=QDOS` returns populated `accident_circumstances` (Redbridge Flyover narrative) and `vrm=VN64WNG`.
- **Deploy:** `cespike-parser-dev` + `cespk-orch-dev` config-zip deploy succeeded after re-vendor.
- **Offline:** `orchestration/src/lib/supplement-parse.test.ts` (3/3) — extracts the follow-up narrative between `Accident Circumstances` and `Damage Description`.
- **Sibling engine:** alternate `between_labels` pairs + `QDOS_TRIAGE_01` fixture (pytest; LibreOffice path skips without `soffice`).
- **Drift guard:** `functions/parser/tests/test_engine_vendored_in_sync.py` (6/6, prior session).

### Pending / gaps (follow-up)
- **E2e intake on attachment-first path:** intake prefers the attached `.doc`; on FC1 the binary scrape still cannot reach LibreOffice. The orchestration body supplement closes this when parser returns empty — confirm on the next triage QDOS re-intake (`eva_accident_circumstances` + provenance row in Postgres for a `QDOS26010`-class case).
- **Legacy `.doc` table fidelity on FC1** without re-intake: requires a future **custom-container** parser image (LibreOffice baked in) — see [changes-regression-01-07-26.md](./changes-regression-01-07-26.md) and [ROADMAP.md](../../../ROADMAP.md) Later.

### Pending / gaps (original)
Not all 12 EVA fields fill when the source instruction lacks them — `eva_claimant_email` / `eva_inspection_address` / `eva_accident_circumstances` are NULL on `dc307411`, and `eva_vat_status` is NULL on `QDOS26001`. This is EXPECTED (field absent in source), not a regression.

## How to re-verify
**Original:** Send a multi-format instruction to a live intake mailbox, let the case mint, then query the case's EVA columns and `field_level_provenance` rows in Postgres and cross-check the `parse` / `caseResolve` custom events in App Insights. Run `parser-eva-fields.test.ts`.

**Follow-up:** Re-forward the triage QDOS sample (or equivalent) to a production intake mailbox; after mint, confirm `eva_accident_circumstances` on the new case. Offline: `POST /api/parse` with the follow-up `.eml` + `provider_hint=QDOS`; run `npm test` in `orchestration/`; run sibling `pytest -k QDOS`.

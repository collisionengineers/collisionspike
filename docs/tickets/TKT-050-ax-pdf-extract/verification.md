# Verification — TKT-050: AX PDF accident circumstances extraction too deep

## Verdict
TESTED (offline)

## Evidence
- `cedocumentmapper_v2.0` venv: `pytest tests/test_extraction_targeted.py -k ax_accident` → **2 passed**
  - `test_ax_accident_circumstances_stops_before_pre_existing_damage`
  - `test_ax_accident_circumstances_falls_back_to_bodyshop_when_no_pre_existing`
- Before fix, AX audit records (`AX_01`, `AX_03`, `AX_04`) included trailing `Pre Existing\n…\nDamage` in circumstances.

## Pending / gaps
- Parser Function redeploy required for live intake to pick up vendored `providers.json` + engine fix.
- Live Postgres proof on a re-intake of [sample .eml](./New%20inspection%20request%20-%20AX%20Ref1074398.eml) not yet run.

## How to re-verify
1. Redeploy `cespike-parser-dev` (parser config zip per `docs/azure/deploy.md`).
2. Re-intake the sample AX email (or POST `/api/parse` on the attached PDF).
3. Confirm `accident_circumstances` / `eva_accident_circumstances` has narrative only — no `Pre Existing` / `Damage` tail.

# Verification — TKT-050: AX PDF accident circumstances extraction too deep

## Verdict
VERIFIED-LIVE (2026-07-01)

## Evidence
- Offline (`cedocumentmapper_v2.0`): `pytest tests/test_extraction_targeted.py -k ax_accident` → **2 passed**.
- Before fix, AX audit records (`AX_01`, `AX_03`, `AX_04`) included trailing `Pre Existing\n…\nDamage` in circumstances.
- Deploy: `cespike-parser-dev-x7xt3d5ovhi7y` config-zip (2026-07-01).
- Live: `POST /api/parse` on [sample .eml](./evidence/new-inspection-request-ax-ref1074398.eml) with `provider_hint=ax` → `accident_circumstances` narrative only (223 chars); **no** `Pre Existing` / `Damage` tail.

## Pending / gaps
None.

## How to re-verify
1. Re-intake the sample AX email or `POST /api/parse` on the attached PDF/eml.
2. Confirm `accident_circumstances` has narrative only — no `Pre Existing` / `Damage` tail.

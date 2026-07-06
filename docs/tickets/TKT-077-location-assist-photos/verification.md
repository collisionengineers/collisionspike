# Verification — TKT-077: Location assist can't see the case photos — real photo bytes + signage business lookup

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
Per the ticket's **Verification requirements**: Python unit tests (photo sources, POI parsing,
corpus_match rule); verify-all + Function redeploy recorded; live E2E photo-path probe
(telemetry showing real bytes + OCR + candidates), live signage-path probe (POI candidate),
auto-run-once proof with a Postgres check that nothing auto-applied.

# Changes — TKT-296: parse-fed deploy + gate flip (PLAN-014 Slice 5)

## Status
docs landed; deploy + flip pending (this ticket's own live step).

## What changed (in this PR — the deploy-prep docs)

- **New** this ticket (TKT-296) recording the ship-dark deploy sequence + drain + flip.
- `docs/operations/deployment.md` — a new **OCR Function App (container)** deploy runbook: the
  `az acr build` → `acrpull-role.bicep` → `az deployment group create` (`infrastructure/functions/ocr/
  main.bicep`) → replica-set → caller-wiring (`OCR_FN_URL`/`OCR_FN_KEY` on `cespk-api-dev`) path that
  was documented only in inline bicep/Dockerfile comments (deployment-route audit gap — the OCR host is
  a container Function, so the existing Python `func publish` recipe does not apply to it).
- `docs/operations/feature-gates.md` — new `TRIAGE_PARSE_FED_ENABLED` row (keeps TKT-159's gate audit
  complete).
- **New** `docs/adr/0036-parse-fed-unified-triage.md` — amends ADR-0019: Stage A gains parse-derived
  inputs; Stage A+B compose under `triageUnified`; parse precedes triage; the corpus-backtest validation
  model replaces the live-shadow model.
- Dated impact notes appended to the tickets the reorder touches (TKT-102 collapse implemented;
  TKT-277 parity guard re-run unchanged; TKT-043/TKT-041 re-run through the backtest; TKT-145 explicitly
  not resolved by this reorder).

## What did NOT change

No application code (the code shipped in Slices 0–4b). `LIVE_FACTS.json` + this ticket's `VERIFIED-LIVE`
verdict are updated AFTER the deploy from dated evidence.

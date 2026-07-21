# Changes — TKT-296: parse-fed deploy + gate flip (PLAN-014 Slice 5)

## Status
Deploy + flip DONE and health-verified live (2026-07-21); gate `TRIAGE_PARSE_FED_ENABLED=true`. Verdict is
**DEPLOYED-LIVE + HEALTH-VERIFIED**, with behavioural `VERIFIED-LIVE` deliberately withheld until the first
live post-flip arrival is banked (see verification.md); ticket stays in `now` until then.

PR-review remediation (PR #154, Codex bot): bumped the parser `/fingerprint` contract id to
`ce-parser-fingerprint-v2` and redeployed (finding 6 — v1 fields were retired by the engine merge;
verified live `v2`); verified the OCR route + caller wiring present/healthy (finding 3); synced
`feature-gates.md` to the flipped-ON state (finding 2); re-probed all ARM function counts live so the
`live-facts.evidence.json` `capturedAt` is a genuine 2026-07-21 re-attestation (finding 4); restored the
105 count in live-environment.md's dated 2026-07-19 section and recorded the 105→106 transition in its own
2026-07-21 section (finding 5); softened the verdict from an over-strong `VERIFIED-LIVE` (finding 1).

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

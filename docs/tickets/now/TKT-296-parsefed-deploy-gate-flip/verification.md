# Verification — TKT-296: parse-fed deploy + gate flip (PLAN-014 Slice 5)

## Verdict
PENDING-LIVE (docs landed; the deploy + flip + live proof is this ticket's own step, recorded here as
it happens).

## Pre-deploy evidence (recorded before the deploy)

- **Gate confirmed off (ship-dark):** `az functionapp config appsettings list -n cespk-orch-dev -g
  rg-collisionspike-dev` (2026-07-21) shows `TRIAGE_PARSE_FED_ENABLED` ABSENT (all other `TRIAGE_*`
  gates on). So the deployed reorder is dark until the explicit flip.
- **Code proven offline:** the full PLAN-014 stack merged with CI green — engine eval gate, parser
  pytest, orchestration 630 tests (incl. the reorder + parsed-ref-injection + ADR-0010 tests), the
  go/no-go backtest (87.9% → 91.4%, 0 regressions).

## Live evidence (filled in during the deploy)

- [ ] In-flight `intakeOrchestrator` instance count = 0 immediately before the orchestration publish
      (drain proof).
- [ ] Parser / OCR / orchestration publish succeeded; resource health + function registrations
      confirmed.
- [ ] Gate-off `triage_decision` KQL: `parseFedGateOn == false`, acting decisions unchanged vs baseline.
- [ ] `TRIAGE_PARSE_FED_ENABLED` flipped to `true`; post-flip KQL shows `parseFedApplied == true` on
      genuinely fed arrivals; parser latency/error-rate watch clean.
- [ ] `LIVE_FACTS.json` + `feature-gates.md` updated; `ticket-verifier` dispatched → `VERIFIED-LIVE`.

## How to re-verify

Re-run the KQL spot-check and `az functionapp config appsettings list` for the gate value; compare
against the dated evidence attached here.

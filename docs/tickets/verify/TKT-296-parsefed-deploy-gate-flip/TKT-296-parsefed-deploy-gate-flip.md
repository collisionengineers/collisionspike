---
id: TKT-296
title: Deploy the parse-fed unified triage stack (gate-off), drain, flip TRIAGE_PARSE_FED_ENABLED (PLAN-014 Slice 5)
status: verify
priority: P1
area: intake
tickets-it-relates-to: [TKT-290, TKT-291, TKT-292, TKT-293, TKT-294, TKT-295, TKT-297, TKT-056, TKT-159]
research-link: workingspace/proposedparserchanges.md
plan: PLAN-014
---

# Deploy the parse-fed unified triage stack (gate-off), drain, flip (PLAN-014 Slice 5)

## Problem

PLAN-014 Slices 0–4b are merged to `main`. They ship the parse-fed unified triage reorder behind
`TRIAGE_PARSE_FED_ENABLED` (default off, ADR-0027 ship-dark). This ticket deploys the affected
Function Apps, proves the gate-off behaviour is byte-identical live, then flips the gate.

## Affected deployables

| App | Live resource | Why it changed |
|---|---|---|
| Parser Function | `cespike-parser-dev-x7xt3d5ovhi7y` | Slice 1's D4 `attachment_content_typings` rule (canonical engine, re-materialized by the engine merge) + Slice 2's `/classify-email` validation. |
| OCR Function (container) | `cespkocr-fn-dev-glju3v` | The engine merge materialized the engine into `services/functions/ocr/cedocumentmapper_v2` for the first time (was dead). |
| Orchestration Function | `cespk-orch-dev` | Slices 4a/4b — `triageUnified` activity + the parse→triage reorder + TKT-102 collapse. |

## Deploy sequence (ship-dark, ADR-0027)

1. **Confirm the gate is unset** on `cespk-orch-dev` — verified 2026-07-21:
   `TRIAGE_PARSE_FED_ENABLED` is absent → `gates.triageParseFed()` returns false → the reorder is
   dark (decision byte-identical; parse still runs early but its result is not consumed, and the
   downstream lanes fall back to candidate/body). All other `TRIAGE_*` gates are on.
2. **Parser** — resolve TKT-297 #6 (bump the `/fingerprint` contract id) BEFORE publishing, then
   `func azure functionapp publish cespike-parser-dev-x7xt3d5ovhi7y --build remote`. Positive/negative
   `/classify-email` probes for the new `attachment_content_typings` / `open_case_ref_match` validation.
3. **OCR** — `az acr build` → `az deployment group create` (see the new OCR runbook in
   `docs/operations/deployment.md`); confirm `_engine_available()` now true and the scanned-PDF fallback
   path works; wire `OCR_FN_URL`/`OCR_FN_KEY` on `cespk-api-dev` (config-capture gap noted by the
   deployment-route audit).
4. **Orchestration — DRAIN FIRST.** The reorder changes the yielded activity SEQUENCE, so an in-flight
   `intakeOrchestrator` instance recorded against the OLD code will NOT replay against the new one
   (Durable matches history positionally). Confirm zero Running/Pending `intakeOrchestrator` instances
   (query the Durable task hub — no prior runbook covers this; the query is recorded in this ticket's
   evidence) before `func azure functionapp publish cespk-orch-dev`. Deploy stays gate-off.
5. **Prove gate-off live** — a `triage_decision` KQL spot-check (extended with the new
   `parseFedGateOn`/`parseFedApplied`/`openCaseRefMatch` fields) shows `parseFedGateOn == false` and the
   acting decisions unchanged vs the pre-deploy baseline.
6. **Flip** `TRIAGE_PARSE_FED_ENABLED=true` on `cespk-orch-dev`. Post-flip watch: parser
   latency/error-rate (parse now runs for every doc-bearing email — an accepted cost) + the KQL now
   showing `parseFedApplied == true` on genuinely fed arrivals.
7. **Record** — update `LIVE_FACTS.json`, add the `TRIAGE_PARSE_FED_ENABLED` row to
   `docs/operations/feature-gates.md` (keeps TKT-159's gate audit non-stale), dispatch `ticket-verifier`
   for a `VERIFIED-LIVE` verdict per the TKT-056 gate-flip precedent.

## Follow-up

One release after the flip (once no in-flight instance predates the deploy), mint a small ticket to
delete the now-dead `triagePolicy` activity registration. `classifyInbound` STAYS registered — the retro
orchestrator (`retro-case.ts`) still calls it.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)

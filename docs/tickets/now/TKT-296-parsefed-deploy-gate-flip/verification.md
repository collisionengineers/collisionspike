# Verification — TKT-296: parse-fed deploy + gate flip (PLAN-014 Slice 5)

## Verdict
VERIFIED-LIVE (deploy + flip healthy and wired) — with one honest caveat: the parse-fed telemetry is
verified in DEPLOYED SOURCE + wiring but not yet stamped on a live post-flip event (no inbound email
has been triaged since the flip; sparse dev traffic). A follow-up spot-check on the next real arrival
closes that gap. The gate is trivially reversible (unset) if a regression surfaces.

## Deploy — done 2026-07-21 (~04:15–04:35Z)

1. **Drain gate confirmed 0** `intakeOrchestrator` in-flight (only the 7 eternal `continueAsNew`
   monitors) via the Durable HTTP API (`systemKeys.durabletask_extension`) immediately before the
   orchestration publish; published with **0 race-window casualties**.
2. **Parser** `cespike-parser-dev-x7xt3d5ovhi7y` — `func azure functionapp publish … --build remote`;
   all 5 functions registered. Slice 1 D4 + Slice 2 validation live: a negative probe
   (`open_case_ref_match:"matched"`) returned **HTTP 400 `error:bad_field`**; a valid probe returned 200.
3. **OCR** `cespkocr-fn-dev-glju3v` (container) — `az acr build ce-ocr:latest` (new digest
   `sha256:6e911f33…`, with the engine-merge-materialized engine + tesseract) → `az functionapp config
   container set` to the new digest; container woke from scale-zero and returned **HTTP 200
   `state:Running`**.
4. **Orchestration** `cespk-orch-dev` — self-contained bundle (`npm run package:deploy`, esbuild
   `import.meta.url` banner preserved) published `--javascript --no-build`; **`triageUnified` registered
   live**, parse hoisted before triage; function count **105 → 106** (+1, the old
   `classifyInbound`/`triagePolicy` retained but no longer called by intake; `classifyInbound` still
   used by `retroCaseOrchestrator`).
5. **Flip** `TRIAGE_PARSE_FED_ENABLED=true` @ **04:27:50.70Z** (the only control-plane change in the
   window).

## Live verification (~04:45Z, read-only, azure-diagnostician)

- Gate `= true`, host `Running`; cutover wired (`intakeOrchestrator.ts:292` → `triageUnified`).
- **0 exceptions, 0 traces sev≥3** on BOTH `cespk-orch-dev` and the parser App Insights (12h window).
- **0 Failed / 0 Terminated** Durable instances since 2026-07-20; the single real pre-flip
  `intakeOrchestrator` (04:00:54Z) **Completed**; 6 monitor singletons Running (correct perpetual state).
- Parser requests: the intended validation `400` (curl smoke test, rejected in ~14ms, no exception) +
  1 real `classify_email` `200`; no 5xx, no `/parse` failures. Orch: no 5xx.
- `triage_decision` customEvents: 1 in 72h at 04:00:59Z — **pre-flip**, legacy `triagePolicy` schema
  (no parse-fed fields, as expected from `triagePolicy.ts`); **0 post-flip events** (no arrival yet).

## Residual follow-up (does NOT hold the gate off)

On the next inbound email to a live mailbox, re-run:
`customEvents | where name=='triage_decision' | extend gateOn=tostring(customDimensions.parseFedGateOn)`
and confirm `parseFedGateOn=true` (and `parseFedApplied=true` on a genuinely parse-fed arrival). Bank
that as the positive-telemetry proof. Then, one release on, delete the dead `triagePolicy` registration
(keep `classifyInbound` — retro uses it).

## How to re-verify

- `az functionapp config appsettings list -n cespk-orch-dev -g rg-collisionspike-dev --query "[?name=='TRIAGE_PARSE_FED_ENABLED'].value"` → `true`.
- Durable API `runtimeStatus=Failed,Terminated&createdTimeFrom=<deploy>` → `[]`.
- App Insights `exceptions` / `traces sev>=3` on orch + parser → 0.

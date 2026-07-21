# Verification — TKT-296: parse-fed deploy + gate flip (PLAN-014 Slice 5)

## Verdict
DEPLOYED-LIVE + HEALTH-VERIFIED (gate ON) — **behavioural `VERIFIED-LIVE` is deliberately withheld
pending the first live post-flip arrival.** What IS proven live: all three Function Apps are deployed
with the parse-fed code, `TRIAGE_PARSE_FED_ENABLED=true`, the host is Running, the cutover is wired,
the OCR route + caller wiring are present and healthy, and read-only telemetry is clean (0 exceptions /
0 sev≥3 traces / 0 Failed-or-Terminated Durable instances). What is NOT yet proven: the *enabled path
has never processed an arrival* — no inbound email has been triaged since the flip (sparse dev traffic),
so neither the gate-off-then-flip live behavioural check nor the post-flip `parseFedApplied==true`
check has an observed event to point at. Marking this a full `VERIFIED-LIVE` would let the rollout
close on infrastructure health while the feature behaviour itself is unobserved; the honest verdict is
therefore health-verified with behavioural proof pending. The ticket stays in `now` until the residual
follow-up below is banked. The gate is trivially reversible (unset) if a regression surfaces.

## Deploy — done 2026-07-21 (~04:15–04:35Z)

1. **Drain gate confirmed 0** `intakeOrchestrator` in-flight (only the 7 eternal `continueAsNew`
   monitors) via the Durable HTTP API (`systemKeys.durabletask_extension`) immediately before the
   orchestration publish; published with **0 race-window casualties**.
2. **Parser** `cespike-parser-dev-x7xt3d5ovhi7y` — `func azure functionapp publish … --build remote`;
   all 5 functions registered. Slice 1 D4 + Slice 2 validation live: a negative probe
   (`open_case_ref_match:"matched"`) returned **HTTP 400 `error:bad_field`**; a valid probe returned 200.
   **Fingerprint contract bump (TKT-297 finding 6, addressed on PR review):** the `/fingerprint` route
   still self-identified as `ce-parser-fingerprint-v1` after the engine merge dropped that contract's
   `repository`/`ref`/`commit`/`providers_sha256` fields — a latent trap (a future v1 consumer would
   accept the id then break on the absent fields; grep confirms zero live consumers today, so no live
   break). Bumped to `ce-parser-fingerprint-v2` in `function_app.py` + `test_fingerprint.py`, and the
   parser was **redeployed** (remote build, 2026-07-21). Live readback of `GET /api/fingerprint`:
   **HTTP 200** `{"contract":"ce-parser-fingerprint-v2","vendored_file_count":36,"content_sha256":"28eb811d…"}`.
3. **OCR** `cespkocr-fn-dev-glju3v` (container) — `az acr build ce-ocr:latest` (new digest
   `sha256:6e911f33…`, with the engine-merge-materialized engine + tesseract) → `az functionapp config
   container set` to the new digest. **Route + caller wiring verified** (read-only, azure-diagnostician,
   PR-review follow-up — a Running container alone only proves host health): (a) `az functionapp config
   container show` confirms the live image is exactly `cespkocracraeee76.azurecr.io/ce-ocr@sha256:6e911f33…`
   (the expected engine-materialized digest, so the new image actually activated); (b) both caller
   settings `OCR_FN_URL` and `OCR_FN_KEY` are **present** on `cespk-api-dev` (names only, values not
   read — this satisfies the throw-guard at `service-client.ts:~153`); (c) host `state:Running`,
   `GET /` → **200** (serving), `/admin/host/status` → **401** (auth enforced); (d) App Insights
   (`cespkocr-ai-dev`, ~2h): 0 exceptions / 0 5xx / 0 sev≥3 traces. Honest scope limit: `requests_total`
   was 0 in-window (no traffic), so an end-to-end OCR round-trip was **not** independently proven — that
   would require driving one authenticated OCR call with the function key (deferred to avoid key exposure;
   noted as a residual, same shape as the triage behavioural gap below).
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

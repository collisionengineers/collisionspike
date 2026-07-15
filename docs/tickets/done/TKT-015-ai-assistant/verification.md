# Verification — TKT-015: AI suggestion layer (observation-first, gated)

Verified by: ticket-verifier dispatch, 08-07-26

## Verdict
TESTED (offline), GATED OFF — the two model lanes are now BOTH wired: the live email-triage lane
(2026-07-02, `EMAIL_AI_ENABLED` since flipped true on `cespk-orch-dev`) and, as of 2026-07-08, the generic
`callModelForSuggestions` (case/damage-assessment consumer) behind default-off `AI_ASSIST_ENABLED`. The
generic path is offline-proven (verifier ran the 18 + 269 tests green) but never run live — its
`AI_ASSIST_ENABLED` production flip is DPIA/capacity/residency-gated. Ticket **stays in `verify`** for that
deferred live tail. (prior detail on the email-triage lane is preserved below.)

## Evidence
- Commit `eaa809e` provided the coherent, correctly gated-OFF `ai_suggestion` foundation.
- Commit `b62b0df` (2026-07-02) replaced the dormant `triageClassify` stub in
  `services/orchestration/src/workflows/intake/triage-classify.ts` with a real Azure OpenAI structured-output call
  (keyless via the orch managed identity, which now holds **Cognitive Services OpenAI User** on
  `digital-3339-resource` — role assignment `d695d697-…`, applied + verified). A live 3-item A/B smoke
  test against `gpt-5` (`scripts/evaluation/email/run_ab.py`) returned 0 abstains, all strict-JSON-valid,
  2026-07-02 — this is real, working inference, run under the pre-authorised "AI testing on repo data"
  allowance (G5), not merely code that compiles.
- (At the time of writing, 2026-07-02) `EMAIL_AI_ENABLED` and `AI_ASSIST_ENABLED` were both absent from live
  app settings. **Registry update (08-07-26, verifier-observed):** `EMAIL_AI_ENABLED` is now **`true`** on
  `cespk-orch-dev` (the email-triage lane is live-acting); `AI_ASSIST_ENABLED` (the suggestion-layer /
  generic-generate + CaseDetail panel gate) remains **absent** (dark). The two gates are distinct.

## Pending / gaps
- 🔒 `EMAIL_AI_ENABLED` production flip — needs the **G5 per-AI-gate sign-off**
  ([docs/tickets/BOARD.md](../../BOARD.md) §D6 item 3 / §E2); testing on repo data is already authorised (used for
  the A/B smoke above).
- 🔒 Foundry local-auth (keyless) flip — separate operator confirmation, not required to flip
  `EMAIL_AI_ENABLED` itself ([docs/tickets/BOARD.md](../../BOARD.md) §D6 item 5).
- No live probe yet against a genuine live inbound email (the gate has never been on in production).
- (Superseded 08-07-26) The **case/damage-assessment** consumer (generic
  `POST /api/cases/{id}/ai-suggestions/generate`) is now WIRED DARK — see the 2026-07-08 section below.
  The **image/reg-OCR** consumers are TKT-016 (image-analysis producer, →verify) and TKT-017 (reg-OCR
  benchmark, done); TKT-018 (total-loss, P3) remains backlog.

## How to re-verify
- Confirm the gate state and model deployment in the live registry: ../../operations/live-environment.md.
- Once `EMAIL_AI_ENABLED` is flipped (post G5 sign-off): send a real inbound email that lands as
  abstain/`uncorroborated_*`, confirm a `triage_category` row appears via
  `GET /api/inbound/{id}/suggestions`, and that accepting it (not the model itself) is what changes
  `category_code`/`subtype_code` — i.e. it remains suggestion-only, never an autonomous mutation.

## 2026-07-08: generic generate route model call wired (case/damage-assessment consumer) — TESTED (offline), verifier-confirmed

Status: **TESTED (offline), build-dark; not live** (verifier ran the suites below green, 08-07-26). The one remaining gap — the dormant
`callModelForSuggestions` stub — is now a real keyless AOAI structured-output call
(`services/data-api/src/features/assistant/suggestion-client.ts`; `services/data-api/src/features/assistant/register-suggestion-routes.ts`). It stays a permanent live
no-op because `AI_ASSIST_ENABLED` is still absent from app-settings (route front-gates on it) — no
deploy, no gate flip this pass.

Offline evidence (`evidence/generate-model-call-offline-run.md`): 18 new tests + full api suite
(269) pass; `api`/`packages/domain` typecheck clean; `verify-all.mjs` green apart from the
pre-existing Windows-env parser-pytest FAIL (the Python parser Function is untouched). The tests pin
acceptance (a) disabled→`{generated:0,reason:'disabled'}` (no model call, no write), (b) strict-JSON
drafts persist as pending `ai_suggestion` rows carrying `model_version`+`confidence` and audit
`ai_suggestion_created`, (c) a failed/malformed model response→`{generated:0,reason:'error'}` (no
partial write), (d) the generate path issues only `INSERT ai_suggestion` — no `UPDATE` to any
case/evidence column, so promotion stays human-review-only.

Verifier — offline checks to run:
- `cd services/data-api && npx vitest run src/features/assistant/suggestion-client.test.ts src/features/assistant/suggestion-generation-routes.test.ts`
  → 18 passed.
- `cd services/data-api && npx tsc -b` and `npx tsc -b packages/domain` → exit 0.
- Audit the no-silent-mutation invariant: grep the generate handler + `aoai-suggestions.ts` — the
  only state write reachable from generate is `INSERT INTO ai_suggestion`; the three minted kinds
  (`damage_area`/`damage_severity`/`accident_summary`) have no branch in `promoteAcceptedSuggestion`.

Live (deferred, operator-gated): once `AI_ASSIST_ENABLED` + `AI_MODEL_ENDPOINT`/`AI_MODEL_DEPLOYMENT`
are set on `cespk-api-dev` (post DPIA/G5 sign-off, docs/tickets/BOARD.md §F / §D6), POST the generate route
for a repo/sample case and confirm `ai_suggestion` rows appear with a `gpt-5:*` model_version and
`review_state = 'pending'`, and that nothing on the case/evidence changed until a human accepts.

## GO-LIVE — 2026-07-08 (operator-authorized; gate flipped, deploy done)

Status: **LIVE-DEPLOYED + GATE ON**; behavioral E2E = one operator/SPA action away (stays `verify`).

Operator authorized go-live with the **DPIA + UK data-residency sign-off confirmed 2026-07-08**
([data-protection.md §6a](../../../architecture/data-protection.md#6a-per-gate-production-sign-off--log)).
Executed (azure-integration-engineer dispatch):
- **`AI_ASSIST_ENABLED=true`** on `cespk-api-dev` — **readback-proven**; model endpoint/deployment present
  (`gpt-5`, keyless MI).
- **Deployed** from `main a06d2dc` — api **86** functions; `generateAiSuggestions` / `caseAiSuggestions` /
  `reviewAiSuggestion` / `getAiAssistGate` live.
- **Fail-closed proven live:** `POST /api/cases/{id}/ai-suggestions/generate` → **401** without a staff token.
  App Insights shows a **staff SPA session hitting `caseAiSuggestions` → 200** (the auth path reaches the route
  end-to-end with a real token).
- **DEFERRED (not fabricated):** the behavioral `{generated:N}` + pending `ai_suggestion` rows from a real
  gpt-5 call — `az` can't mint an API-audience staff token (AADSTS65001). Closable via the CaseDetail
  **AiAssistPanel → Generate** action on the deployed SPA (operator/staff session).
- **Provisional:** subscription still FreeTrial (PAYG/A1). Capacity: gpt-5 shared 50K-TPM (watch 429).

Registry updated: `LIVE_FACTS.json` (gate + `lastVerified`) + [live-environment.md](../../../operations/live-environment.md).

## Verdict update — 2026-07-08

FAILED (live) — operator-supplied evidence, 2026-07-08 workstream report: AI Assistant Generate Suggestions does not generate; devtools shows a 204/no-content response. Reopened verify->now; the fix is co-dispatched with TKT-127.

Verified by: operator report transcribed by the orchestrating session, 2026-07-08.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE — the composite acceptance holds end-to-end on the deployed stack: real gpt-5 outputs land as pending ai_suggestion rows stamped model version + confidence and render as suggestions; generation writes ONLY suggestion+audit rows (invariant pinned offline, corroborated live); promotion is human-confirmed (staff reviewAiSuggestion 200s observed live 2026-07-07); the gate controls it (AI_ASSIST_ENABLED=true readback + fail-closed 401s in KQL). The 2026-07-08 FAILED verdict is disproven at root — the "204" was the CORS preflight; the lying presentation was fixed by TKT-127. Residuals tracked elsewhere: email-lane live-occurrence probe (its own re-verify step), TKT-016/017/018 consumers, empty-variant toasts (with TKT-127), TKT-132 input widening.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.

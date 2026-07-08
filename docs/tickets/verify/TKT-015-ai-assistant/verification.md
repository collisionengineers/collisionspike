# Verification — TKT-015: AI suggestion layer (observation-first, gated)

Verified by: ticket-verifier dispatch, 08-07-26

## Verdict
TESTED (offline), GATED OFF — the two model lanes are now BOTH wired: the live email-triage lane
(2026-07-02, `EMAIL_AI_ENABLED` since flipped true on `cespk-orch-dev`) and, as of 2026-07-08, the generic
`callModelForSuggestions` (case/damage-assessment consumer) behind default-off `AI_ASSIST_ENABLED`. The
generic path is offline-proven (verifier ran the 18 + 269 tests green) but never run live — its
`AI_ASSIST_ENABLED` production flip is DPIA/capacity/residency-gated. Ticket **stays in `verify`** for that
deferred live tail. (Historical detail on the email-triage lane is preserved below.)

## Evidence
- Commit `eaa809e` provided the coherent, correctly gated-OFF `ai_suggestion` foundation.
- Commit `b62b0df` (2026-07-02) replaced the dormant `triageClassify` stub in
  `orchestration/src/functions/gated/triage-classify.ts` with a real Azure OpenAI structured-output call
  (keyless via the orch managed identity, which now holds **Cognitive Services OpenAI User** on
  `digital-3339-resource` — role assignment `d695d697-…`, applied + verified). A live 3-item A/B smoke
  test against `gpt-5` (`scripts/eval-email/run_ab.py`) returned 0 abstains, all strict-JSON-valid,
  2026-07-02 — this is real, working inference, run under the pre-authorised "AI testing on repo data"
  allowance (G5), not merely code that compiles.
- (At the time of writing, 2026-07-02) `EMAIL_AI_ENABLED` and `AI_ASSIST_ENABLED` were both absent from live
  app settings. **Registry update (08-07-26, verifier-observed):** `EMAIL_AI_ENABLED` is now **`true`** on
  `cespk-orch-dev` (the email-triage lane is live-acting); `AI_ASSIST_ENABLED` (the suggestion-layer /
  generic-generate + CaseDetail panel gate) remains **absent** (dark). The two gates are distinct.

## Pending / gaps
- 🔒 `EMAIL_AI_ENABLED` production flip — needs the **G5 per-AI-gate sign-off**
  ([docs/gated.md](../../../gated.md) §D6 item 3 / §E2); testing on repo data is already authorised (used for
  the A/B smoke above).
- 🔒 Foundry local-auth (keyless) flip — separate operator confirmation, not required to flip
  `EMAIL_AI_ENABLED` itself ([docs/gated.md](../../../gated.md) §D6 item 5).
- No live probe yet against a genuine live inbound email (the gate has never been on in production).
- (Superseded 08-07-26) The **case/damage-assessment** consumer (generic
  `POST /api/cases/{id}/ai-suggestions/generate`) is now WIRED DARK — see the 2026-07-08 section below.
  The **image/reg-OCR** consumers are TKT-016 (image-analysis producer, →verify) and TKT-017 (reg-OCR
  benchmark, done); TKT-018 (total-loss, P3) remains backlog.

## How to re-verify
- Confirm the gate state and model deployment in the live registry: ../../architecture/live-environment.md.
- Once `EMAIL_AI_ENABLED` is flipped (post G5 sign-off): send a real inbound email that lands as
  abstain/`uncorroborated_*`, confirm a `triage_category` row appears via
  `GET /api/inbound/{id}/suggestions`, and that accepting it (not the model itself) is what changes
  `category_code`/`subtype_code` — i.e. it remains suggestion-only, never an autonomous mutation.

## 2026-07-08: generic generate route model call wired (case/damage-assessment consumer) — TESTED (offline), verifier-confirmed

Status: **TESTED (offline), build-dark; not live** (verifier ran the suites below green, 08-07-26). The one remaining gap — the dormant
`callModelForSuggestions` stub — is now a real keyless AOAI structured-output call
(`api/src/lib/aoai-suggestions.ts`; `api/src/functions/ai-suggestions.ts`). It stays a permanent live
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
- `cd api && npx vitest run src/lib/aoai-suggestions.test.ts src/functions/ai-suggestions.test.ts`
  → 18 passed.
- `cd api && npx tsc -b` and `npx tsc -b packages/domain` → exit 0.
- Audit the no-silent-mutation invariant: grep the generate handler + `aoai-suggestions.ts` — the
  only state write reachable from generate is `INSERT INTO ai_suggestion`; the three minted kinds
  (`damage_area`/`damage_severity`/`accident_summary`) have no branch in `promoteAcceptedSuggestion`.

Live (deferred, operator-gated): once `AI_ASSIST_ENABLED` + `AI_MODEL_ENDPOINT`/`AI_MODEL_DEPLOYMENT`
are set on `cespk-api-dev` (post DPIA/G5 sign-off, docs/gated.md §F / §D6), POST the generate route
for a repo/sample case and confirm `ai_suggestion` rows appear with a `gpt-5:*` model_version and
`review_state = 'pending'`, and that nothing on the case/evidence changed until a human accepts.

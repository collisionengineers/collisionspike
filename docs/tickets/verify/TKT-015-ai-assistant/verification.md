# Verification — TKT-015: AI suggestion layer (observation-first, gated)

## Verdict
CODE DEPLOYED, GATED OFF (2026-07-02) — one lane (email triage) wired to a real model; not yet a live-acting feature

## Evidence
- Commit `eaa809e` provided the coherent, correctly gated-OFF `ai_suggestion` foundation.
- Commit `b62b0df` (2026-07-02) replaced the dormant `triageClassify` stub in
  `orchestration/src/functions/gated/triage-classify.ts` with a real Azure OpenAI structured-output call
  (keyless via the orch managed identity, which now holds **Cognitive Services OpenAI User** on
  `digital-3339-resource` — role assignment `d695d697-…`, applied + verified). A live 3-item A/B smoke
  test against `gpt-5` (`scripts/eval-email/run_ab.py`) returned 0 abstains, all strict-JSON-valid,
  2026-07-02 — this is real, working inference, run under the pre-authorised "AI testing on repo data"
  allowance (G5), not merely code that compiles.
- `EMAIL_AI_ENABLED` and `AI_ASSIST_ENABLED` are both **absent** from live app settings (confirmed via the
  registry), so none of the above runs against live inbound email today — deploying the code did not flip
  the gate.

## Pending / gaps
- 🔒 `EMAIL_AI_ENABLED` production flip — needs the **G5 per-AI-gate sign-off**
  ([docs/gated.md](../../../gated.md) §D6 item 3 / §E2); testing on repo data is already authorised (used for
  the A/B smoke above).
- 🔒 Foundry local-auth (keyless) flip — separate operator confirmation, not required to flip
  `EMAIL_AI_ENABLED` itself ([docs/gated.md](../../../gated.md) §D6 item 5).
- No live probe yet against a genuine live inbound email (the gate has never been on in production).
- The **case/damage-assessment and image/reg-OCR** consumers (TKT-016/017/018) and the generic
  `POST /api/cases/{id}/ai-suggestions/generate` path remain unbuilt / unwired — this pass wired only the
  email-triage lane.

## How to re-verify
- Confirm the gate state and model deployment in the live registry: ../../architecture/live-environment.md.
- Once `EMAIL_AI_ENABLED` is flipped (post G5 sign-off): send a real inbound email that lands as
  abstain/`uncorroborated_*`, confirm a `triage_category` row appears via
  `GET /api/inbound/{id}/suggestions`, and that accepting it (not the model itself) is what changes
  `category_code`/`subtype_code` — i.e. it remains suggestion-only, never an autonomous mutation.

## Pending — 2026-07-08: generic generate route model call wired (case/damage-assessment consumer)

Status: **PENDING (offline-proven, build-dark; not live)**. The one remaining gap — the dormant
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

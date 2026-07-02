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
  ([docs/gated.md](../../gated.md) §D6 item 3 / §E2); testing on repo data is already authorised (used for
  the A/B smoke above).
- 🔒 Foundry local-auth (keyless) flip — separate operator confirmation, not required to flip
  `EMAIL_AI_ENABLED` itself ([docs/gated.md](../../gated.md) §D6 item 5).
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

# Changes — TKT-015: AI suggestion layer (observation-first, gated)

## Status
next — Phase 4 of rules-engine-v2 wired the email-triage lane to a real model call, still gated OFF
(`EMAIL_AI_ENABLED`/`AI_ASSIST_ENABLED` both absent). See [TKT-015-ai-assistant.md § Status update —
2026-07-02](./TKT-015-ai-assistant.md#status-update--2026-07-02-phase-4-of-rules-engine-v2--one-concrete-lane-wired-still-gated-off)
for the full detail.

## Commits
- `eaa809e` — 2026-06-30 gated-OFF AI suggestion-layer foundation → laid a coherent, correctly gated-OFF foundation for an observation-first suggestion layer (no model deployed, gate default-off).
- `b62b0df` — 2026-07-02 feat(ai-assist): Stage-C gated AOAI triage assist — replaced the dormant
  `triageClassify` stub with a real, never-throw AOAI structured-output call (PII-scrubbed,
  suggestion-only, keyless via the orch managed identity); wired for abstain/`uncorroborated_*` rows
  only; results ride this ticket's `ai_suggestion` lifecycle (`suggestion_type: 'triage_category'`).
  `EMAIL_AI_ENABLED` stays absent — dead until the operator flips it (ticket board §D6).

## Files touched
- AI suggestion-layer foundation scaffolding (gated OFF).
- `services/orchestration/src/workflows/intake/triage-classify.ts`, `services/orchestration/src/adapters/aoai.ts` (new),
  `services/orchestration/src/workflows/intake/intakeOrchestrator.ts`, `services/data-api/src/features/assistant/register-suggestion-routes.ts`,
  `services/data-api/src/features/`, `scripts/evaluation/email/run_ab.py` (new) — the 2026-07-02 wiring.

## Summary
A foundation for the observation-first AI suggestion layer was committed, deliberately gated OFF; Phase 4
of rules-engine-v2 then gave ONE concrete consumer (email-triage categorisation) a real, keyless AOAI
call — still gated OFF by default, and still not a working *live* feature until the operator flips
`EMAIL_AI_ENABLED` (production needs the G5 sign-off; testing on repo data is already authorised, and an
A/B smoke test used that authorisation 2026-07-02). The case/damage-assessment and image/reg-OCR
consumers (TKT-016/017/018) remain unbuilt.

## 2026-07-08 — generic generate route model call WIRED (case/damage-assessment consumer, still gated OFF)

Closed the one remaining gap on the generic path: `callModelForSuggestions`
(`services/data-api/src/features/assistant/register-suggestion-routes.ts`) was a dormant `return []` stub — the case/damage-assessment
consumer behind `POST /api/cases/{id}/ai-suggestions/generate`. It now delegates to a real **keyless
managed-identity** AOAI structured-output call.

- **New:** `services/data-api/src/features/assistant/suggestion-client.ts` — the model-call mechanics, REUSING the established repo
  pattern (not a new HTTP client): `mintCognitiveToken` from `aoai-chat.ts` (the API MI's Cognitive
  Services token — the MI holds *Cognitive Services OpenAI User* on `digital-3339-resource`, granted
  2026-07-05) + the LIVE email-triage lane's strict-JSON structured-output shape (AOAI GA v1
  `…/openai/v1/chat/completions`, `response_format:{ json_schema, strict:true }`, gpt-5 reasoning-model
  params — `max_completion_tokens` + `reasoning_effort:'low'`, no temperature/top_p/max_tokens). Pure
  `build*`/`parse*` fns + an injectable `callSuggestionModel`. Mints three observation-only kinds:
  `damage_area` / `damage_severity` / `accident_summary`.
- **Edited:** `ai-suggestions.ts` — `callModelForSuggestions` now calls `callSuggestionModel`;
  `DraftSuggestion` imported from the lib (local duplicate removed); stale "no model deployed / dormant
  stub" comments corrected (gpt-5 IS deployed; the route stays a no-op only because `AI_ASSIST_ENABLED`
  is OFF). The persist/audit code is unchanged.
- **Edited:** `packages/domain/src/dto/index.ts` — added the three kinds to the `AiSuggestionType` open
  vocabulary (documented, additive; open vocab so it was already type-supported).
- **Failure posture:** a hard model failure (non-2xx / timeout / transport / unparsable-or-blocked 2xx)
  THROWS → the route's existing catch degrades to `{ generated: 0, reason: 'error' }` with no partial
  write; a clean-but-empty run resolves `[]` → `{ generated: 0 }`.
- **Tests (offline, mocked model — no network):** `services/data-api/src/features/assistant/suggestion-client.test.ts` (10) +
  `services/data-api/src/features/assistant/suggestion-generation-routes.test.ts` (8) prove acceptance (a)–(d). Full api suite 269 pass;
  `api` + `packages/domain` typecheck clean; `node verify-all.mjs` green except the pre-existing
  Windows-env parser-pytest FAIL (Python Function untouched). Evidence:
  [evidence/generate-model-call-offline-run.md](./evidence/generate-model-call-offline-run.md).
- **Still gated OFF / build-dark:** `AI_ASSIST_ENABLED` absent from live app-settings — no live deploy,
  no gate flip, no DDL. Flipping it is a Phase-4 operator step (DPIA/capacity/residency, docs/tickets/BOARD.md
  §F / §D6).

## 2026-07-08 (later) — reopened live failure resolved via TKT-127 (live-proven end-to-end)

The operator's post-go-live report ("Generate Suggestions doesn't generate; devtools 204") reopened
this ticket; the investigation + fix are recorded in **[TKT-127](../TKT-127-ai-suggestions-generate-204/changes.md)**
(this batch, branch `feat/readiness-ai-spine`). Summary for THIS ticket's history:

- **Not a regression in this ticket's build**: the deployed generate path was current and working —
  the "204" was the CORS OPTIONS preflight; the model was called (AOAI metrics: 5×200) and honestly
  returned an empty list because the clicked cases had empty accident-circumstances.
- **Hardening shipped** (TKT-127): explicit zero-outcome reasons (`disabled`/`no_input`/`empty`/
  `error`) + App Insights logging on the generate route; per-reason plain-language toasts + plain
  rendering of the case-assessment kinds in `AiAssistPanel`; a defensive body-less-2xx mapping in
  `rest-client.ts`.
- **The TKT-015 acceptance is now live-proven**: SPA Generate on A.QDOS26029 → 200 `{generated:5}`;
  5 pending `ai_suggestion` rows (model version + confidence stamped) + `ai_suggestion_created`
  audit rows; suggestions render for human Accept/Reject — observation-first, no silent mutation.
  Evidence lives under [TKT-127 evidence/](../TKT-127-ai-suggestions-generate-204/evidence).

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
  `EMAIL_AI_ENABLED` stays absent — dead until the operator flips it (gated.md §D6).

## Files touched
- AI suggestion-layer foundation scaffolding (gated OFF).
- `orchestration/src/functions/gated/triage-classify.ts`, `orchestration/src/lib/aoai.ts` (new),
  `orchestration/src/functions/intakeOrchestrator.ts`, `api/src/functions/ai-suggestions.ts`,
  `api/src/functions/internal.ts`, `scripts/eval-email/run_ab.py` (new) — the 2026-07-02 wiring.

## Summary
A foundation for the observation-first AI suggestion layer was committed, deliberately gated OFF; Phase 4
of rules-engine-v2 then gave ONE concrete consumer (email-triage categorisation) a real, keyless AOAI
call — still gated OFF by default, and still not a working *live* feature until the operator flips
`EMAIL_AI_ENABLED` (production needs the G5 sign-off; testing on repo data is already authorised, and an
A/B smoke test used that authorisation 2026-07-02). The case/damage-assessment and image/reg-OCR
consumers (TKT-016/017/018) remain unbuilt.

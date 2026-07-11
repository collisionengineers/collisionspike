# Verification — TKT-078: Deeper photo-based location suggestion — AI reasoning escalation (gated)

## Verdict
BUILT + DEPLOYED DARK (2026-07-06). The escalation is off by default (`LOCATION_ASSIST_AI_ENABLED`
unset) and the UI button is hidden. Live gate-on flip is operator-blocked on production AI sign-off
(gated.md E2) — deliberately not flipped.

## Offline tests (python — part of the 75 pass)
`tests/test_ai_reasoning.py`:
- `parse_ai_response`: parses valid guesses, clamps confidence to ≤1.0, skips entries with no query,
  returns `[]` on malformed / non-JSON / empty content.
- `build_reasoner` returns **None** (honest no-op) when the gate is off, when endpoint/deployment are
  unconfigured, and when no managed-identity token can be minted — i.e. it ships DARK.
- `AiLocationReasoner.suggest`: hits the GA v1 `/openai/v1/chat/completions` surface with a Bearer token;
  the request body uses the **reasoning-model form** (`max_completion_tokens` + `reasoning_effort`, **no**
  `temperature`/`max_tokens`); photos attached as `image_url` data URLs; non-200 → `[]`; no photos → `[]`.

## Gates + wiring
- `packages/domain/src/gates.ts`: `locationAssistAi()` + derived `locationAssistAiEnabled()` (base assist on
  AND gate on AND model endpoint+deployment configured).
- `GET /api/gates/location-assist` now returns `aiEnabled` (domain 886 pass); SPA reads it to conditionally
  show a "Try a deeper photo-based suggestion" button → `deep:true` request.
- Location fn: `ai_reasoning.py` (keyless AOAI gpt-5, MSI Cognitive token, structured JSON, per-request
  photo cap + usage telemetry) wired as a `deep` escalation in `suggest_locations` (guesses re-geocoded via
  Maps with `ai_reasoning` provenance); `build_reasoner()` returns None today so `deep` is a no-op.

## Deployed
Location fn + api + SPA all carry the code, gate OFF. `LIVE_FACTS.json` gate set does not include
`LOCATION_ASSIST_AI_ENABLED` (dark).

## Pending (operator)
Production AI sign-off (gated.md E2), then flip `LOCATION_ASSIST_AI_ENABLED=true` on the location fn; then
a live gate-on probe (structured candidate + spend telemetry row + re-geocode) and a cap-exceed refusal.

## Verdict update — 2026-07-10 (final sweep, ticket-verifier dispatch; transcribed verbatim)

**PENDING — and the verdict above is STALE: the gate is LIVE, not dark.** Live-verified this sweep (matching BOARD/gated.md E2): `LOCATION_ASSIST_AI_ENABLED=true` on `cespkloc-fn-a7tzj2`; `AI_MODEL_ENDPOINT=digital-3339-resource` + `AI_MODEL_DEPLOYMENT=gpt-5`; the loc-fn MI holds Cognitive Services OpenAI User on that resource (ARM read); host Running. Acceptance line 5 (flip recorded with operator sign-off) is SATISFIED — gated.md records the 2026-07-07 sign-off + flip. Line 1 (gate-off byte-identical) was proven during the dark period — now historical. Remaining (operator SPA session): a live `deep=true` probe on a hard photo case (structured candidates, `ai_reasoning` provenance, Maps re-geocode, spend telemetry) + the cap-exceed refusal probe. Registry nuance: LIVE_FACTS `gates` only tracks api/orch apps, so this flipped loc-fn gate lives nowhere in the machine registry — add loc-fn gate tracking on reconcile. Verified by: ticket-verifier dispatch, 2026-07-10.

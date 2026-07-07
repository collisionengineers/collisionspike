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

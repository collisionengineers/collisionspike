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

## Verdict update — 2026-07-14 (independent PLAN-005 sweep; transcribed verbatim)

## Verdict

FAILED

## Evidence

1. Gate-off behavior is covered offline: `functions/location-suggest/tests/test_ai_reasoning.py` passed
   10/10 tests, including disabled/unconfigured/MSI-unavailable short-circuits. Historical ticket evidence
   records the earlier dark deployment. I did not flip the live gate off.
2. The deep branch can parse structured model output, re-geocode guesses through Maps, and label evidence
   `ai_reasoning`. However, no hard-photo deep invocation is proven live. Since the 2026-07-07 flip,
   telemetry contains only two successful `locationAssistSuggest` API requests and no `ai_reasoning usage`
   trace or Azure OpenAI dependency record.
3. Acceptance line 3 fails implementation inspection. The only cap is `MAX_AI_PHOTOS=4`, which limits
   photographs inside one request. There is no per-case invocation cap, per-day invocation cap, persisted
   counter, or N+1 refusal/logging path. Repository-wide targeted searches found none.
4. Reviewer control is correctly implemented offline: the deeper attempt requires an explicit button
   click, candidates require explicit selection, and persistence requires the normal save action. The
   location function does not write case state.
5. Operator sign-off and the production flip are recorded at `docs/gated.md:909-914`. Fresh read-only
   app-setting checks found both `cespkloc-fn-a7tzj2` and `cespk-api-dev` set to
   `LOCATION_ASSIST_AI_ENABLED=true`; the location function reports model deployment `gpt-5`.

## Pending / gaps

- Implement the required per-case and per-day invocation caps, including durable counting and an
  observable N+1 refusal.
- Prove one operator-invoked hard-photo result live: structured candidates, visible evidence,
  `ai_reasoning` source, Maps re-geocode, and queryable usage/spend telemetry.
- `LIVE_FACTS.json` still does not track the location-function AI gate.
- Telemetry absence is not treated as conclusive proof of no model invocation because the location
  function has no separately visible role telemetry in the queried workspace.

## How to re-verify

1. Add focused tests covering each cap boundary and the N+1 refusal/log record.
2. Deploy through the approved Azure path and read back both API and location-function settings.
3. In an operator-approved staff session, use the deep action on a legitimate hard-photo case.
4. Capture the returned candidate provenance and Maps result, then query usage telemetry.
5. Exceed each cap in an approved non-production or controlled verification context and capture the
   refusal without manufacturing a production case.

## Confidence + unread surfaces

High confidence in `FAILED`: a mandatory acceptance behavior is absent from exact main `308294c`, not
merely lacking live evidence. I did not invoke the live deep path, alter gates, query Postgres through a
temporary firewall rule, or inspect a live authenticated browser session.

# Changes — TKT-078: AI vision-reasoning escalation (gated dark)

## Status
DONE (built + deployed 2026-07-06) — awaiting the operator live SPA click-through. Full proof in
[verification.md](./verification.md); full cross-cutting narrative in `LIVE_FACTS.json` `verifiedBy`
(2026-07-06 inspection-address repair).

## Summary
`services/functions/location-assist/ai_reasoning.py` — keyless AOAI gpt-5 vision (MSI Cognitive token, structured JSON, reasoning-model call form, photo cap + telemetry), wired as a reviewer-invoked `deep=true` branch (guesses re-geocoded via Maps, `ai_reasoning` provenance). Gate `LOCATION_ASSIST_AI_ENABLED` (default OFF) in `gates.ts`; `GET /api/gates/location-assist` gains `aiEnabled`; SPA shows a hidden-until-on 'Try a deeper photo-based suggestion' button. Ships DARK — `build_reasoner()` returns None today; live flip operator-blocked (ticket board E2).

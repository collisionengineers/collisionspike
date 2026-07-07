# Verification — TKT-066: Assistant can't find a case by spaced registration + tool failures are invisible

## Verdict
TESTED (offline)

## Evidence
- `packages/domain/src/domain/vrm-canon.test.ts` — canonicaliser + three-call-site agreement.
- `api/src/lib/aoai-chat.test.ts` — tool-throw retry + `toolErrors` surfaced.
- `api/src/functions/assistant.test.ts` — SELECT-only guard; canonical-VRM `lookup_case` query shape.
- `node verify-all.mjs`: domain + API + SPA + orch gates green (only the pre-existing environmental
  parser pytest fails; no Python touched).

## Pending / gaps
- Built DARK: `ASSISTANT_TOOLSET_V2` defaults **off**; the widened read adapter is inert until flipped.
- **Not deployed.** Live proof (deploy `cespk-api-dev` → flip the gate → spaced-VRM lookup on a live case,
  e.g. `YT13 UTV`, resolves; a forced tool failure shows in App Insights) is pending the operator flip in
  [docs/gated.md](../../../gated.md) (§F — PLAN-001).

## How to re-verify
Offline: `npm --prefix packages/domain test`, `npm --prefix api test`, `node verify-all.mjs`. Live (after
flip): ask the assistant for a case by a spaced registration; confirm it resolves and that an induced tool
error appears as a warn trace in App Insights.

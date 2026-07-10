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

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

FAILED live on first flip — a REAL defect the verifier root-caused to the source line: with ASSISTANT_TOOLSET_V2=true every assistant chat 400s at AOAI (schemas.ts zodToJsonSchema openApi3 target emits boolean exclusiveMinimum for the .positive() limit fields; AOAI requires draft-2020-12 and rejects the whole tools array — the surface was down, including legacy questions). The canonicaliser ITSELF is deployed and working (the global-search route resolves spaced YT13 UTV to QDOS26053/26029). MITIGATION: the orchestrator flipped the gate back OFF (readback false — legacy assistant restored); the schema fix + re-flip is folded into the in-flight final-wave batch. Acceptance lines 2/4/5 hold (source/offline); lines 1/3 re-probe after the fix.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.

## Verdict update — 2026-07-10 (final sweep, ticket-verifier dispatch; transcribed verbatim)

**PENDING — the 07-09 FAILED is cleared:** the zod `exclusiveMinimum` root-cause fix (`normalizeExclusiveBounds` ×4) is in the deployed build lineage and `ASSISTANT_TOOLSET_V2=true` re-flipped (az readback today; registry records the 07-09 re-flip with 0 "Invalid schema" traces/6h). `assistantChat` live + 401 fail-closed today. Lines 2/4/5 held per the 07-09 verdict. Remaining tail (operator-shaped): a live authenticated chat resolving `YT13 UTV` + a forced tool failure showing the warn trace + `toolErrors ≥ 1`. Queued SQL (shared with 069): `ai_usage_ledger` rows surface=assistant since 07-09 — rows would prove authenticated chats complete post-re-flip. Verified by: ticket-verifier dispatch, 2026-07-10.

### W7 data-pass note (orchestrator-run, 2026-07-10)
The ai_usage_ledger shows **4 authenticated assistant calls completed 2026-07-09** (one staff
actor, gpt-5) — post-re-flip chats ARE completing (the precondition your queued ledger SQL was
checking). The YT13 UTV probe + forced-tool-failure observability remain.

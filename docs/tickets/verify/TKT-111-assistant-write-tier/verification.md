# Verification — TKT-111: Assistant write tier with human confirmation

## Verdict
TESTED (offline)

## Evidence
- `api/src/lib/concurrency.test.ts` — `If-Match` present → 409 on stale version; absent → skipped
  (back-compat).
- `packages/domain/src/capabilities/registry.test.ts` — `merge_cases`/destructive are never proposable;
  proposable set is write ∧ not-humanOnly.
- `api/src/functions/assistant.test.ts` — `propose_action` performs no mutation.
- SPA suite covers `ConfirmActionCard` re-fetch + diff + 409 handling. `node verify-all.mjs` green.

## Pending / gaps
- Built DARK: `ASSISTANT_WRITE_TIER_ENABLED` defaults **off**; `propose_action` is absent from the toolset
  until flipped.
- **Not deployed, and the flip is DPIA-gated.** Live proof (propose→confirm→execute end to end, with a
  concurrent-edit 409) requires deploy + per-capability **E2/G5 sign-off + DPIA** — see
  [docs/gated.md](../../../gated.md) (§F). `scrubPii` is a precision-over-recall pre-scrub, not
  "de-identified" — the DPIA must reflect that.

## How to re-verify
Offline: `npm --prefix api test`, `npm --prefix mockup-app test`. Live (after flip + DPIA): from the
assistant, propose a `set_on_hold`; confirm the card diff matches a fresh DB read; execute; then repeat with
a concurrent edit in another tab and confirm the second execute 409s.

## Verdict update — 2026-07-10 (final sweep, ticket-verifier dispatch; transcribed verbatim)

**PENDING — record update: deployed DARK (the standing "not deployed" is stale); acceptance line 1 is now live fact.** `propose_action`, `ASSISTANT_WRITE_TIER_ENABLED`, and the `staleVersion`/If-Match concurrency code are in the deployed api bundle (07-09/07-10 publishes; gated.md §F step 1 DONE), and the gate is ABSENT from live app-settings — "assistant writes gated off by default" is live-proven, not just test-asserted. `assistantChat` live; the toolset excludes `propose_action` while off (offline-pinned). Remaining, operator-gated (gated.md §F4 STAYS OFF): per-capability DPIA + E2/G5 sign-off (must state `scrubPii` is precision-over-recall, not de-identification) → flip → live propose→confirm→execute + concurrent-edit 409. Destructive-exclusion (`merge_cases` never proposable) stays offline-proven. Verified by: ticket-verifier dispatch, 2026-07-10.

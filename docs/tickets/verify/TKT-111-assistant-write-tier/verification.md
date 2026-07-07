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

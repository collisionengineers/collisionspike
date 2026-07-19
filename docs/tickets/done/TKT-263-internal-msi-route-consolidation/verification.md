# Verification — TKT-263: Consolidate the internal MSI route surface behind the trust seam

## Verdict

TESTED (offline). Verified 2026-07-20 on branch `plan008/canonical-routes`. Behaviour-preserving; no live write.

## Evidence

- **A1 — sixteen modules accounted for.** `register-internal-routes.ts` now wires all 13 non-outbox internal
  modules (11 original + retro-routes + backfill-drain-route); `index.ts` imports the aggregator once plus the
  3 outbox modules (owned by TKT-264). Grep confirms retro-routes and backfill-drain-route both use
  `withServiceAuth` from `service-support.js` (so they belong on the internal seam).
- **A2 — one entrypoint + one seam.** All 13 non-outbox route registrations reach the runtime through the
  single aggregator and the single TKT-245 `withServiceAuth`. The relocation is import-location-only; no handler
  or route body changed.
- **A3 — nothing observable changed.** `npm run check:runtime-contract` PASS (every internal route path,
  request/response shape, and `authLevel:'anonymous'` byte-identical); no gated/dark lane removed.
- **A4 — ownership recorded** in changes.md (the four `cases/` splits, retro routes, backfill drain retained;
  3 outbox → TKT-264).
- **A5 — both services build.** `build:api` + `build:orch` PASS.
- **A6 — no live write.**

## Pending / gaps

None for the non-outbox surface. The three outbox modules' consolidation is TKT-264's scope (deferred).

## How to re-verify

Confirm `register-internal-routes.ts` lists 13 modules and `index.ts` no longer imports retro-routes /
backfill-drain-route (imports the aggregator + 3 outbox); `npm run check:runtime-contract` PASS; `build:api`
+ `build:orch` PASS.

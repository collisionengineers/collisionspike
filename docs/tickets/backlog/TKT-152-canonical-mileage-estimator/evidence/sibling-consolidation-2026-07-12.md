# TKT-152 sibling consolidation evidence — 2026-07-12

This evidence records code delivery only. Neither sibling branch was merged or deployed in
this implementation pass.

## Active DVLA/DVSA connector

- Repository: `collisionengineers/dvla-dvsa-connector`
- Branch: `codex/tkt-152-canonical-mileage-adapter`
- Commit: `c629a6a0822247ab3c40409eea7f67add7b368a9`
- The active `server/src/analysis.ts` no longer implements current-mileage estimation or
  mileage plausibility arithmetic.
- `server/src/vehicle-data-client.ts` calls the canonical `vehicle-data.v1` service, validates
  the contract/model versions, and exposes only a mechanical observed-vs-canonical-bounds
  adapter. Missing service configuration fails closed; there is no local estimate fallback.
- `npm run typecheck`, the Vite build and Vitest passed (`9` files / `55` tests).
- The `cf-worker/` source is explicitly labelled historical/non-active in that repository and
  prohibited from restoration as an independent mileage implementation.

## Windows mileage tool

- Repository: `collisionengineers/mileagetool`
- Branch: `codex/tkt-152-retire-estimator`
- Commit: `2e24802417ff122e7cc0c0dd66e608c17eb0f7a2`
- Removed the current/target-mileage estimator, estimate model, converter, result projection
  and estimate UI. Raw lookups and factual annual-history/anomaly display remain.
- `BuildAndRun.ps1 -SkipRun` passed with `0` warnings and `0` errors.
- `STATUS.md` records the concrete adapter blocker: the canonical endpoint currently uses an
  internal Function key, which must not be embedded in a desktop client. A staff-authenticated
  user-delegated route or trusted broker is required before the desktop can consume it safely.

## Residual conclusion

After these sibling branches are merged and deployed, the CollisionSpike canonical service is
the only active handwritten current/target-mileage estimator. The historical Cloudflare source
is retained for reference but is neither active nor an authorised fallback. Live consolidation
must not be claimed until both sibling delivery units are merged and deployed independently.

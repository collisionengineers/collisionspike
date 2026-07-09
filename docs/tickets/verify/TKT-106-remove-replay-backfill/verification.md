# Verification — TKT-106: Remove the non-viable replay-backfill driver + gate

## Verdict
PENDING — removal code-complete + offline-gated; awaiting orch redeploy, the live app-setting
deletion, and the function-count re-verify.

## Evidence (so far)
- Driver, manifest lib + test, driver-only Graph pager, index import, and the domain gate all
  removed (see changes.md); grep for `REPLAY_BACKFILL_ENABLED|replayBackfill|replay-manifest|listMessagesSince`
  over `{orchestration,api,packages}/src` returns only the removal-note comments.
- `@cs/domain` vitest 1058 passed; orch suite green post-removal.
- TKT-059's non-viability finding intact (docs/tickets/blocked/TKT-059-…/verification.md).

## Pending / gaps
1. Live: delete `REPLAY_BACKFILL_ENABLED` from `cespk-orch-dev` app-settings.
2. Redeploy orch; re-verify the function count (expected DROP of the driver's ~5 registrations
   from the pre-wave 70 baseline, net of the wave's additions); update LIVE_FACTS + mirror.

## How to re-verify
- `az functionapp config appsettings list -g rg-collisionspike-dev -n cespk-orch-dev --query "[?name=='REPLAY_BACKFILL_ENABLED']"` → empty.
- `az functionapp function list -g rg-collisionspike-dev -n cespk-orch-dev --query "[].name" -o tsv | grep -i replay` → empty.
- `rg "REPLAY_BACKFILL_ENABLED" --glob '!docs/tickets/**' --glob '!memory/**'` → only LIVE_FACTS
  changelog narrative (if retained) + readiness-matrix removal note.

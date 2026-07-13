# TKT-152 sibling consolidation evidence — updated 2026-07-13

This records reviewed code delivery only. Neither sibling branch is merged or
deployed by this implementation agent.

## DVLA/DVSA MCP adapter

- Repository: `collisionengineers/dvla-dvsa-connector`
- Branch: `codex/tkt-152-canonical-mileage-adapter`
- Commits: `1cb7da9` (`refactor(mcp): retire duplicate vehicle runtimes`) and
  `dbb57d5` (`fix(mcp): purge retired runtimes and enforce canonical contract`)
- Removed both direct provider clients, embedded provider credential defaults,
  Firestore/cache/snapshot/evidence-pack/workspace surfaces, all local mileage and
  plausibility rules, and the complete historical Cloudflare runtime.
- The remaining six-tool MCP delegates to `vehicle-data.v1`, validates every
  constrained nested field and exposes raw provider payloads only from canonical
  captured snapshots without inference.
- Deleted the tracked `.mcpb` package, retired `.env` example, Cloudflare deploy/test
  scripts and stale Firestore retention policy. A retained-tree scan found no
  plaintext credential patterns. `SECURITY_ROTATION_REQUIRED.md` records the exact
  historical DVSA application/tenant identifiers and the DVSA/DVLA key names that
  the delivery owner must revoke/rotate without reproducing secret values.
- `npm run typecheck`, `npm test` (2 files / 4 tests), `npm run build`, and
  `npm run build:stdio` pass.

## Windows desktop tool

- Repository: `collisionengineers/mileagetool`
- Branch: `codex/tkt-152-retire-estimator`
- Commit: `eb0329f` (`refactor(desktop): retire standalone vehicle lookup`)
- Removed every direct provider client, embedded-secret generation target, lookup
  service/model/view-model, derived mileage/anomaly rule, and obsolete research.
- The remaining WinUI shell directs staff to the authenticated Case Intake surface.
- `dotnet build RegLookup/RegLookup.csproj -p:Platform=x64` passes with zero
  warnings and zero errors.

## Residual conclusion

The sibling source trees contain no alternate provider clients or handwritten
mileage rules. Suite-wide live consolidation still depends on merging and deploying
these delivery units and configuring the MCP with `VEHICLE_DATA_URL` /
`VEHICLE_DATA_KEY`.

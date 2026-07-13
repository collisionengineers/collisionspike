# TKT-152 sibling consolidation evidence — updated 2026-07-13

This records reviewed code delivery only. Neither sibling branch is merged or
deployed by this implementation agent.

## DVLA/DVSA MCP adapter

- Repository: `collisionengineers/dvla-dvsa-connector`
- Branch: `codex/tkt-152-canonical-mileage-adapter`
- Commit: `1cb7da9` (`refactor(mcp): retire duplicate vehicle runtimes`)
- Removed both direct provider clients, embedded provider credential defaults,
  Firestore/cache/snapshot/evidence-pack/workspace surfaces, all local mileage and
  plausibility rules, and the complete historical Cloudflare runtime.
- The remaining six-tool MCP delegates to `vehicle-data.v1`, validates every
  constrained nested field and exposes raw provider payloads only from canonical
  captured snapshots without inference.
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

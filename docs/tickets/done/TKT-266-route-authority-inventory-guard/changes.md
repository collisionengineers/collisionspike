# Changes — TKT-266: Add the route and authority inventory guard

## Status

Implemented 2026-07-20 on branch `plan008/tkt-266-route-authority-guard`. Net-new tooling; passes on
the current post-TKT-245/262-265 tree; wired into `verify-all.mjs` and CI.

## What changed

### Added

- `scripts/checks/check-route-authority.mjs` — an import/AST-aware guard (TypeScript compiler, mirroring
  `check-managed-identity-mint.mjs`), enforcing three invariants:
  1. **Single internal-trust helper.** `analyzeAuthHelpers` (pure AST) finds every audience-only auth
     wrapper — one that awaits `authenticate(...)` and invokes its handler parameter with NO
     subject/role/scope/principal branch. Exactly one is allowed, at the canonical
     `service-support.ts`; any second declaration (the TKT-245 regression) fails. It is precise:
     `withRole` (role claim), `withVehicleLookupAuth` (`allowedPrincipal`), `withApiKey` (X-Api-Key),
     and the MCP `mcpPrincipalKind` lane are NOT flagged.
  2. **No duplicate authority in a lane.** `analyzeRouteRegistrations` enumerates every `app.http`
     registration with its methods/route/authMode/lane; `evaluateAuthorities` reconciles the internal
     lane against the manifest and fails on two writers of the same `(capability, transition)`. The
     three Archive outbox lanes declare DISTINCT capabilities, so none collapses.
  3. **Sound delegation.** Every manifest `delegatesTo` must resolve to a declared downstream and the
     delegation graph must be acyclic (the staff BFF → focused-Function edges).
  The manifest is reconciled against the AST (unowned = internal route the manifest omits; stale =
  manifest route that no longer exists), so it cannot rot. `--write` regenerates the AST-derived
  fields, preserving hand-authored capability/transition/writeAuthority.
- `scripts/checks/route-authority-inventory.json` — the committed manifest: 64 internal-service routes
  (capability grouped by route prefix), the four authoritative generation-writers flagged
  `writeAuthority` (archive-mirror / provider-archive / status-recompute completers + the box
  file-request drain), and the two staff-BFF delegations (parser, location-assist) to their downstreams.
- `scripts/checks/fixtures/route-authority/second-trust-helper.fixture.ts` — a negative fixture: a
  re-introduced audience-only wrapper (must be flagged) beside a principal-gated wrapper (must not be).
- `scripts/checks/check-route-authority.test.mjs` — 8 tests: the current tree passes; the single-seam
  detector; A3a (second `withServiceAuth` flagged, gated wrapper not); route parsing; A3b (duplicate
  authority; distinct outbox capabilities do not trip it); A3c (delegation resolves / broken / cyclic);
  and unowned-route.

### Changed

- `verify-all.mjs` — registers `['Route and authority inventory', 'node scripts/checks/check-route-authority.mjs']`
  next to the sibling AST guards; the existing `node --test scripts/checks/*.test.mjs` glob
  auto-discovers the new test.
- `package.json` — adds the `check:route-authority` script for standalone runs.

## Delta

The ticket is net-additive (a new standing guard + manifest + fixture + test), the same shape as
PLAN-010's guards. No production code changed; no live write.

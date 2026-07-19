# Changes — TKT-247: Scaffold the server-runtime package and record its boundary

## Status
verify — implemented on branch `plan007/server-runtime` (commit 8ab694bf).

## Files added / changed
- `packages/server-runtime/{package.json, tsconfig.json, vitest.config.ts, src/index.ts, src/index.test.ts, README.md}`
- `docs/adr/0031-server-runtime-boundary.md` (+ the row in `docs/adr/README.md`)
- root `package.json` / `tsconfig.json` (workspace build/test/project-reference wiring)
- `scripts/checks/check-production-dependencies.mjs` (+ `.test.mjs`) — the A3 server-only-boundary gate

## Summary
Server-only `@cs/server-runtime` scaffolded as the complement to browser-safe `@cs/domain`; ADR-0031 records
the permanent boundary; A3 is enforced by a real production-dependency gate (SPA reaching the package fails).
No runtime behaviour added — that migrates in TKT-248–250.

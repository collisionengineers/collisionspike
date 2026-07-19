# Verification — TKT-247: Scaffold the server-runtime package and record its boundary

## Verdict
TESTED (offline) — package scaffolded, ADR-0031 authored, the A3 boundary machine-enforced.

## Evidence
- `packages/server-runtime` (`@cs/server-runtime`) exists as a server-only workspace member wired into the
  root build/test/tsconfig exactly like `@cs/domain`; `npm run build` (whole workspace) and
  `npm test --workspace @cs/server-runtime` pass. No runtime behaviour added in this ticket (A1) — the
  mechanisms migrate in TKT-248–250.
- ADR-0031 (Accepted 2026-07-19) records the server-only vs browser-safe boundary and the bundle-poisoning
  rationale; it is listed in `docs/adr/README.md` and the package README carries the
  `Decision of record: ADR-0031` back-link (A2).
- A3 is machine-enforced: `scripts/checks/check-production-dependencies.mjs` emits a `server-only-boundary`
  violation if any browser (SPA) production graph reaches `packages/server-runtime`
  (`DEFAULT_SERVER_ONLY_PACKAGES`); `@cs/domain` is deliberately not listed. `npm run check:production-dependencies`
  PASS including the negative assertion; two new fixture tests (8/8 dep-check tests) prove the assertion fires
  and stays clean.
- `npm run check:runtime-contract` unchanged — 191 routes / 56 DTOs (A4). No live write (A5).

## Pending / gaps
- None.

## How to re-verify
`npm run build && npm test --workspace @cs/server-runtime && npm run check:production-dependencies && npm run check:runtime-contract && npm run check:docs`.

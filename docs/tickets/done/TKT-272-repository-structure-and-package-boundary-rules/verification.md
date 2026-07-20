# Verification — TKT-272: Record and enforce the repository-structure and package-boundary rules

## Verdict

PASS

## Evidence

- **A1 — structure documentation.** `docs/governance/repository-map.md` records the `@cs/domain`
  (browser-safe) vs `@cs/server-runtime` (server-only) boundary, the single-source repo-shape policy, and
  links the enforcing checks. `node scripts/checks/check-doc-links.mjs` passes.
- **A2 — SPA → server.** `node scripts/checks/check-production-dependencies.mjs` PASS; the existing
  `server-only-boundary` fixtures (`rejects/permits a server-only package reached from a browser production
  graph`) still pass.
- **A3 — domain browser-safe boundary.** The real tree passes with `1 browser-safe package(s) audited`.
  New fixtures prove a direct cloud-SDK import, a transitive runtime-adapter import, a database-client
  manifest dependency, and a Node-builtin import each fail even when no SPA target imports `@cs/domain`;
  a clean `@cs/domain` (with a Node-using **test** file) passes.
  `node --test scripts/checks/check-production-dependencies.test.mjs` — 13/13.
- **A4 — single repo-shape definition.** `node scripts/checks/check-scripts-dedup.mjs` PASS (generated
  policy single-source; `check:layout` and `check:tracked-outputs` import it). `check:layout` now also
  requires `packages/server-runtime/package.json`; `node --test scripts/checks/check-repository-layout.test.mjs`
  — pass.
- **A5 — CI + links.** Both checks are in `verify-all.mjs`; the structure page links them.
- **A6 — no live write.** Checks, tests, and docs only.

## Commands

```
node scripts/checks/check-production-dependencies.mjs
node --test scripts/checks/check-production-dependencies.test.mjs scripts/checks/check-repository-layout.test.mjs
node scripts/checks/check-repository-layout.mjs
node scripts/checks/check-scripts-dedup.mjs
node scripts/checks/check-doc-links.mjs
```

## Pending / gaps

None.

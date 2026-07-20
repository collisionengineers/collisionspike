# Changes — TKT-272: Record and enforce the repository-structure and package-boundary rules

## Structure documentation (A1)

- `docs/governance/repository-map.md` now lists `packages/server-runtime` alongside `packages/domain`
  (relabelled browser-safe / server-only) and gains a **Package boundary and repository shape** section
  recording the two-package boundary (ADR-0031, never merged) and the single-source repo-shape policy,
  with links to the enforcing checks.

## SPA → server boundary (A2)

Already enforced by `check:production-dependencies` (the ADR-0031 `server-only-boundary` assertion) and
covered by the existing `rejects/permits a server-only package …` fixtures. No change needed; documented.

## `@cs/domain` browser-safe boundary (A3, new)

- `scripts/checks/check-production-dependencies.mjs` gains `scanBrowserSafePackages` +
  `browserUnsafeSpecifier`. For each browser-safe package (`@cs/domain`) it audits **both** the manifest
  production dependencies **and** every non-test source file's imports against an explicit browser-safe
  policy — cloud SDKs (`@azure/*`, `@aws-sdk/*`, …), database clients (`pg`, `mssql`, `mongodb`, …),
  `@cs/server-runtime`, and Node built-ins — plus a "reaches outside its own package" escape check. The
  audit runs regardless of whether the SPA imports the package.
- New negative fixtures in `check-production-dependencies.test.mjs`: a direct cloud-SDK import, a
  transitive runtime-adapter import (relative hop → `@cs/server-runtime`), a database-client manifest
  dependency, and a Node-builtin import all fail even with no TypeScript SPA target; a browser-safe
  `@cs/domain` (zod + relative, test files ignored) passes.

## Single-source repo-shape (A4)

Already satisfied: the generated-directory set and file enumerator have one home in
`scripts/checks/repository-files.mjs`, imported by `check:layout` and `check:tracked-outputs` and guarded
against a second copy by `check:scripts-dedup`. Recorded on the structure page.

- `scripts/checks/check-repository-layout.mjs` `requiredPaths` now also requires
  `packages/server-runtime/package.json` (its test fixture updated to match).

## CI + links (A5) / no live write (A6)

Both checks run in CI and under `verify-all.mjs`; the structure page links both. Checks, tests, and docs
only — no live write.

# Changes — TKT-251: Add the server-runtime forbidden-pattern drift guard

## Status
implemented (uncommitted on branch plan007/server-runtime)

## What changed
- **`scripts/checks/check-managed-identity-mint.mjs`** (new) — AST/import-aware drift guard. Parses
  production TypeScript with the TypeScript compiler (`import ts from "typescript"`, the same parser
  `check-production-dependencies.mjs` uses) and fails if the managed-identity token-MINT surface
  appears outside `packages/server-runtime`. Two-pronged detection:
  - **Raw-endpoint mint (prong 1):** taint-tracks `process.env.IDENTITY_ENDPOINT` (property and
    element access, plus `const { IDENTITY_ENDPOINT } = process.env` destructuring) through local
    `const`/`let` bindings to a fixed point, and flags a `fetch(...)` whose request URL is built
    from that value (multi-hop `endpoint -> url -> fetch(url)` included). Also flags the
    `X-IDENTITY-HEADER` request-header string literal. A bare presence-check read of
    `IDENTITY_ENDPOINT` that never fetches it (e.g. `blob-store.ts`) is deliberately NOT a mint.
  - **SDK mint (prong 2):** flags value imports of `@azure/identity`
    `ManagedIdentityCredential` / `DefaultAzureCredential`, `new ManagedIdentityCredential()` /
    `new DefaultAzureCredential()` (including `ns.ManagedIdentityCredential`), namespace imports of
    `@azure/identity`, and `require`/dynamic-`import` of it. `import type` is ignored.
  - Scope: tracked `.ts`/`.tsx` under `apps/`, `services/`, `packages/`, excluding
    `packages/server-runtime`, `*.test.ts`/`*.spec.ts`/`tests`/`__tests__`, `*.d.ts`,
    `dist`/`node_modules`. Python (`.py`) and Markdown (`.md`) are excluded by not being TypeScript.
  - CLI: default scans the production tree; `--scan <dir>` scans a directory unscoped (used to point
    the guard at the negative fixtures); `--json` for machine output.
- **`scripts/checks/fixtures/managed-identity-mint/`** (new) — negative fixtures (A3), outside the
  production scan scope so the normal run never includes them:
  - `raw-endpoint-mint.fixture.ts` — a raw `IDENTITY_ENDPOINT` -> `fetch` + `X-IDENTITY-HEADER` mint.
  - `sdk-managed-identity-credential.fixture.ts` — `import { ManagedIdentityCredential,
    DefaultAzureCredential } from '@azure/identity'` + `new ManagedIdentityCredential()`.
- **`scripts/checks/check-managed-identity-mint.test.mjs`** (new) — 12 `node --test` cases covering
  both fixtures (fail), presence-check/regex/comment/type-only non-flags, direct + multi-hop taint,
  SDK construction, production scoping, and an A2 positive run asserting the real tree is clean.
- **`verify-all.mjs`** — added `['Managed-identity mint boundary', 'node
  scripts/checks/check-managed-identity-mint.mjs']` alongside the production-dependency boundary
  (A4). The test file is already picked up by the existing `scripts/checks/*.test.mjs` glob.
- **`package.json`** — added `"check:managed-identity-mint"` script.

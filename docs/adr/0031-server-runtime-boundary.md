# ADR-0031 — Server-only runtime plumbing is a separate package from browser-safe `@cs/domain`

**Status:** Accepted 2026-07-19 per [PLAN-007](../tickets/plans/PLAN-007-server-runtime-foundation.md) ([TKT-247](../tickets/done/TKT-247-server-runtime-scaffold-and-boundary/TKT-247-server-runtime-scaffold-and-boundary.md)).

## Decision

Shared code is split across two workspace packages by execution environment, and the split is
permanent:

- **`@cs/domain` — browser-safe, SDK-free.** Environment-free business types, DTOs, JSON schemas,
  codecs, readiness rules, and numeric mappings. It must not depend on a runtime adapter, database
  client, or cloud SDK, because the web app (`@cs/web`) imports it and bundles it into the SPA.
- **`@cs/server-runtime` — server-only, SDK-allowed.** The single home for runtime plumbing that both
  TypeScript services would otherwise re-implement: managed-identity token minting, the Data-API HTTP
  core, bounded retry, and the storage-token helper. It is allowed to import cloud SDKs (for example
  `@azure/identity`, the recommended abstraction over the raw managed-identity endpoint) and to depend
  on the Node runtime.

Only server-side callers (`@cs/api`, `@cs/orchestration`) may depend on `@cs/server-runtime`. The web
app may depend on `@cs/domain` only. This ADR records the boundary; the runtime mechanisms themselves
migrate into the new package in TKT-248, TKT-249, and TKT-250, and no runtime behaviour is added when
the package is first scaffolded.

## Rationale

The two packages must never be merged. `@cs/domain` is intentionally SDK-free precisely so the browser
can consume it; a server-runtime concern such as a managed-identity token minter necessarily pulls a
cloud SDK and Node-only APIs. Collapsing the runtime plumbing into `@cs/domain` — or letting the SPA
import the server package — would poison the browser bundle with cloud SDKs and Node runtime code,
inflating and breaking the SPA. Keeping runtime plumbing hand-rolled per service (the state before this
decision) is the other failure mode: it duplicates the same token-mint, HTTP, retry, and storage code
across both services and lets them drift. A dedicated server-only package removes the duplication
without endangering the bundle.

The boundary is machine-enforced, not merely documented. `check:production-dependencies` walks the real
import graph from each production entry point and fails if any browser (SPA) production graph reaches a
server-only package; `@cs/server-runtime` is registered as server-only there, so the SPA-cannot-reach-it
property is a passing negative assertion rather than a convention.

## Consequences

New shared code must be placed by environment: browser-reachable code goes in `@cs/domain` and stays
SDK-free; anything needing a cloud SDK or the Node runtime goes in `@cs/server-runtime` and stays off
the web app's dependency graph. Adding a server-only package to a browser production graph is a gate
failure. The realizing package is [`packages/server-runtime`](../../packages/server-runtime/README.md),
which carries the `Decision of record: ADR-0031` back-link.

This ADR is the series-reserved start of the PLAN-007 numbering. The 0026–0030 range is owned by
TKT-246 and may remain a temporary numbering gap; ADR-0031 neither cites nor depends on it.

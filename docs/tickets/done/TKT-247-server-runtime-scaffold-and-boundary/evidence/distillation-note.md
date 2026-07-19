# Distillation note — TKT-247

**Source draft:** `workingspace/architecture-simplification/01-server-runtime-foundation.md` (ticket 1 of the
proposed five). **Owning plan:** PLAN-007.

**Grounding (read-only, 2026-07-19):**
- `packages/` holds only `domain`; `@cs/domain` README forbids runtime-adapter / database-client / cloud-SDK
  imports (browser-safe). No server-only shared package exists.
- The four target mechanisms (managed-identity token mint, Data-API HTTP core, bounded retry, storage token
  helper) are each hand-rolled per service — see the sibling tickets TKT-248/249/250 for exact call-site
  inventories.
- Microsoft Learn grounding for ADR-0031: managed identity is the recommended passwordless posture and the
  `@azure/identity` client library is the recommended abstraction over the raw `IDENTITY_ENDPOINT`; a
  server-only package is where such an SDK dependency belongs, away from the SPA bundle.

**Boundary rationale to capture in ADR-0031:** `@cs/domain` is intentionally SDK-free so the web app can
import it; `@cs/server-runtime` is intentionally SDK-allowed. Collapsing them would pull cloud SDKs into the
browser bundle. The `check:production-dependencies` boundary assertion enforces the split.

No live Azure state is asserted by this ticket; it is a source/packaging change only.

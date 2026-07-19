# ADR-0028 — Compute is three tiers: a browser SPA, two TypeScript services, and focused Python services

**Status:** Proposed — pending operator approval (TKT-246).

## Decision

Compute runs as three tiers. The middle tier is two cooperating TypeScript service apps, not one.

- **Presentation.** The staff SPA ([../../apps/web](../../apps/web)) reaches the system
  only through the Data API's REST contracts; it opens no database connection and calls no provider
  directly ([../../apps/web/src/data/rest-client.ts](../../apps/web/src/data/rest-client.ts)). Box, parser,
  and location assistance are consumed through Data API proxy routes, not direct provider calls
  ([../../services/data-api/src/platform/http/proxy-routes.ts](../../services/data-api/src/platform/http/proxy-routes.ts)).
- **Authoritative TypeScript services.** The Data API
  ([../../services/data-api](../../services/data-api)) is the only staff-facing, authoritative
  case-data REST surface, the only database writer, the audience/role and row-level-security
  enforcer, and the audit writer. (It is not the system's only synchronous HTTP surface: the focused
  Python services and several orchestration starters expose function-key HTTP routes too — see below.)
  Durable orchestration ([../../services/orchestration](../../services/orchestration)) runs
  Azure Functions v4 + durable-functions replay-safe, idempotent orchestrations with bounded retries
  ([../../services/orchestration/src/workflows/intake/intakeOrchestrator.ts](../../services/orchestration/src/workflows/intake/intakeOrchestrator.ts)),
  triggered by Microsoft Graph push notifications and by Data-API-enqueued storage-queue jobs
  ([../../services/data-api/src/features/inbound/outlook-queue.ts](../../services/data-api/src/features/inbound/outlook-queue.ts)).
  Orchestration opens no database connection — every authoritative write passes through the Data API
  adapter ([../../services/orchestration/src/adapters/data-api.ts](../../services/orchestration/src/adapters/data-api.ts)).
  PostgreSQL sits beneath the Data API as system of record.
- **Focused Python services.** [../../services/functions](../../services/functions) — parser, vehicle
  enrichment, EVA Sentry, OCR, Archive events (box-webhook), and location assistance — are bounded,
  function-key-authenticated HTTP contracts that return versioned records and own no case state. Both
  tier-2 apps call them: orchestration via
  [functions-client.ts](../../services/orchestration/src/adapters/functions-client.ts) (parser, box, EVA,
  location, OCR); the Data API via
  [service-client.ts](../../services/data-api/src/platform/http/service-client.ts) (vehicle enrichment,
  which it owns, plus the parser/location proxies and image-analysis OCR/location stages). Vehicle
  enrichment specifically flows orchestration → Data API route → enrichment Function
  ([../../services/orchestration/src/workflows/intake/enrich.ts](../../services/orchestration/src/workflows/intake/enrich.ts)).

Resource names, function counts, and gates are not architecture; they live in
[../../LIVE_FACTS.json](../../LIVE_FACTS.json).

## Rationale

- One write boundary. Role checks and row-level security live in a single place, so neither the SPA nor
  orchestration can fork the case model or bypass the enforcer.
- A sync/async split matched to the work. Staff-facing, latency-sensitive capabilities run synchronously
  on the Data API; long-running, retry-heavy, Graph-driven intake runs durable and replay-safe, so a
  retry replays the first committed effect instead of duplicating it.
- Dependency isolation. Document, vehicle, OCR, EVA, Box, and location dependencies stay inside bounded
  Python services, each presenting one contract to every caller.

## Consequences

- The Python tier is a shared leaf fan with two upstreams; a contract change must satisfy both the Data
  API and orchestration callers, not one path.
- Every effecting orchestration call needs a stable operation key and recorded outcome, because durable
  retries replay ([../architecture/system-overview.md](../architecture/system-overview.md) reliability
  posture).
- The SPA must never gain a direct database or provider path; a new integration becomes a focused Python
  service behind one of the two tier-2 callers.
- The write direction is fixed: orchestration → Data API only. The Data API → orchestration edge is
  queue-based for every write/workflow (async enqueue via
  [outlook-queue.ts](../../services/data-api/src/features/inbound/outlook-queue.ts)), with one
  deliberate read-only exception — the Data API synchronously POSTs to an orchestration HTTP route
  (`OUTLOOK_LINK_RESOLVER_URL` + its function key) to resolve the current Outlook link through the app
  that owns the Graph credential
  ([outlook-link-resolver.ts](../../services/data-api/src/features/inbound/outlook-link-resolver.ts)),
  reading no case state and performing no write. A future change must not invert the write direction,
  let orchestration write PostgreSQL directly, or turn that read-only bridge into a write path.

## Amendment — one bicep layout convention (2026-07-19)

Driven by [TKT-255](../tickets/done/TKT-255-bicep-layout-rationalisation/TKT-255-bicep-layout-rationalisation.md)
(PLAN-009). The estate previously carried **two** bicep layout conventions: the central
`infrastructure/config-capture/{api,orch,spa}.bicep` settings-capture templates, and per-service function
host templates scattered under `services/functions/<service>/infra/`. That split is resolved to the single
convention named in PLAN-006's locked structure — **all infrastructure-as-code lives under
`infrastructure/`** — by relocating the six per-service function host templates to
`infrastructure/functions/<service>/` (byte-identical; no resource name, deployment parameter, or runtime
behaviour change — a layout-only move). `infrastructure/config-capture/` is unchanged.

Consequence: infrastructure-as-code is discovered under one root; a new service's host template is authored
under `infrastructure/functions/<service>/`, not beside the service code. The `services/functions/<service>/`
trees are now code-only. Any future rider edit to those templates (e.g. TKT-206's ADR-0017 retention-parameter
sweep) targets the new `infrastructure/functions/<service>/main.bicep` paths.

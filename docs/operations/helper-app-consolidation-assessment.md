# Helper-app consolidation assessment (read-only)

**Ticket:** TKT-256 (PLAN-009). **Date:** 2026-07-19. **Mode:** read-only ARM resource inventory of
`rg-collisionspike-dev`; no resource was modified. Concrete resource names and counts live only in
[`LIVE_FACTS.json`](../../LIVE_FACTS.json) — this assessment describes the topology at the pattern level.

## Question

Each focused Python helper service is deployed as its own Azure Function App. Should their per-app
App Service plans and storage accounts be consolidated to reduce estate surface, or kept isolated?
This is a read-only recommendation only; it executes no change. Its output feeds PLAN-011's Python
sharing calculus.

## Observed topology

Per-service, from the read-only inventory:

- **Compute plan.** Each helper Function App (parser, vehicle-enrichment, EVA Sentry, Archive events
  / box-webhook, location-assist) runs on **its own App Service plan**. The OCR service is the
  exception — it runs on a **Container Apps managed environment** (containerised), not an App Service
  plan, so it is architecturally distinct and out of scope for a shared-plan consolidation.
- **Storage.** Each helper Function App has **its own storage account** (the standard Functions
  host-storage pattern: triggers, timers, the host lease, and Durable state where used).
- **Telemetry (Application Insights + Log Analytics).** Telemetry is **already largely consolidated**:
  only the parser and OCR services carry a dedicated Application Insights component and Log Analytics
  workspace; the remaining small helpers do not own a dedicated component and report into shared
  telemetry. Consolidating compute plans or storage accounts therefore would **not** simplify the
  telemetry topology — that dimension is already shared and is unaffected by a plan/storage merge.

## Trade-offs

**Potential maintenance win from consolidating plans/storage:**

- Fewer App Service plans and storage accounts to inventory, patch-track, and reason about.
- A single plan could, in principle, share warmed compute across low-traffic helpers.

**Migration risk and cost (why isolation is defensible):**

- **Cold-start / noisy-neighbour isolation.** Separate plans give each helper independent scaling and
  fault isolation; a shared plan couples their cold-start behaviour and lets one busy helper starve the
  others. For sporadically-invoked helpers this isolation is a feature, not waste.
- **Identity and least privilege.** Each app's managed identity and its storage-account role
  assignments are currently scoped per app. A shared storage account widens each app's blast radius and
  complicates least-privilege reasoning (a compromise of one helper reaches the shared host state).
- **Deployment blast radius.** Independent plans/storage mean a deploy or misconfiguration of one
  helper cannot disrupt another. A shared plan makes every helper a co-tenant of every deploy.
- **Durable/host-state coupling.** The Functions host storage carries lease and (where used) Durable
  state; co-locating multiple hosts on one account is supported but increases operational coupling and
  the cost of an isolated rollback.
- **Heterogeneous hosting.** OCR is already on a different hosting model (Container Apps), so a
  "one plan for all helpers" target could never be uniform; it would apply to five of six services.

## Recommendation

**Keep the per-service plan and storage isolation.** The consolidation's maintenance win is modest
(fewer plans/storage accounts) while the isolation it would remove — independent scaling/cold-start,
per-app least-privilege identity, and a bounded deployment blast radius — is load-bearing for a set of
sporadically-invoked, independently-deployed helpers. Critically, the one dimension where sharing would
genuinely simplify operations — telemetry — is **already** shared, so a plan/storage merge buys none of
that benefit. If cost pressure later forces a review, the lowest-risk lever is plan **SKU/right-sizing**
per app (or Flex Consumption), not physical plan/storage consolidation.

## Input to PLAN-011

PLAN-011's Python sharing decision should treat **code/runtime sharing** (shared parser vendoring,
shared request/response contracts, a shared Python doctrine) as separable from **infrastructure
sharing**. This assessment recommends against infrastructure (plan/storage) consolidation; it does not
constrain PLAN-011's code-level sharing, which stands on its own merits. TKT-256 closes on this filed
assessment and does not wait on PLAN-011 landing.

## Evidence

Read-only ARM resource inventory of `rg-collisionspike-dev`, 2026-07-19 — the per-service plan, storage,
and Application-Insights/Log-Analytics presence summarised above was read from that inventory. No live
mutation was performed. Concrete resource identifiers are held in `LIVE_FACTS.json`, not duplicated here.

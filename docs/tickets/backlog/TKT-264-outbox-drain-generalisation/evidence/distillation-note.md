# Distillation note — TKT-264

**Source:** `workingspace/architecture-simplification/02-canonical-service-routes.md` step 4. **Plan:**
PLAN-008. Corrected against source and live Function registrations on 2026-07-19.

**Three lane stacks** (Data API routes + orchestration monitor + adapter) exist, but their protocols differ:

| Lane | outbox-routes | monitor | api adapter |
|---|---|---|---|
| archive-mirror | `features/archive/mirror-outbox-routes.ts` | `workflows/archive/archive-mirror-monitor.ts` | `adapters/archive-mirror-api.ts` |
| provider-archive | `features/archive/provider-outbox-routes.ts` | `workflows/archive/provider-archive-monitor.ts` | `adapters/provider-archive-api.ts` |
| box-file-request | `features/archive/file-request-outbox-routes.ts` | `workflows/archive/box-maintenance-monitor.ts` | `adapters/box-maintenance-api.ts` |

Archive mirror and provider Archive use pending/complete/defer generation protocols. File Request exposes one
atomic API-owned drain. The safe shared seam is Durable monitor lifecycle, not one generic data-plane drain.

**Co-located responsibility:** `box-maintenance-monitor.ts` also owns
`BOX_CLASSIFY_MONITOR_INSTANCE_ID`, `boxClassificationMonitorOrchestrator`,
`boxClassificationSweepActivity`, and the shared `/maintenance/box-monitors` route. Separate and preserve that
lane before touching File Request.

**Waits on TKT-246** — the outbox/generation-counter reliability ADR (number not pre-assigned), so lifecycle
sharing amends a decision of record. Preserve every Durable name, ID, interval, route, and idempotency rule.

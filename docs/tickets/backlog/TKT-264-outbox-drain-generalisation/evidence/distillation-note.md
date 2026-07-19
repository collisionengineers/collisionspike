# Distillation note — TKT-264

**Source:** `02-canonical-service-routes.md` step 4. **Plan:** PLAN-008. Re-verified read-only 2026-07-19
(`PLAN-008.dossier.json`).

**Three outbox-drain triples** (data-api routes + orchestration monitor + orchestration api adapter):

| Lane | outbox-routes | monitor | api adapter |
|---|---|---|---|
| archive-mirror | `features/archive/mirror-outbox-routes.ts` | `workflows/archive/archive-mirror-monitor.ts` | `adapters/archive-mirror-api.ts` |
| provider-archive | `features/archive/provider-outbox-routes.ts` | `workflows/archive/provider-archive-monitor.ts` | `adapters/provider-archive-api.ts` |
| box-file-request | `features/archive/file-request-outbox-routes.ts` | `workflows/archive/box-maintenance-monitor.ts` | `adapters/box-maintenance-api.ts` |

**Naming caveat:** the third lane's monitor/adapter are named `box-maintenance-*`, not `box-file-request-*`,
but they ARE the file-request drain (`BOX_FILE_REQUEST_MONITOR_INSTANCE_ID = 'box-file-request-outbox-monitor-singleton'`,
`boxFileRequestOutboxMonitorOrchestrator`, `BoxFileRequestDrainSummary`). Model it as the file-request lane.

**Waits on TKT-246** — the outbox/generation-counter reliability ADR (expected ADR-0030) so the
generalisation amends a decision of record. Preserve durable ids + idempotency.

---
id: PLAN-002
title: Case done lifecycle
status: active
tickets: [TKT-094, TKT-095, TKT-096]
depends-on: []
plan-kind: feature
---

# PLAN-002 — Case done lifecycle

## Outcome

Make `done` a stable terminal case state that is reached only from recognized completion evidence and
remains visible without polluting active work queues.

## Decisions

- Persisted numeric status values remain unchanged.
- Completion is derived from explicit staff action or accepted evidence, never from absence of work.
- A completed case remains searchable and auditable.
- Automatic detectors must be independently verified against real events before their tickets close.

## Sequence

1. Preserve the terminal state and status-transition rules.
2. Verify each supported completion detector and its idempotency.
3. Confirm completed-case navigation, filtering and read-only access.

## Close-out

All three member tickets need evidence for persistence, detection and staff visibility. The plan stays
active while any detector awaits a genuine event.

<!-- GENERATED:PROGRESS -->
## Computed progress

**1/3 done (33%).**

| Status | Count |
|---|---:|
| Now | 0 |
| Verify | 2 |
| Done | 1 |
| Next | 0 |
| Backlog | 0 |
| Blocked | 0 |

| Ticket | Status | Title |
|---|---|---|
| [TKT-094](../verify/TKT-094-case-done-status-model/TKT-094-case-done-status-model.md) | verify | Case done terminal state and EVA-submitted transition |
| [TKT-095](../verify/TKT-095-case-done-detectors/TKT-095-case-done-detectors.md) | verify | Case `done` detectors — manual → Box report-PDF → sent-email → EVA poll |
| [TKT-096](../done/TKT-096-completed-archive-view/TKT-096-completed-archive-view.md) | done | Completed/Archive view + dashboard drill-through + terminal-scope search fold-in |
<!-- /GENERATED:PROGRESS -->

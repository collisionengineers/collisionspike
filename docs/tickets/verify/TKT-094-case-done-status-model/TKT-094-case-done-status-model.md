---
id: TKT-094
title: Case done terminal state and EVA-submitted transition
status: verify
priority: P1
area: intake
tickets-it-relates-to: [TKT-095, TKT-096, TKT-058, TKT-072]
research-link: docs/tickets/verify/TKT-094-case-done-status-model/evidence/operator-note.md
plan: PLAN-002
---

# Case done terminal state and EVA-submitted transition

## Problem

The case lifecycle needs an explicit terminal `done` state and a reliable transition to
`eva_submitted` when staff export an accepted case. Completion must remain searchable and must not
re-enter active queues.

## Current implementation

- Stable persisted status codes remain unchanged, including `done = 100000012`.
- `POST /api/cases/{id}/eva-submitted` is authenticated, guarded and idempotent.
- Export records `submitted_at`, an audit event and the terminal transition through the shared transition
  helper.
- The web app exports the accepted data, calls the transition route, refreshes case state and prevents a
  second transition.
- Active queue mapping excludes terminal states; global search and Completed retain access.

## Acceptance

- Numeric status mappings exactly match the repository baseline.
- An authenticated export of a ready case transitions it once to `eva_submitted`, records the actor and
  timestamp, and refreshes the staff view.
- Repeating the transition is a safe no-op; stale or invalid state cannot overwrite a terminal state.
- Dashboard submission counts and activity use the persisted transition.
- `done`, `eva_submitted`, removed and held cases remain correctly separated from active queues.
- Tests cover successful, repeated, unauthorized, stale and invalid transitions.
- One genuine staff export provides live evidence for route, audit, queue and dashboard behavior.

## Artifacts

- [Changes](./changes.md)
- [Atomic-audit regression changes](./changes-regression-11-07-26.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
- [Database readback](./evidence/w4-ddl-confirmation-100726.txt)

# Regression follow-up — 2026-07-11

PR 55's functionality audit found that the staff `ready_for_eva → eva_submitted` and
`eva_submitted → done` routes committed the case status before writing the required lifecycle audit.
The normal audit helper deliberately swallows insert failures, so a transient database fault could
leave a permanent terminal status with no corresponding activity record and no retry signal.

## Acceptance

- Each guarded terminal status update and its required audit event commit in one transaction.
- A required-audit failure rolls back the status change so a retry can complete both writes.
- Replays after a successful transition remain no-ops and never duplicate the audit.
- The internal detector and staff routes use the same atomic transition implementation.
- Tests inject an audit failure, prove rollback, retry successfully, and prove one final audit.

## Implementation

- Added a strict audit writer for lifecycle records and a shared guarded terminal-transition helper.
  The status update and its required audit insert now run in the same database transaction.
- The staff EVA-submitted route, staff report-delivered route and service-authenticated detector route
  all use that helper. A failed audit insert rolls back the status; a successful replay is a guarded
  no-op rather than a second audit.
- `services/data-api/src/features/cases/terminal-transition.test.ts` injects an audit failure into both transitions, proves the
  rollback, retries the same signal and proves exactly one final audit. The repaired API suite is green
  offline; deployment and a new live transition remain pending.

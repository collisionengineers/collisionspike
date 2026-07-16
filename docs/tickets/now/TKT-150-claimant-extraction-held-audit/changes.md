# Changes — TKT-150

## Status

Runtime extraction and source-preservation work is present; remediation remains blocked by failed
read-only source binding. No production apply occurred.

## Retained implementation

- Parser extraction and negative fixtures follow ADR-0018's sibling-first re-vendor process.
- Data API and orchestration paths preserve claimant source, expose conflicts and keep claimant/source
  persistence atomic.
- Create, merge, reconstruction and later-document paths share claimant precedence.
- Provider recovery re-evaluates hold, Case/PO and Archive adoption through normal idempotent behavior.

## Repository reset disposition

The one-time remediation executable and its dedicated test command were removed because they are not a
current product or reusable maintenance interface. Their read-only outputs remain in this ticket's evidence.
The failed candidate plan is not an apply artifact and carries no approval forward.

Any future apply tool must be newly implemented and reviewed against
[the safety contract](./remediation-runbook.md), then bound to a fresh audited plan, backup and named
authorization.

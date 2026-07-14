---
id: TKT-206
title: Remove privacy-driven runtime data restrictions safely
status: now
priority: P0
area: platform
worktree-lanes: [runtime, schema]
worktree-components: [node, python:box-webhook]
tickets-it-relates-to: [TKT-068, TKT-150, TKT-199]
research-link: docs/tickets/now/TKT-206-remove-runtime-data-policy-controls/evidence/operator-note.md
plan: PLAN-004
---

# Remove privacy-driven runtime data restrictions safely

## Problem
The repository-data authority is explicit, but runtime code and schema still contain privacy-driven omission, opt-out, retention, automatic-disposition and post-Archive deletion behavior. Those controls can prevent configured project processing from receiving the full case context that the operator has authorized. Removing them without an ordered drain and migration would risk running callers against removed routes or columns.

## Evidence
- [Recovery-plan operator note](./evidence/operator-note.md) lists the exact policy controls to remove and the controls that remain binding.
- TKT-199 establishes that PII/privacy alone is not a reason to omit authorized project processing, while preserving credentials, authorization, RLS, audit integrity, recovery and approved production-write scope.

## Proposed change
Remove the listed privacy-driven runtime controls through a deployment sequence that first drains callers and durable work, removes routes and SQL references, then applies the destructive schema migration. Retain historical audit interpretation and the separately authorized normal handler-initiated deletion path.

## Acceptance
- **A1.** Configured project processing receives full relevant names, email addresses, phone numbers, addresses, filenames and case context without PII scrubbing or privacy-driven omission. Tests prove the removed transformations no longer alter authorized inputs.
- **A2.** `work_provider.ai_allowed` and all API, client, route, job, migration and consumer logic that reads or writes it are removed; provider opt-outs no longer control authorized project processing.
- **A3.** Automated case disposition, privacy retention/erasure and post-Archive Blob-purge jobs/routes are removed and cannot be scheduled or invoked. Historical `case_disposed` audit values remain readable, but no new value is produced.
- **A4.** `retention_expires_at`, `legal_hold`, `legal_hold_reason`, `held_by` and `ai_allowed` are dropped only after every caller, SQL reference, route, job and durable instance has drained or been removed. The migration works from baseline and live-like states.
- **A5.** `closed_at`, normal handler-initiated deletion, authentication, authorization, RLS, audit integrity, credential redaction, backup/recovery controls and approval for production writes remain intact and are regression-tested.
- **A6.** Deployment follows the required order: stop orchestration callers/jobs and API SQL references; wait for old instances and durable work to drain; remove internal routes; then apply the column-dropping migration. Rollback/restore evidence and health checks are recorded before and after each boundary.
- **A7.** Static searches, unit/integration tests and deployed checks prove privacy jobs/routes/provider opt-outs are absent and no removed column is queried. No new telemetry or external transmission is introduced merely to collect more data.

## Validation
- **Offline:** inventory all policy references; run full names/email/phone/address/filename/context input tests; exercise migration upgrades against baseline and live-like databases; run API/orchestration/job tests and the complete offline verifier.
- **Live:** follow the staged drain/removal/migration runbook against the authorized Azure environment, recording caller/job quiescence, durable drain, health checks, migration results, normal close/delete regression, authentication/RLS checks and rollback/restore readiness at each boundary.

## Research
Distilled 2026-07-14 from the attached recovery plan. It removes PII/privacy/minimisation/retention runtime policy only; it does not authorize credential disclosure, disabled authentication/RLS, unapproved production mutation, public publication or new external transmission.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)

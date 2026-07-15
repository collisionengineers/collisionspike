---
id: TKT-215
title: Audit live use and disposition of the EVA validation service
status: backlog
priority: P2
area: integration
tickets-it-relates-to: [TKT-020, TKT-159, TKT-207, TKT-209, TKT-211, TKT-214, TKT-216]
research-link: docs/tickets/backlog/TKT-215-eva-validation-live-use-audit/evidence/operator-note.md
plan: PLAN-006
---

# Audit live use and disposition of the EVA validation service

## Problem
Repository structure alone cannot establish whether the retained EVA validation service is actively used, intentionally dormant, duplicated or safe to retire. Removing or preserving it on source inference would either risk a live dependency or retain dead complexity.

## Evidence
The service is present in the current repository and named in PLAN-006's locked function layout. No current read-only live-use audit has been performed for this cleanup, so the ticket remains backlog.

## Proposed change
Perform a strictly read-only audit of source callers, route/configuration references, deployed function metadata, approved telemetry and current architecture records. Record an evidence-backed keep, integrate, replace or retire disposition, then make any repository-only documentation/path update through PLAN-006. Any deployment or live mutation requires separate authorization.

## Acceptance
- **A1.** A source inventory records every caller, route, contract, configuration key, test and documentation reference to the EVA validation service, including absence where a caller was expected.
- **A2.** Read-only deployed evidence records the function's existence, enabled state, route registration, relevant configuration references and a bounded telemetry window sufficient to assess invocations and failures without exposing credentials or client content.
- **A3.** The audit distinguishes no observed use from proof of no dependency. Retention periods, scale-to-zero behavior, indirect callers, retries and missing telemetry are treated as explicit confidence limits.
- **A4.** One disposition is recorded with evidence and consequences: keep in the locked function layout, integrate behind a canonical current contract, replace through a separately approved ticket, or retire through a separately approved change.
- **A5.** A retire disposition requires affirmative proof that no live or repository caller depends on the service, contract tests for the successor or absence boundary, rollback guidance and an authorized deployment plan. Source quietness alone is insufficient.
- **A6.** A keep disposition records the canonical owner, contract, callers, tests and documentation so a future agent does not repeat the audit.
- **A7.** The audit does not remove EVA Sentry, conflate this service with TKT-216's route/body defect, or alter current routes, DTOs, auth, Azure resource names, Postgres columns or numeric codes.
- **A8.** All live actions performed by this ticket are read-only. No configuration change, deployment, request that creates external work, database write or evidence manufacture is authorized.
- **A9.** TKT-207 and the final docs record the decided repository disposition, and TKT-214 verifies the corresponding path and reference state.

## Validation
- Cross-check source/configuration callers against deployed function metadata and a bounded telemetry query.
- Have a second reviewer challenge absence evidence and the selected disposition.
- Keep the verdict PENDING until read-only live evidence and every limitation are attached.

## Research
Distilled from the operator's requirement to consider affected services without using cleanup as authority to remove uncertain live behavior.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)

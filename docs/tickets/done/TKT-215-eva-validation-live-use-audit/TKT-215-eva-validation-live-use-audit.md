---
id: TKT-215
title: Audit live use and disposition of the EVA validation service
status: done
priority: P2
area: integration
tickets-it-relates-to: [TKT-020, TKT-159, TKT-207, TKT-209, TKT-211, TKT-214, TKT-216]
research-link: docs/tickets/done/TKT-215-eva-validation-live-use-audit/evidence/operator-note.md
plan: PLAN-006
---

# Audit live use and disposition of the EVA validation service

## Problem
Repository structure alone cannot establish whether the retained EVA validation service is actively used, intentionally dormant, duplicated or safe to retire. Removing or preserving it on source inference would either risk a live dependency or retain dead complexity.

## Evidence
The [2026-07-15 read-only audit](./evidence/live-use-audit-2026-07-15.md) found no repository caller,
no expected-caller configuration and no request or trace in the complete 90-day available telemetry
window. The live resource remains Running and untouched.

## Proposed change
Remove the unused repository service while retaining the shared domain evaluator and Data API
status-recompute path. Record the live resource as separate, deferred production work. No deployment
or live mutation is part of this ticket.

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
- [Read-only live-use audit](./evidence/live-use-audit-2026-07-15.md)

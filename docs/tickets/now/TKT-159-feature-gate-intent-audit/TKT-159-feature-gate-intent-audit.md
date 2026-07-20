---
id: TKT-159
title: Reconcile every live feature gate with intended production behavior
status: now
priority: P1
area: platform
tickets-it-relates-to: [TKT-013, TKT-063, TKT-110, TKT-154, TKT-156]
research-link: docs/tickets/now/TKT-159-feature-gate-intent-audit/evidence/operator-note.md
plan: PLAN-004
---

# Reconcile every live feature gate with intended production behavior

## Problem
The registry, older tickets and live app settings have drifted, and some features may remain disabled even after their implementation/dependency is ready. A gate being present, absent, retired or intentionally off must be reconciled with the code that reads it and the operator's current intended behavior.

## Evidence
- [Operator note](./evidence/operator-note.md) — ensure no feature that should be on remains off.
- TKT-063 — authored the prior readiness matrix but did not enforce a fresh code-to-live reconciliation.
- Known drift examples: TKT-034 and TKT-110 wording trails the current registry.

## Proposed change
PROPOSED (not built): generate a code-derived gate inventory, compare it with live API/services/orchestration/retained-Function settings and the authoritative intent, safely activate approved implemented features, smoke-test every active path, and update the registry.

## Acceptance
- A code-derived inventory lists every feature/config gate reader, owning component, default behavior, dependency, intended production state, live value, registry value, and verification method. Secret values are never printed or committed.
- Each gate is classified as on-and-required, off-and-intentional, awaiting an implementation/dependency, or retired/dead code. Absence is not treated as synonymous with intentional off without evidence.
- Ticket, runbook and registry statements that conflict with code/live state are identified explicitly and corrected in the same programme or linked to TKT-020.
- Every implemented feature the operator has directed to be active is enabled in the correct component(s) only after prerequisites, schema/deploy order and rollback steps are checked.
- Intentionally disabled behavior has an explicit current reason and owner; retired gates are removed from code/config/docs rather than left as misleading toggles.
- Gate changes use backup/readback, change one coherent feature at a time, and are idempotent. No secret/auth/RBAC scope is widened incidentally.
- Every enabled feature receives a behavioral smoke test at its real surface, not just an app-setting readback. Failures roll back or remain visibly blocked with evidence.
- API/services/orchestration/Function restarts caused by setting changes are monitored through health, function registration and error telemetry before proceeding.
- A machine-readable registry check fails CI when code gate names, documented intended states and tracked live-state entries drift.
- Final Chrome/API/MCP/Box/Outlook read-only checks cover the active user-visible/integration features; Box mutation probes remain within test root and Outlook is never mutated.
- `LIVE_FACTS.json`, `live-environment.md`, readiness matrix and gated decisions reflect the final verified state and timestamp.

## Research
Distilled 2026-07-12 from the operator request and observed ticket/registry drift.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
- [Code-derived gate inventory, 2026-07-20](./evidence/code-derived-gate-inventory-2026-07-20.md) —
  superseded same-day by a live readback; kept for its code citations. See its updated banner.
- [Feature gates, plain language](../../../operations/feature-gates.md) — every gate defined in depth,
  live state as of 2026-07-20, and the implications of enabled/disabled for a non-engineer.

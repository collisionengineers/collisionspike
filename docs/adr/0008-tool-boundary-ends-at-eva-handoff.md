# ADR-0008 — Product responsibility ends at EVA handoff and Archive filing

**Status:** Accepted (2026-06-17).

## Decision

The product owns intake, case assembly, parsing, enrichment, review, readiness, EVA handoff, and Archive
filing. Engineer assessment, report authoring, and return of the finished report are outside its scope.

## Rationale

The product should solve the case-preparation bottleneck without duplicating the specialist assessment
system or changing the engineers' report process.

## Consequences

Readiness and handoff outcomes are terminal product milestones, but the system may retain later inbound
mail for audit, linking, or retroactive reconstruction.

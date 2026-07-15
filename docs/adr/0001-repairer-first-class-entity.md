# ADR-0001 — Repairer is a first-class entity

**Status:** Accepted (2026-06-17).

## Decision

Model a Repairer as a reusable directory entity with name, full address, contacts, and figures status.
Work Providers and Repairers have a many-to-many relationship. A Case's inspection address may reference
a Repairer or contain an approved ad-hoc address or `Image Based Assessment` decision.

## Rationale

Repairers recur across providers and cases. Their contacts and figures policy need a stable identity for
reuse, chasing, and audit. Treating the repairer as a label on each address would duplicate facts and lose
the provider relationships.

## Consequences

The model requires a directory table and joins, but preserves business identity and allows address/contact
updates without rewriting historical evidence.

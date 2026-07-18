# ADR-0004 — Parsing is an inline service boundary

**Status:** Accepted (2026-06-17); clarified 2026-07-16 per [Review 160726](../reviews/160726/decisions.md); extended by [ADR-0018](./0018-cedocumentmapper-dual-target-vendored-engine.md).

## Decision

Run the deterministic document parser as a focused Azure Function service and invoke it during intake.
It returns the versioned extracted record and settled EVA fields for staff review. The parser remains a
separate boundary from the Data API and orchestration service. The same boundary is also invoked during
retroactive case reconstruction ([ADR-0022](./0022-retroactive-case-reconstruction.md)).

## Rationale

Document extraction is core product value and must be exercised in the real intake path rather than by
manual import. A bounded service isolates Python/document dependencies and gives every caller the same
contract.

## Consequences

The service must be idempotent, fixture-driven, observable, and tolerant of a redundant base64 layer at
its input boundary. It never treats extracted values as automatically authoritative over staff or source
evidence.

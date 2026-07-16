# ADR-0025 — AI surfaces share one environment-free capability registry

**Status:** Proposed (2026-07-07); implementation exists in `packages/domain`.

## Decision

Define each AI-visible capability once in the domain package with name, kind, title, description, safety
flags, minimum role, gate label, input schema, derived JSON Schema, and optional route. The registry
describes what a capability is; adapters own execution and environment checks.

Runtime validation schemas are the source for model-facing parameter schemas. Invariants require that:

- destructive capabilities are human-only;
- agent-visible capabilities are read-only, non-destructive, and not human-only;
- write capabilities point to an existing route;
- case status is not directly set by an AI capability;
- all consumers use the same VRM canonicalizer.

## Rationale

Duplicating tool names, schemas, and safety flags between the in-app assistant and MCP would drift and
could expose an unsafe or malformed capability.

## Consequences

Adding or changing a capability updates both surfaces and their invariant tests. The registry is not an
authorization boundary; the Data API remains the enforcer.

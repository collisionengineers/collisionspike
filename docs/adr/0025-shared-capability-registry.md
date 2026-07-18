# ADR-0025 — AI surfaces share one environment-free capability registry

**Status:** Accepted 2026-07-16 per [Review 160726](../reviews/160726/decisions.md).

## Decision

Define each AI-visible capability once in the domain package with name, kind, title, description, safety
flags, minimum role, gate label, input schema, derived JSON Schema, and optional route. The registry
describes what a capability is; adapters own execution and environment checks.

Runtime validation schemas are the source for model-facing parameter schemas. The invariants govern the
**delegated staff surface** (the in-app assistant and staff-authorized MCP clients); app-only lanes are
governed by [ADR-0023](./0023-mcp-server-hosting-and-auth.md)'s tiered model. They require that:

- destructive capabilities are human-only by default, and are promoted only by explicit registry change once proven safe;
- capabilities visible to delegated agents are non-destructive and carry their gate and safeguards in
  the registry;
- write capabilities point to an existing route;
- case status is not directly set by an AI capability;
- all consumers use the same VRM canonicalizer.

## Rationale

Duplicating tool names, schemas, and safety flags between the in-app assistant and MCP would drift and
could expose an unsafe or malformed capability.

## Consequences

Adding or changing a capability updates both surfaces and their invariant tests. The registry is not an
authorization boundary; the Data API remains the enforcer.

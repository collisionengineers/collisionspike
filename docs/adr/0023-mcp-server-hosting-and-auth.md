# ADR-0023 — MCP is hosted with the Data API and read-only first

**Status:** Proposed (2026-07-07); read-only implementation exists.

## Decision

Host the MCP Streamable HTTP endpoint with the Data API so it uses the same audience validation,
application roles, row-level context, capability registry, and audit surface.

Interactive clients use delegated staff authorization and receive only agent-visible read capabilities.
Unknown, write, destructive, and human-only capabilities are rejected before execution and again at the
Data API boundary.

Autonomous app-only agents are a separate future authorization model. They cannot borrow a user identity.
Any future write requires an explicit agent role, per-capability authorization, a single-use signed commit
token, optimistic concurrency, and agent-specific audit identity. None of those conditions is implied by
the read-only endpoint.

## Rationale

A separate service would duplicate authorization and could present a token for the wrong audience. The
Data API is the enforceable boundary; a tool-list filter alone is not security.

## Consequences

MCP shares Data API availability and scaling. The capability registry remains descriptive while route
authorization remains authoritative.

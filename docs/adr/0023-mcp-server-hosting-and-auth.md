# ADR-0023 — MCP is hosted with the Data API under a tiered access model

**Status:** Accepted 2026-07-16 per [Review 160726](../reviews/160726/decisions.md); rewritten from the read-only-first draft.

## Decision

Host the MCP Streamable HTTP endpoint with the Data API so it uses the same audience validation,
application roles, row-level context, capability registry, and audit surface. Access is tiered:

- **Read tier.** Interactive clients use delegated staff authorization and receive agent-visible read
  capabilities. Unknown, destructive, and human-only capabilities are rejected before execution and
  again at the Data API boundary.
- **Write tier — per capability, gated.** A write capability ships only with its own safeguards, named
  in the capability registry, and behind a deployment gate. The shipped image-ingest lane (TKT-154) is
  the model: an idempotency key, registration resolution, a pinned test root, and the capability gates.
  Each further write capability earns its own safeguards; none inherits another's.
- **Autonomous tier — future.** App-only agents are a separate authorization model. They cannot borrow
  a user identity. Nothing in the delegated tiers implies this tier exists.

The provider machine-to-machine API ([ADR-0020](./0020-provider-api-intake-channel.md)) is a
deliberately **separate surface** with separate authentication; MCP capabilities and provider intake
never share a lane. The intended write-tier expansion pattern is the network-drive attach channel of
[ADR-0007](./0007-receipt-of-images.md) (not built).

## Rationale

A separate service would duplicate authorization and could present a token for the wrong audience. The
Data API is the enforceable boundary; a tool-list filter alone is not security. The original
signed-commit-token design was superseded by the shipped per-capability safeguard model, which achieves
the same end — no unaudited, unconfirmed mutation — with mechanisms that actually exist.

## Consequences

MCP shares Data API availability and scaling. The capability registry remains descriptive while route
authorization remains authoritative. The current MCP surface is described in
[MCP image ingestion](../architecture/mcp-image-ingestion.md) and [integrations](../architecture/integrations.md).

# ADR-0023 — MCP server hosting + auth (read-only first; Data-API-enforced agent roles)

**Status:** Proposed (2026-07-07 — read-only MCP built DARK behind `MCP_SERVER_ENABLED`; realised by
[TKT-110](../tickets/verify/TKT-110-mcp-readonly-server/TKT-110-mcp-readonly-server.md), under
[PLAN-001](../tickets/plans/PLAN-001-ai-mcp-hardening.md)). All gates default off; live values belong to
the registry ([live-environment.md](../architecture/live-environment.md)), never this file.

## Context

PLAN-001 asks that an AI — the in-app assistant **and external agents** — be able to do the jobs a
human can. External agents reach the system over the **Model Context Protocol (MCP)**. The naive form
(an MCP server with its own Entra app-registration that forwards its own bearer to `cespk-api-dev`, and
performs writes on an agent's behalf) is unbuildable/unsafe as-is:

- **Authorization is enforced at the Data API**, by `withRole`, which only understands
  `CollisionSpike.User` / `.Superuser`. An MCP-own-app-reg bearer **fails the API audience check**;
  a token minted for a different app-reg is rejected (correctly) as a foreign audience.
- **OBO (On-Behalf-Of) is impossible for an autonomous agent** — there is no user to delegate for.
- MCP-layer "write guardrails" are **cosmetic**: the enforcer is the Data API, not the MCP process.

## Decision

1. **Host the MCP server ON the existing `cespk-api-dev` Function App** as a stateless
   Streamable-HTTP (JSON-RPC 2.0) route `POST /api/mcp` — **not** a Container App / ACR for the spike
   (`minReplicas:0` reintroduces cold-start; `:1` burns Free-Trial credit/quota). Revisit post-PAYG
   under load.
2. **Ship READ-ONLY first.** The MCP surface exposes **only** the shared capability registry's
   agent-visible READ capabilities (read, not `humanOnly`, not `destructive` — ADR-0025). `tools/call`
   refuses any write/destructive/unknown tool **without executing it** (defence in depth alongside the
   registry filter). The executor is the SAME SELECT-only read dispatch the in-app assistant uses;
   reads run RLS-scoped as `staff`.
3. **Two auth flows, documented separately:**
   - **Flow A (near-term, shipping)** — interactive MCP clients (Claude Desktop/API) via OAuth
     Auth-Code + PKCE, a **delegated staff user**. The token carries a real `oid` + `scp`, so the MCP
     route wraps `withRole('CollisionSpike.User')` and authorization is enforced at the Data API exactly
     like every other route. A foreign-app-reg / wrong-audience / unauthenticated token **fails closed
     (401)**.
   - **Flow B (deferred, Phase 3b)** — autonomous **client-credentials** agents (app-only `roles`, no
     user, OBO impossible). An agent principal carries the `CollisionSpike.Agent` app-role and **no user
     identity**; the Data API tells it from a human via `isAgentPrincipal`.
4. **Agent authorization is DESIGNED here as the write prerequisite (not shipped):** the pure
   `authorizeAgentCapability` in `api/src/lib/auth.ts` enforces that an agent may invoke **only
   non-destructive, non-`humanOnly` READ** capabilities — every write and every destructive/humanOnly
   capability is rejected for an agent. Autonomous agent WRITES additionally require a **KeyVault-signed
   commit token** (single-use `jti`/nonce; the **Data API** — not just MCP — verifies) + ETag optimistic
   concurrency, and stamp the agent SP identity + `autonomous:true` into a dedicated audit action
   (`agent_read`/`agent_write`, reserved in `AUDIT_ACTION`). None of this is wired to a live write route.

## Consequences

- The read-only MCP is genuinely useful and safe today: no new authorization surface, no OBO, no foreign
  audience. It flips live only once the operator creates the **MCP Entra app-registration** (delegated
  scopes for Flow A) and sets `MCP_SERVER_ENABLED=true`.
- Autonomous agent writes are a **separate, later rung** behind a designed bar (agent-authz impl +
  signed-commit token + ETag + per-agent SP program). We do NOT ship a half-safe agent write path.
- Hosting on the Function App means MCP shares the API's cold-start/scale characteristics; a Container
  App is the documented scale path, deferred until load justifies it post-PAYG.

## Operator asks

- Create the MCP **Entra app-registration** (Flow A delegated scopes; Flow B app-roles for later).
- Per-agent SP provisioning program (Flow B) — only one staff principal is app-role-assigned today.
- Flip `MCP_SERVER_ENABLED` after the app-reg exists; record it in the registry (bump `lastVerified`).

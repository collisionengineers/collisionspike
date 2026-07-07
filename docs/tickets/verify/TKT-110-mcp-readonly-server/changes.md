# Changes — TKT-110: Read-only MCP server for external agents

## Status
verify — built DARK behind `MCP_SERVER_ENABLED` (default off, route 404s dark); code-complete + tested
offline, not yet deployed. Under [PLAN-001](../../plans/PLAN-001-ai-mcp-hardening.md) Phase 3; ADR-0023.

## Commits
- `3f7ffc7` — ai: PLAN-001 Phase 3 — read-only MCP server + agent-authz design.

## Files touched
- `api/src/functions/mcp.ts` (+ `mcp.test.ts`) — `POST /api/mcp` (JSON-RPC 2.0 / Streamable-HTTP) hosted on
  `cespk-api-dev`; `handleMcpMessage` handles initialize / tools/list / tools/call / ping / notifications.
  Exposes **only** `agentCapabilities()` (read ∧ not humanOnly ∧ not destructive); `tools/call` refuses any
  write/destructive/unknown tool **without executing it**. Reuses the assistant's SELECT-only `execTool`.
  Route in `api/src/index.ts`.
- `api/src/lib/auth.ts` (+ `auth-agent.test.ts`) — `AGENT_ROLE` (`CollisionSpike.Agent`),
  `isAgentPrincipal` (app-only, no `scp`/`preferred_username`), `authorizeAgentCapability` (agents →
  non-destructive reads only) — the **designed** write prerequisite bar (not wired to any write route).
- `packages/domain/src/gates.ts` — `MCP_SERVER_ENABLED` gate (default off).

## Summary
A stateless read-only MCP server on the existing Function App lets external agents run the registry's
agent-visible read tools — no Container App, no OBO, no foreign audience. Authorisation stays at the Data
API; the MCP layer only filters. Autonomous agent *writes* are designed (agent-authz + audit codes) but
deliberately not shipped (ADR-0023 Phase 3b).

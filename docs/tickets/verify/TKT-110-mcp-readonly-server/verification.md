# Verification — TKT-110: Read-only MCP server for external agents

## Verdict
TESTED (offline)

## Evidence
- `api/src/functions/mcp.test.ts` — initialize / tools/list / tools/call happy paths; `tools/call` refuses
  a write/unknown tool WITHOUT executing (C1); only agent-visible reads are listed.
- `api/src/lib/auth-agent.test.ts` — `isAgentPrincipal` distinguishes app-only from delegated;
  `authorizeAgentCapability` rejects every write/destructive/humanOnly for an agent.
- `node verify-all.mjs` API gate green.

## Pending / gaps
- Built DARK: `MCP_SERVER_ENABLED` defaults **off** — `POST /api/mcp` 404s until flipped.
- **Not deployed; needs an MCP Entra app-registration.** Live proof (a client connects Flow A, lists +
  calls a read tool; a foreign-app-reg token → 401 [C2]; an agent-role token cannot reach any
  write/destructive route [C1]) is pending the operator app-reg + flip — see
  [docs/gated.md](../../../gated.md) (§F) and ADR-0023 Operator asks.
- Autonomous agent **writes** are out of scope here (ADR-0023 Phase 3b) — the agent-authz is designed, not
  wired to a write route.

## How to re-verify
Offline: `npm --prefix api test`. Live (after app-reg + flip): connect an MCP client (Flow A delegated
staff), `tools/list`, call `lookup_case`; probe a foreign-audience token (expect 401) and an agent-role
token against a write route (expect refusal).

## Verdict update — 2026-07-10 (final sweep, ticket-verifier dispatch; transcribed verbatim)

**PENDING — record update: deployed DARK (the standing "not deployed" is stale), one acceptance half newly live-proven.** `mcpServer` is registered in the live `cespk-api-dev` fn list; `MCP_SERVER_ENABLED` + `route:"mcp"` in the deployed bundle; the gate ABSENT from live app-settings (matching LIVE_FACTS). Fresh probe: unauthenticated `POST /api/mcp` → **401** — live-proves the fail-closed half of acceptance line 2. Nuance (not a bug): changes.md says the route "404s dark", but `mcp.ts:120` wraps the gate in `withRole`, so auth runs first — unauthenticated callers get 401; the gate-404 only shows post-auth. Fail-closed either way. Remaining, operator-gated (gated.md §F6): the MCP Entra app-registration + gate flip; then live Flow A (client lists + calls `lookup_case`), wrong-audience 401, agent-token write-refusal. Verified by: ticket-verifier dispatch, 2026-07-10.

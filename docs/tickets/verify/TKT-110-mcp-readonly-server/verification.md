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

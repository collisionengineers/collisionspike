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

## Verdict update — 2026-07-14 (independent PLAN-005 sweep; transcribed verbatim)

## Verdict

PENDING

## Evidence

1. **Interactive client acceptance:** A 7-day live `AppRequests` query returned five `mcpServer` requests,
   all HTTP 401, and no authenticated HTTP 200 request. Therefore no live `tools/list` or read-only
   `tools/call` has been demonstrated.
2. **Fail-closed acceptance:** Those five live HTTP 401 responses, spanning 2026-07-10 through 2026-07-13,
   prove unauthenticated access fails closed. A wrong-audience token was not independently exercised.
3. **No-write acceptance:** Current source inspection shows `agentCapabilities()` filters to
   `kind === 'read'`, `!humanOnly`, and `!destructive`; `tools/call` independently rejects anything
   outside that set without execution. A focused fresh test could not run because `vitest` is absent from
   this verification worktree, and no authenticated live `tools/list` response exists.

## Pending / gaps

- No assigned staff user has live-proven Auth-Code + PKCE Flow A through the registered MCP client.
- No live `initialize → tools/list → tools/call(lookup_case)` exchange.
- No independently exercised wrong-audience rejection.
- No live write-name refusal using an authenticated MCP session.
- The focused test command failed before collection because the worktree lacks the Vitest executable;
  this is an unread test surface, not a product failure.

## How to re-verify

- Use the existing `CollisionSpike MCP Client` registration unchanged and authenticate an assigned staff
  user through PKCE.
- Call `initialize`, `tools/list`, and one safe read tool such as `lookup_case`.
- Present a wrong-audience token and require HTTP 401.
- With the valid staff token, call a known write name such as `set_on_hold`; require an MCP `isError:true`
  response and confirm no write executed.
- Capture the live response metadata without recording bearer tokens or case-sensitive data.

## Confidence + unread surfaces

High confidence the ticket remains PENDING. Unread surfaces: authenticated MCP protocol response,
wrong-audience behavior, live write-refusal, and fresh executable unit-test results.

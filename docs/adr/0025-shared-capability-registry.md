# ADR-0025 — One shared AI capability registry (env-free descriptors + zod schemas)

**Status:** Proposed (2026-07-07 — built; realised across
[PLAN-001](../tickets/plans/PLAN-001-ai-mcp-hardening.md) Phases 1–3). Lives in `@cs/domain`
(`packages/domain/src/capabilities/`).

## Context

Two AI surfaces need to know "what can an AI do here": the in-app assistant (read tools + the write-tier
`propose_action`) and the read-only MCP server for external agents (ADR-0023). Duplicating the tool
list, the JSON-schemas, and the safety flags across both surfaces guarantees drift — a tool exposed to
agents that shouldn't be, a param schema that no longer matches the DTO, an inconsistent VRM
normalisation.

## Decision

**One env-free / I/O-free descriptor table both surfaces consume**
(`packages/domain/src/capabilities/registry.ts`). A descriptor says WHAT a capability is — never HOW it
executes:

```
{ name, kind:'read'|'write', title, description, destructive, humanOnly,
  gateLabel|null, minRole, inputSchema:Zod, parameters:<derived JSON-schema>, route? }
```

- **zod is the single runtime source** for every capability's input shape
  (`packages/domain/src/capabilities/schemas.ts`); the model-facing `parameters` JSON-schema is
  **derived** from the zod schema via `zod-to-json-schema` at module load — there is no hand-maintained
  JSON schema to drift from. (`zod` + `zod-to-json-schema` added to `@cs/domain`; `ajv` stays for the
  choicesets.)
- **Authorization is enforced at the Data API, never at the registry.** The registry's flags
  (`humanOnly`, `destructive`, `minRole`, `gateLabel`) are advisory inputs to surface filtering and to
  the agent-authz decision (ADR-0023) — never the enforcer. `gateLabel` is a **bare label string**
  resolved by the surface (the registry reads no `process.env`).
- **Invariants baked in** (registry.test.ts): there is **NO `set_case_status`** (the status machine is a
  terminal-locked computed projection); `destructive` ⇒ `humanOnly` (merge/remove are filtered from
  agents AND rejected by the API for agent principals — defence in depth); agent-visible capabilities are
  read-only, never humanOnly, never destructive; write capabilities always carry a `route`.
- **One VRM canonicaliser** (`packages/domain/src/domain/vrm-canon.ts`,
  `canonicalizeVrm = upper + alnum-only`) replaces three divergent copies (the orchestration image
  classifier, the domain `vrm-filter`, and `openVrmTwins`), so a spaced/lower-case registration matches
  the compacted stored mark everywhere.

Two adapters consume it: the in-app **read handler** (the assistant's SELECT-only dispatch, widened by
`ASSISTANT_TOOLSET_V2`) and the MCP **GET-forwarder** (agent-visible reads only).

## Consequences

- Adding a capability is one descriptor + one zod schema + (for a write) an existing route. Both surfaces
  pick it up; the invariant tests keep the safety rules honest.
- The SPA bundle gains `zod` only if it references the registry (Rollup tree-shakes it otherwise); the
  `ConfirmActionCard` does reference descriptors, so zod ships to the browser — an accepted cost.
- The registry is the shared vocabulary the write tier (ADR-0024) and the agent-authz design (ADR-0023)
  both key on; changing a safety flag in one place changes it for every surface.

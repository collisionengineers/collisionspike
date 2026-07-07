# ADR-0024 — Assistant write tier: propose → confirm → execute (the model never writes)

**Status:** Proposed (2026-07-07 — built DARK behind `ASSISTANT_WRITE_TIER_ENABLED`; realised by
[TKT-111](../tickets/verify/TKT-111-assistant-write-tier/TKT-111-assistant-write-tier.md), under
[PLAN-001](../tickets/plans/PLAN-001-ai-mcp-hardening.md)). Gate default off; live flip is
operator-blocked (per-gate E2/G5 sign-off + DPIA — [gated.md](../gated.md)).

## Context

TKT-060's assistant is read-only by construction. PLAN-001 unifies writes: the in-app assistant gains
the ability to CHANGE things. But a language model must never issue a write directly — a hallucinated or
mis-parameterised mutation would corrupt case data, and the model's view of state can be stale or wrong.

## Decision

**A three-step protocol, in-app only:**

1. **Propose.** The model calls a single `propose_action` tool (added to the toolset only when the write
   tier gate is on). It picks a **proposable write capability** (registry `kind:'write'`, not
   `humanOnly` — ADR-0025) + params. The server **validates the params against the capability's zod
   schema** and captures a `ProposedAction` (capability, resolved route, body). This is a NON-write — it
   performs no mutation and grants no authorization.
2. **Confirm.** The SPA renders `ConfirmActionCard`, which **independently RE-FETCHES the target row**
   (never trusting the model's view) and shows the **structured route + params the SPA will POST**
   (never model prose) diffed against the re-fetched state. Destructive/`humanOnly` capabilities
   (`merge_cases`, remove) are **never proposable** — a person performs those directly in the app.
3. **Execute.** Only on an explicit human confirm does the SPA POST to the **existing staff-authorized
   route** (the same route the app already uses), carrying the re-fetched version as an **`If-Match`
   header**. The route enforces **optimistic concurrency**: a stale precondition **409s** rather than
   clobbering a concurrent edit. No `If-Match` (the normal SPA) → the check is skipped (back-compat).

**Deliberately excluded:** `set_case_status` (the status machine is a terminal-locked computed
projection — ADR/contracts; forced status is a separate human-only Superuser feature) and
**AI-driven byte upload** (the model gets NO upload capability; evidence bytes come from the human's file
picker — TKT-068).

## Consequences

- The propose→confirm→execute guarantee is an **in-app** property (a human is in the loop). It does **not**
  transfer to autonomous MCP agents (no human) — which is why agent writes are deferred behind ADR-0023's
  bar, not shipped through this tool.
- Authorization is still enforced at the Data API: the confirmed POST re-authenticates (`withRole`) and
  re-validates independently; the write tier adds no new authorization surface. RLS `app.role=staff`
  and the append-only audit trail are unchanged.
- Every write route can adopt the same `If-Match`/`staleVersion` guard incrementally (the helper is
  reusable); `setOnHold` + the case read carry it first as the reference pair. `caseById` returns the
  case version as an `ETag` so the card can round-trip it.
- The gate flips live only after per-capability DPIA + E2/G5 sign-off. `scrubPii` output is a
  precision-over-recall **pre-scrub**, not "de-identified" — the DPIA must reflect that.

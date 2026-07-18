# 02 — Canonical service routes → PLAN-008

**Status: non-binding working draft. Superseded on distillation.**
Distils into **PLAN-008**. Adopts Plan 0's **T8**; records outcomes as ADR *amendments*, not new ADRs
(except where T8/T9 dictate). Validated against `main` at `de9c3f9d`.

## Problem

The same capability is reachable by more than one route, and the plumbing under those routes is
duplicated. Concretely: two Python-function clients (finding **C**, with the Box facade dup **D** riding
on it); three request lanes in data-api (staff / internal-MSI / BFF proxy) where the proxy re-exposes
parser and location-suggest that orchestration already calls; the outbox-drain pattern stamped out three
times; and the internal MSI surface fanned into 11 registration modules (four under `cases/` alone). None
of this can be safely consolidated until the **trust model** under the internal lane is decided — that is
T8.

## Outcome

One canonical path per capability, one Python-function client built on PLAN-007's primitives, a decided
and documented internal-trust model, and the outbox-drain pattern expressed once.

## Scope — forced order (each step depends on the one before)

1. **Adopt T8 first — decide the internal-trust model.** `service-support.ts`'s `withServiceAuth` accepts
   any valid Entra token with no subject/app-role check. Consolidating 11 internal routes behind an
   undecided trust seam means rebuilding the surface once T8 lands. So T8 is step 1. Its outcome is
   recorded as an amendment to the relevant platform ADR (0028 three-tier topology, from T9) or its own
   ADR — decided inside T8.
2. **One Python-function client (C, D).** Collapse `services/orchestration/src/adapters/functions-client.ts`
   and `services/data-api/src/platform/http/service-client.ts` onto PLAN-007 primitives; move the
   duplicated request/response types into `contracts/` (already a locked structure element in PLAN-006).
   The Box facade wrapper dedup (D) falls out of this.
3. **Consolidate the internal MSI route surface.** The 11 modules behind
   `register-internal-routes.ts` — including the four `cases/` splits (`internal-resolution` /
   `internal-operations` / `internal-maintenance` / `internal-archive-holding`) — reviewed for
   single-caller granularity and consolidated behind the T8-decided wrapper. Inline, don't re-wrap.
4. **Generalise the outbox drain.** The three copies (archive-mirror / provider-archive / box-file-request:
   `*-outbox-routes.ts` + `*-monitor.ts` + the narrow `*-api.ts` adapter) collapse to one drain + a target
   registry. **Waits on T9's ADR-0030** (outbox/generation-counter reliability) so the generalisation
   *amends a decision of record* instead of racing it.
5. **BFF-proxy dedup.** `proxy-routes.ts` re-exposes parser + location-suggest that orchestration also
   reaches. Settle one canonical path per capability once the SPA-transport migration is confirmed
   complete.

## Locked decisions

- **Dark lanes are authority-gated, not dead.** `LIVE_FACTS.json` `safetyGates` /
  `deliberatelyUnavailable` is the authority. The MCP server, MCP image ingestion, sent-items,
  outlook-move, capture, and EVA-submission lanes may be **moved mechanically** during consolidation but a
  gate or handler is **never removed**. The MCP surface itself is out of scope — the AI-realignment axis
  owns it.
- **No behaviour change.** Routes, request/response shapes, auth semantics, and resource names are
  unchanged (PLAN-006 locked invariant + `check:runtime-contract`).

## Proposed tickets (rescan IDs at mint; ~5 + adopted T8)

T8 (adopted, from Plan 0) → then: (1) one Python-function client + shared contract types; (2) internal-MSI
route consolidation; (3) outbox-drain generalisation; (4) BFF-proxy canonicalisation; (5) a route-inventory
guard asserting one registered path per capability (optional, if step-1 findings justify it).

## Dependencies / gates

- **PLAN-007** — the shared primitives the clients and adapters migrate onto.
- **Plan 0 / T8** — the trust decision (step 1) and, for step 4, **T9 / ADR-0030**.

## Risks

- **Dark code mistaken for dead** — the internal-route and BFF sweeps pass directly by the gated lanes.
  Mitigation: the LIVE_FACTS-authority locked decision + the existing gates tests in `verify-all.mjs` as
  the acceptance bar.
- **Consolidating before T8 decides** — mitigated by making T8 the literal first step.
- **Contract-type move ripple** — moving request/response types into `contracts/` touches many imports.
  Mitigation: mechanical, one PR, `check:runtime-contract` as the gate.

## Verification

- `check:runtime-contract` (routes/shapes) + the gates tests (dark lanes intact) + net file/LOC delta per
  PR + full `verify-all.mjs`.
- Drive one representative internal call end-to-end after the client consolidation (the `verify` skill) —
  the two clients wrapping the same Python services must behave identically post-merge.

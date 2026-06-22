# Phase 0 — Foundations

**Goal:** stand up the repo, the typed contracts, the Dataverse schema-as-code, the Code App scaffold,
the env-var feature gates, and the offline verification gate — everything the M1 slice builds on.

**Status:** ✅ **Complete.** Verified by the offline gate (`node verify-all.mjs` → 7/7). See
[../../../CURRENT_STATUS.md](../../../CURRENT_STATUS.md) and [../../../ROADMAP.md](../../../ROADMAP.md) Phase 0.

## Implementation checklist (build order)

1. [x] Repo, requirements, Microsoft-stack research, phased PLAN distilled into `docs/` + PLAN.md
2. [x] ADRs **0001–0011** recorded (`docs/adr/`)
3. [x] Power Apps **Code App** scaffolded (React + Vite + Fluent v9) in `mockup-app/`
4. [x] **Shared contracts** ported as typed TS — EVA payload (12 fields, 6-line address), case-status state machine, image-rules
5. [x] **Domain logic** in typed TS — classification, ADR-0010 dedup ladder, provider-match, address-policy
6. [x] **Data seam** — mock↔Dataverse swap + field adapter (app shows real rows only)
7. [x] **Dataverse schema-as-code** authored (`dataverse/`) + parity test
8. [x] **Env-var feature gates** defined
9. [x] **Offline verification gate** green — `verify-all.mjs` (7 gates)
10. [x] **Boundary-compliance gates** authored — no live calls in the app; no secret values; all flows `off`

## Plans in this phase

- [phase-0-foundations-orchestrated-build.md](./phase-0-foundations-orchestrated-build.md) — the orchestrated multi-agent build. **Executed.**
- [code-audit-cleanup.md](./code-audit-cleanup.md) — read-only quality/boundary audit. _Findings_; also feeds **Phase 6** (see [../phase-6-handoff/README.md](../phase-6-handoff/README.md)).

## Needs the operator

The audit's **committed parser function key** (rotation) is logged in [../../gated.md](../../gated.md)
(soft blocker). Nothing else here is gated.

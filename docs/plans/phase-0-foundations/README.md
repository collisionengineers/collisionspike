# Phase 0 — Foundations

**Goal:** stand up the repo, the typed contracts, the Dataverse schema-as-code, the Code App scaffold,
the env-var feature gates, and the offline verification gate — everything the M1 slice builds on.

**Status:** ✅ **Complete.** Verified by the offline gate (`node verify-all.mjs` → **all gates green**;
the gate count grew past the original 7 as later phases landed — it now also runs the Code App
tsc+vite+vitest, Dataverse parity, the flow linter, a pytest loop over every built Function suite
(parser/enrichment/evasentry/evavalidation + location-suggest/box-webhook/ocr, the last three SKIP
without a local `.venv`), and **two static gates** — the `uploadFileToRecord` regen guard and the new
boundary grep-gate). See [../../../CURRENT_STATUS.md](../../../CURRENT_STATUS.md) and
[../../../ROADMAP.md](../../../ROADMAP.md) Phase 0.

## Implementation checklist (build order)

1. [x] Repo, requirements, Microsoft-stack research, phased PLAN distilled into `docs/` + PLAN.md
2. [x] ADRs **0001–0011** recorded (`docs/adr/`)
3. [x] Power Apps **Code App** scaffolded (React + Vite + Fluent v9) in `mockup-app/`
4. [x] **Shared contracts** ported as typed TS — EVA payload (12 fields, 6-line address), case-status state machine, image-rules
5. [x] **Domain logic** in typed TS — classification, ADR-0010 dedup ladder, provider-match, address-policy
6. [x] **Data seam** — mock↔Dataverse swap + field adapter (app shows real rows only)
7. [x] **Dataverse schema-as-code** authored (`dataverse/`) + parity test
8. [x] **Env-var feature gates** defined
9. [x] **Offline verification gate** green — `verify-all.mjs` (**all gates green**; began at 7, now runs more — Code App build+vitest, Dataverse parity, flow linter, the per-Function pytest loop, and two static gates incl. the boundary grep-gate)
10. [x] **Boundary-compliance gates** authored — no live calls in the app; no secret values; all flows `off`

## Plans in this phase

- [phase-0-foundations-orchestrated-build.md](./phase-0-foundations-orchestrated-build.md) — the orchestrated multi-agent build. **Executed.**
- [code-audit-cleanup.md](./code-audit-cleanup.md) — read-only quality/boundary audit. _Findings_; also feeds **Phase 6** (see [../phase-6-handoff/README.md](../phase-6-handoff/README.md)).

## Needs the operator

The audit's **committed parser function key** needs **rotation** in Azure (the literal is in git
history, so a doc-scrub alone is not enough). It is tracked in [../../gated.md](../../gated.md) §7
(soft blocker) and in `OPEN_ITEMS.md` (Phase 1a). The committed copy in
`docs/activation/email-intake-activation.md` was **scrubbed 2026-06-24** to `<set at activation>`.
Nothing else here is gated.

---
name: plan-001-vision-family-built-dark
description: 2026-07-08 — PLAN-001 Phase-4 vision family (TKT-015/016/017/068) built dark on user instruction despite gated.md deferral; build-dark→verify pattern
metadata: 
  node_type: memory
  type: project
  originSessionId: f24c65d8-ff11-443d-918c-b405b351333f
---

On 2026-07-08 the user ran `/ticket-orchestrate` over `docs/tickets/next/` and, when shown that two of
the four were operator/DPIA-blocked, chose **"build all four now"**. So the PLAN-001 Phase-4 vision family
was built on branch `feat/plan-001-vision-family`:

- **TKT-017** reg-OCR benchmark → **done** (research/bench, offline-only acceptance; recommendation = local
  `fast-alpr` primary / DI Read uksouth fallback — no VLM egress justified for reg-OCR alone).
- **TKT-016** image-analysis producer → **verify** (`IMAGE_ANALYSIS_ENABLED`, default off). Additive,
  **suggestion-only** — only ever `INSERT INTO ai_suggestion`; deliberately does NOT touch the live TKT-064
  auto-writer (`orchestration/src/lib/image-classify.ts`) so it adds no collision ahead of the blocked
  TKT-088/112 reconciliation.
- **TKT-015** generic `callModelForSuggestions` (case/damage consumer) → **verify** (`AI_ASSIST_ENABLED`,
  default off). The 3 new kinds (damage_area/severity/accident_summary) have no `promoteAcceptedSuggestion`
  branch → no auto-write even on human accept.
- **TKT-068** assistant attach UX → **verify** (SPA-only; model gets NO upload tool — TKT-060 intact;
  live E2E deferred to deploy).

**Why:** the user wants the full AI family built even though `docs/gated.md §F` marks the vision family
"deliberately deferred / do not build". Reconcile by **building dark**, never flipping.

**How to apply — the build-dark→verify pattern used here (reuse for any DPIA/operator-gated feature):**
build behind a **new default-off gate**, no live flip, no deploy, no DDL apply; prove the acceptance
**offline** under the G5 "AI testing on repo data" allowance; a ticket-verifier returns **TESTED (offline)**
and the ticket **stays in `verify`** (per CLAUDE.md `done` = live/proven). Only a ticket whose acceptance is
inherently offline-only (a research/bench doc like TKT-017) reaches `done`. The live flips remain operator
work: DPIA + capacity + image-egress residency sign-off, the schema delta apply, and the deploy — all in
`gated.md §F`. See [[azure-deploy-toolchain-gotchas]] for the deploy step and [[ticket-orchestration-layer]]
for the dispatch/verify loop.

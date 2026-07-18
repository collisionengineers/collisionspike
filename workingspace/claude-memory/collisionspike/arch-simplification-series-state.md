---
name: arch-simplification-series-state
description: "Architecture-simplification plan series (2026-07-17): drafts in workingspace/architecture-simplification/ (untracked), Plan 0 executed, PLAN-007..011 designed with gates and number reservations"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4bd291cf-bdd6-493a-b943-0651aaa2d8f6
---

Operator commissioned a plan series to reduce duplicated functions, canonicalize routes, and cut
clutter (2026-07-17). State:

- **Drafts authored** at `workingspace/architecture-simplification/` (README + 00–05) — UNTRACKED,
  not yet committed. Operator ruled: draft-series-then-distill (ai-realignment precedent), scope =
  code AND estate, adr-rewrite executes first as Plan 0 (done — see
  [[adr-rewrite-160726-plan-updated]]).
- **Series:** PLAN-007 server-runtime package (kills ~9 IDENTITY_ENDPOINT mint copies; new ADR 0031;
  gated on PLAN-006 TKT-210 reaching verify) → PLAN-008 canonical routes (adopts TKT-245 trust-seam
  as forced step 1; outbox generalisation waits on TKT-246/ADR-0030) ∥ PLAN-009 estate cleanup
  (eval-app retirement gated on TKT-215 done; confirm-then-dispose for valuationbot-mcp + "P2P
  Server"; LIVE_FACTS refresh LAST) → PLAN-011 Python doctrine (after PLAN-009's helper-app
  assessment); PLAN-010 scripts dedup gated on full PLAN-006 close-out.
- **Reservations:** ADR 0026–0030 → TKT-246; ADR 0031 → PLAN-007; PLAN numbers 007–011 claimed by
  this series (ai-realignment will mint its own — coordinate).
- Estate ground truth: `docs/operations/cloud-inventory-2026-07-17.md` (£50.71/mo, 58% AI).

**Why:** the draft tree is invisible to other checkouts until committed, and the gates/reservations
are the anti-collision contract for parallel sessions.
**How to apply:** distill drafts into PLAN-NNN + ticket batches only after Plan 0's branch merges;
respect the depends-on gates; rescan TKT/ADR/PLAN numbers at every mint.

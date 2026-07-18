---
name: capture-server-exists-tkt200
description: "The guided-capture server ALREADY EXISTS in collisionspike main (TKT-200, dark); collisioncapture plan/board docs are stale on this — always check spike TKT-200 before planning capture server work"
metadata: 
  node_type: memory
  type: project
  originSessionId: e3ce1bd6-d89c-45fa-86d8-6ccdcaa28af8
---

The CollisionSpike guided-capture server is NOT greenfield: TKT-200 (docs/tickets/now/TKT-200-guided-capture-sessions/) landed all 10 contracted routes, schema (196_capture_session.sql), capture-auth/plans/cleanup, staff SPA panel and offline suites via PR #83 → PR #100, deployed DARK 2026-07-16 (LIVE_FACTS safetyGates publicCapture=false). collisioncapture's FULL_SYSTEM_IMPLEMENTATION_PLAN.md and CCAP-006..010 tickets still say "not started" and cite the pre-reset `api/` layout — both stale. The canonical spec lives at collisionspike `contracts/capture.v1.yaml` (not `api/openapi/`).

**Why:** Two sessions independently nearly re-implemented an already-deployed server because the capture-repo docs weren't reconciled after the spike PLAN-006 reset.

**How to apply:** Before any capture "server" work, diff against spike TKT-200's changes.md/verification.md and the actual `services/data-api/src/features/cases/capture*.ts`; treat CCAP-006..015 as acceptance checklists to reconcile, not build orders. See [[capture-hardening-2026-07-16]] for what was completed on top.

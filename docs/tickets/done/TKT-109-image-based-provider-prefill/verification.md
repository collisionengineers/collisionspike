# Verification — TKT-109: Pre-fill image-based inspections for image-led providers

## Verdict
PENDING

## Evidence
(implementer-gathered, 2026-07-08 — awaiting the independent verifier)
- Mechanism + seams: changes.md (this ticket); live proof shared with TKT-129
  ([A.QDOS26029 screenshot](../../now/TKT-129-image-based-inspection-done/evidence/aqdos26029-case-page-live-2026-07-08.png),
  [delta output](../../now/TKT-129-image-based-inspection-done/evidence/delta-apply-output-2026-07-08.txt)).
- Unit tests: `api/src/lib/inspection-prefill.test.ts` (applicability matrix, guarded fill,
  audit/provenance, race-lost no-op).

## Pending / gaps
- Independent verifier pass.
- "Pre-fill on applicable NEW cases" not yet observed on a fresh live intake (the seams are wired
  into createCase + the intake statusEvaluate path; existing cases were converged by the delta) —
  verify on the next real QDOS/PCH/AX/SBL intake.

## How to re-verify
1. Create a manual case for QDOS (or await a live intake) → the inspection field arrives populated
   "Image Based Assessment" with an `inspection_override` audit row carrying
   "Provider policy: image-based assessment".
2. Change it to a physical address as staff → sticks; the prefill never re-fires.
3. A `prefer_address` provider's case still starts blank (manual flow preserved).

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. The runtime seam fired on a FRESH live intake: QDOS26070 (Email auto, created 09/07/2026 01:04, post-delta) arrived with the System audit entry "Inspection recorded as Image Based Assessment (provider policy)" and readiness satisfied — closing the implementer's own "not yet observed on a fresh intake" gap. Auditable (Action-logs entry + lastActivity lines) + staff-changeable (full picker renders). Non-policy provider FW26008 keeps the manual flow (field empty, Decision: Undecided, no policy note; none of 6 FW review-queue cases prefilled). Registry cross-checked, no contradiction.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.

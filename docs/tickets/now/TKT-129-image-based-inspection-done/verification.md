# Verification — TKT-129: Image-based providers: inspection field must auto-complete as Done + fix the inverted wording

## Verdict
PENDING

## Evidence
(implementer-gathered, 2026-07-08 — awaiting the independent verifier)
- A.QDOS26029 on the deployed SPA: inspection field = "Image Based Assessment", readiness item
  "Inspection: Image Based Assessment" ✓ Done, no manual entry —
  [evidence/aqdos26029-case-page-live-2026-07-08.png](./evidence/aqdos26029-case-page-live-2026-07-08.png)
- Delta apply output (seed no-op + 224 prefilled + provenance) —
  [evidence/delta-apply-output-2026-07-08.txt](./evidence/delta-apply-output-2026-07-08.txt)
- Counts + ADR-0013 amendment: changes.md.

## Pending / gaps
- Independent verifier pass.
- Staff override (physical address over a prefilled IBA) not live-clicked (unit-tested guard only).
- The corrected note's rendered wording not screenshotted (Address tab) — verify on any QDOS case.

## How to re-verify
1. Open any QDOS case on the deployed SPA → Fields/readiness: inspection shows "Image Based
   Assessment" + Done; Address tab shows the corrected (non-inverted) note.
2. `SELECT eva_inspection_address, inspection_decision_code FROM case_ c JOIN work_provider w ON
   w.id=c.work_provider_id WHERE w.inspection_location_policy_code=100000000 AND c.status_code NOT IN
   (100000008,100000009,100000010,100000011)` → no empty-and-undecided rows.
3. Audit trail: `audit_event` rows `action_code=100000018` with reason "Provider policy: image-based
   assessment".
4. Override: pick a physical address on a prefilled case → value replaced, decision `manual`, and the
   prefill does not re-fire.

# Verification — TKT-028: work_provider not populating on intake
## Verdict
NOT YET IMPLEMENTED
## Evidence
Repro material in evidence/ (operator-note.md naming KV64EHB / QDOS26001 / QDOS).
No build yet.
## Pending / gaps
- MAY ALREADY BE RESOLVED: the 2026-06-30 live e2e showed QDOS26001 populating
  work_provider_id correctly. Reproduce the operator's exact example first; only
  build if it still fails.
- If still failing, locate where a detected provider match fails to write to
  work_provider / work_provider_id.
- Note (per memory): classification/VRM/Case-PO are computed once at intake and
  fixes are not retroactive — re-intake to validate, don't inspect old rows.
## How to re-verify (once built / when checking)
Re-intake the operator's example and confirm work_provider (work_provider_id)
populates for QDOS, while an intermediary (Connexus, TKT-021) still correctly does
not match.

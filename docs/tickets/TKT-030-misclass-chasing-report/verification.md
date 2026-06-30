# Verification — TKT-030: Report-chaser misclassified as new work

## Verdict
NOT YET IMPLEMENTED

## Evidence
Repro email(s) in evidence/ (RE 30143 - Mussie Belay  -  BX67OEY  .eml). No build yet.

## Pending / gaps
Classifier must score only the newest received message segment, not the full quoted chain (the likely cause of the new-work false-positive), plus a "report-chaser on existing job" signal that routes RE-prefixed chases referencing an existing case to a query/follow-up category.

## How to re-verify (once built)
Re-intake the sample RE 30143 - Mussie Belay - BX67OEY .eml; confirm it routes to a query / follow-up category, NOT new work, and that classification ignored the quoted chain history.

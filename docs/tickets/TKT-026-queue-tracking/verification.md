# Verification — TKT-026: Queue counts don't match the actual queues
## Verdict
NOT YET IMPLEMENTED
## Evidence
Repro material in evidence/ (operator-note.md; 1.png of the queue-count mismatch).
No build yet.
## Pending / gaps
- Identify where queue counts are computed vs where queue lists are populated.
- Find the divergence (status→queue mapping, double-count, missed cases).
## How to re-verify (once built)
For each queue, confirm the displayed count equals the number of cases listed in
that queue, with no double-counted or missing cases, after moving cases between
statuses.

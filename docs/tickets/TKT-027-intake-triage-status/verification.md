# Verification — TKT-027: Intermediate intake status beyond 'new'
## Verdict
NOT YET IMPLEMENTED
## Evidence
Repro material in evidence/ (operator-note.md; 1.png showing everything at "new").
No build yet.
## Pending / gaps
- Map the requested status onto the documented status machine (avoid a parallel set).
- Decide the automatic transition point at ingestion and the board/queue rendering.
## How to re-verify (once built)
Ingest a case and confirm it moves automatically from "new" to the intermediate
"added to intake" status, and that the board/queues show the distinct status.

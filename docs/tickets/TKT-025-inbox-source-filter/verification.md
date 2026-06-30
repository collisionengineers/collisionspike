# Verification — TKT-025: Mark + filter inbox by source mailbox (info/engineers/desk)
## Verdict
NOT YET IMPLEMENTED
## Evidence
Repro material in evidence/ (operator-note.md). No build yet.
## Pending / gaps
- Confirm the source mailbox is persisted per intake item and exposed by the API.
- Decide the marker design and the filter control placement.
- Source the mailbox list from the live registry, not a hard-coded list.
## How to re-verify (once built)
View the inbox: confirm each item shows a distinguishable source-mailbox marker and
that the filter restricts to a chosen source and back to all.

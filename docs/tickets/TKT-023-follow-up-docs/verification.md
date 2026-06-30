# Verification — TKT-023: Link follow-up documents/emails to the existing case + Box
## Verdict
NOT YET IMPLEMENTED
## Evidence
Repro material in evidence/ (operator-note.md; sent/ outgoing request 575985.eml;
original/ incoming reply Our ref 576299.eml + 16DL.pdf + 16DL diminution PDF).
No build yet.
## Pending / gaps
- Define the reply/follow-up correlation signal (headers, "Our ref", thread match).
- Define attach-to-existing-case + Box-push behaviour and the chaser-satisfied update.
- Define the low-confidence review fallback.
## How to re-verify (once built)
Replay the outgoing request then the incoming reply: confirm the reply attaches to
the existing case (no duplicate), the documents land in the case evidence and the
case Box folder, and the outstanding-document chaser is cleared.

# Verification — TKT-021: Resolve Connexus claims-manager to the real provider (PCH/SBL)
## Verdict
NOT YET IMPLEMENTED
## Evidence
Repro material in evidence/ (operator-note.md). No build yet.
## Pending / gaps
- Decide how Connexus is represented in the provider corpus (intermediary class).
- Define the PCH-vs-SBL resolution signal in email body / attachment.
- Define the held-for-review behaviour when the principal cannot be resolved.
## How to re-verify (once built)
Re-intake a real Connexus email: confirm it is not flagged as a new
enquiry/customer, that PCH-on-behalf resolves to PCH and SBL-on-behalf resolves
to SBL, and that an ambiguous one is held for review with an unresolved-principal
reason.

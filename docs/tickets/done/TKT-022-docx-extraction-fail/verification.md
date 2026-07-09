# Verification — TKT-022: .docx claim-form extraction fails
## Verdict
NOT YET IMPLEMENTED
## Evidence
Repro material in evidence/ (A Cheema Claim Form docx.docx; 1.png header VRM/colour
leak; 2.png garbled Work Provider/Claimant/Vehicle fields; 3.png Accident
Circumstances overflow + empty required Inspection Address / Date of Instruction).
No build yet.
## Pending / gaps
- Confirm whether .docx is handled at all by the current vendored parser path.
- Define the field-segmentation fix for the structured claim-form layout.
- Decide where the fix lands (cedocumentmapper_v2.0 sibling vs parser Function).
## How to re-verify (once built)
Re-ingest the sample .docx and confirm Work Provider, Claimant Name, Claimant
Email, Vehicle Model, and Accident Circumstances each populate from the correct
source field with no cross-field overflow.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. Live POST /api/parse on the ACTUAL Cheema .docx: every previously-garbled field now correct (SN67USB via cdq_vrm; TOYOT AURIS not "and colour MINI-RED"; real claimant name/email with no leading dash; the true narrative with no questionnaire text; incident date + inspection address extracted); absent-at-source fields return honest empties with staff warnings; work_provider deliberately suppressed (template name can't masquerade — sender-context fills at intake). Fixture byte-identical to the evidence sample; sibling suite 383 pass; drift guard 7 pass; the live TKT-050 AX probe proves no email/PDF regression.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.

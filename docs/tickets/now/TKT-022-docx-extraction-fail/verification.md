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

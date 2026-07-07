# Verification — TKT-024: Image-only new-case form (drop instruction-only fields)
## Verdict
NOT YET IMPLEMENTED
## Evidence
Repro material in evidence/ (operator-note.md; 1.png, 2.png, 3.png, 4.png of the
current new-case form). No build yet.
## Pending / gaps
- Decide remove-vs-hide-vs-optional per field (note allows both for some).
- Confirm Received On default-to-today and automatic intake status.
- Confirm this is a distinct variant from "image based assessment".
## How to re-verify (once built)
Open the image-only new-case flow: confirm only Received From, Received On (today),
Vehicle Details and Location are required, instruction-only fields are absent/not
required, and a case can be created from images alone.

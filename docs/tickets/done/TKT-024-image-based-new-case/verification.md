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

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. Live: the "Images only (no instructions yet)" variant renders exactly the kept field set (VRM/Received from/Received on(defaulted today)/Vehicle Model/Location required; Work Provider/Case-PO/Provider Ref/Intake Status/Circumstances/reason/dates ABSENT); the implementer's E2E case TE57IMG independently confirmed (VRM-first identity, no Case/PO, durable intake note "Received from Kwik Repairs (photos by email) on 09/07/2026", audit row). Expected absences: a fresh verifier-created case (mutation) and direct PG reads (firewall). Cosmetic noted: the case-type badge reads Pending until images attach.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.

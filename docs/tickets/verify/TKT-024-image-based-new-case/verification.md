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

## Reopened follow-up verdict — 2026-07-12

PENDING — the Insured-name/layout fix is deployed, but component coverage and a designated-case
creation proof are still required, so the reopened ticket remains `now`.

### Evidence

- Images-only identity request helper returns no provider or insured fields; instruction-led input remains unchanged.
- Images-only keyboard order is claimant name → registration → make → vehicle model → mileage, with no insured-name entry.
- SPA tests: 413/413 passed across 30 files.
- Production SPA build passed.
- The deployed JS/CSS hashes match the reviewed release artifact.
- Signed-in Chrome opened “Images only (no instructions yet)”. The form contained Claimant name,
  Registration, Make, Vehicle model and Mileage in one field group and contained no Insured name.

### Pending

- At supported desktop/narrow widths and 200% zoom, confirm no overflow or clipped validation content.
- Add a rendered component test for field absence, claimant submission/persistence, validation,
  responsive grouping and keyboard order; the current helper/order tests do not satisfy this line.
- Create one designated images-only test case and prove `insuredName` is absent, claimant name persists, and incomplete EVA data leaves the case Not Ready.

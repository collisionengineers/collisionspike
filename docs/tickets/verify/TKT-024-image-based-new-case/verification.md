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

## Independent verification update — 2026-07-14

### Verdict

PENDING

### Evidence

- prior live verification proved the instruction-only controls absent. The July 12 deployed
  release independently confirmed Claimant name, Registration, Make, Vehicle model and Mileage
  grouped together with no Insured name.
- Current source requires Received from, Received on, registration, vehicle model, location and at
  least one image. Claimant name is available but optional; Insured name is absent in images-only
  mode.
- Images-only mode renders no intake-status control; the API derives the resulting status from
  persisted fields and evidence.
- prior live case TE57IMG proved creation without Case/PO or instruction-only data and persisted
  the received-from note. This predates the reopened Insured-name/layout change.
- The deployed July 12 Chrome record confirms no Insured name control. Current rendered tests and
  request-boundary tests prove images-only requests cannot leak `insuredName`, provider, principal or
  provider-reference state.
- The deployed form and current component tests show one Claimant name control. Instruction-led
  request construction still carries insured identity; the images-only helper merely omits it. No
  stored data migration, deletion or remapping exists.
- The deployed release confirms claimant and vehicle identity in one group. Current source uses a
  two-column grid collapsing to one column at narrow breakpoints.
- Images-only creation excludes genuinely unavailable instruction fields, while normal readiness
  still leaves incomplete cases Not Ready.
- Current source contains three rendered ManualIntake tests plus request/order tests covering field
  absence, payload omission, claimant persistence, validation and keyboard order. The recorded suite
  result is 47 files and 506 tests passing.

### Pending / gaps

- Required current desktop, narrow-width and 200%-zoom proof remains absent.
- No artifact proves required markers, validation messages and the full page remain unclipped and
  horizontally overflow-free at 200% zoom.
- No designated post-fix images-only case exists proving claimant persistence, absent insured
  identity and resulting Not Ready/Review placement.
- Current production SPA is the July 12 release. Current `main` contains later ManualIntake changes
  and tests, so exact current-main/live parity is not established.
- Creating a production case was explicitly outside this verification’s authority.

### How to re-verify

1. After deploying the intended current candidate, open Images only at the supported desktop and
   narrow widths.
2. At 200% browser zoom, trigger empty-field validation without creating a case; confirm labels,
   required markers, messages and actions remain visible with no horizontal page overflow.
3. Verify keyboard order: Claimant name → Registration → Make → Vehicle model → Mileage.
4. With explicit operator approval, create one clearly designated images-only test case using natural
   test images and a claimant name, without Insured name or instruction-only data.
5. Read back the submitted request and resulting case: `insuredName` absent, claimant persisted,
   received-from metadata present, evidence attached and incomplete EVA requirements placing it in
   Not Ready.
6. Clean up only through the project’s approved test-case process; do not delete or alter ordinary
   production cases.

### Confidence + unread surfaces

High confidence in field removal, payload boundaries and grouping implementation; low confidence in
the two explicit completion gates. Unread surfaces are current 200%-zoom rendering and a designated
post-fix case with read-back evidence.

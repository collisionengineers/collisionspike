# Changes — TKT-153: Save case edits explicitly as one reviewed change

## Status
Implemented on `codex/tkt-153-explicit-save`; awaiting PR review, deployment and live verification.

## Changes
- Case EVA fields and the inspection choice now form one local edit session. Blur,
  dropdown, calendar and address-choice interactions do not write to the server.
- Added Save changes and Discard changes controls, complete field validation,
  unsaved-change status, browser/route leave protection and an optimistic-concurrency
  reload/reconcile path.
- Replaced the competing inspection-address PATCH plus decision POST with one
  versioned PATCH. The API writes fields, address, decision, readiness, manual
  provenance and one redacted audit entry in one transaction.
- Photo review remains an immediately saved operation and is labelled as such on the
  Evidence tab; registration and Case/PO retain their existing explicit, isolated
  Save/Cancel controls.

## Tests
- `npm test --workspace @cs/domain` — 1,102 passed.
- `npm test --workspace @cs/api` — 620 passed.
- `npm test --workspace mockup-app` — 458 passed.
- Domain, API and SPA production builds passed.

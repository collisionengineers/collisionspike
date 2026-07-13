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
- The readiness calculation now receives the saved inspection decision in that
  transaction, and isolated registration, Case/PO and accepted-suggestion updates
  advance the edit-session baseline/version together so they cannot create a false
  dirty state or stale-save conflict.
- Photo review remains an immediately saved operation and is labelled as such on the
  Evidence tab; registration and Case/PO retain their existing explicit, isolated
  Save/Cancel controls.
- Manual saves update only the newest staff provenance row and retain extracted,
  conflicting and historical source rows. Readiness now selects current-value provenance
  deterministically (reviewed, then staff, then newest) with harmless legacy formatting
  normalisation; unrelated old values cannot make a field appear reviewed.
- Confirmed inspection-address corpus rows are case-disambiguated, so two cases using the
  same address cannot overwrite each other's source note.

## Read-only live compatibility check

The active database was checked before merge. Across all populated EVA fields, there were
zero reviewed provenance rows whose value failed the tolerant current-value comparison and
zero reviewed null-value rows. The stricter deterministic resolver therefore does not
downgrade any currently reviewed live field. The temporary caller-IP database rule was
removed after the read-only query.

## Tests
- `npm test --workspace @cs/domain` — 1,136 passed.
- `npm test --workspace @cs/api` — 629 passed.
- `npm test --workspace mockup-app` — 465 passed.
- Domain, API and SPA production builds passed.

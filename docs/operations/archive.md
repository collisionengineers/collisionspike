# Archive operations

Box is the staff-facing Archive. The live mirror creates one folder per Case/PO, copies source material,
and supports account-free File Requests. PostgreSQL remains the relational authority.

## Invariants

- Writes stay within the configured live mirror root.
- Historical/read-only roots permit list, search, and download only.
- Create/upload operations are idempotent and reuse an existing expected folder/file.
- Incoming events require signature validation, replay-window validation, delivery deduplication, and
  scope validation.
- Automated deletion from the Archive is prohibited.
- A transient-storage purge runs only after the Archive copy is proven complete and recoverability
  controls are enabled.

## Verification

A live Archive test requires explicit write authority. Otherwise limit checks to configuration metadata,
root identity, access posture, and read-only listing. Record folder/file identities in ticket evidence,
not in general architecture pages.

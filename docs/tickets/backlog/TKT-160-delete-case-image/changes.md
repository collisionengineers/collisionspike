# Changes — TKT-160: Delete an individual case image from every active store

## Status
implemented offline; awaiting independent live verification

## Implementation

- `migration/assets/schema/060_evidence.sql`, `205_evidence_deletion.sql`,
  `900_constraints.sql` and the dated delta add the durable deletion intent/tombstone, per-store
  outcomes/lease, evidence marker, guarded finalizer, RLS and replay indexes.
- `api/src/functions/evidence-delete.ts` adds the authenticated per-case image DELETE route with
  wrong-case/kind checks, Archive preflight, intent/audit-before-stores, idempotent Archive/Blob cleanup,
  retryable partial outcomes, guarded finalization and durable status recomputation.
- Evidence review, classification, archive mirroring and case merge now refuse/ignore an image with an
  active deletion marker. Automatic evidence persistence suppresses an exact deleted source replay and
  removes any deterministic copy recreated before the tombstone check; a new identity is still accepted.
- `functions/box-webhook/box_client.py` and `function_app.py` add a file-only validation/deletion route.
  It refreshes read-write scope, verifies the exact direct case-folder parent and rejects read-only,
  sibling or outside-root targets before `DELETE /files/{id}`.
- `mockup-app/src/screens/CaseDetail.tsx` adds an accessible action on every image card, a filename and
  Archive-specific confirmation, mutation-free cancel, progress/error state and **Finish deleting**
  retry. Documents/source rows have no delete action. A successful response removes only that image and
  refreshes the server-recomputed case status.
- Audit actions `image_deletion_requested`, `image_deletion_failed`, and `image_deleted` are registered
  through schema, domain choices, API audit and last-activity mapping. Evidence responses expose only a
  `deletionPending` flag, not internal operation details.
- ADR-0012, ADR-0017, architecture data-model/integration/data-protection text and
  `docs/runbooks/delete-case-image.md` distinguish this staff-confirmed single-file exception from
  prohibited automated retention/disposition deletion.

## Tests added or extended

- Data API: ownership/kind/scope refusal, store ordering, present/missing outcomes, partial failure,
  repeat completion, Box client contract, exact replay suppression and same-byte/new-identity upload.
- Box Function: exact-folder deletion, missing-file idempotency, sibling and read-only-root refusal,
  validation-only GET and DELETE route arguments.
- SPA: filename/source-boundary copy, mutation-free cancel, explicit confirmation, visible retry after
  partial failure, encoded DELETE route, completion result and non-2xx propagation so partial failure
  cannot appear successful.

Live test-folder proof, deployment and the `verify -> done` verdict remain the independent verifier's
work; no production or non-test Archive mutation is performed by this implementation branch.

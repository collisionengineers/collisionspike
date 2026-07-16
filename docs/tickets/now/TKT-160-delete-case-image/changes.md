# Changes — TKT-160: Delete an individual case image from every active store

## Status
deployed dark on 2026-07-16; awaiting designated-test-case verification

Rebased onto post-#83 `main` and merged 2026-07-15 (dark). Review remediation: added the default-off
`DELETE_CASE_IMAGE_ENABLED` gate on the destructive delete route (server + SPA); renumbered the audit
codes to `100000063/64/65` because #83/TKT-200 took 56–62. Deferred follow-ups are listed in
`verification.md` (retry sweeper, the RLS-inert-policy comment fix, Box-trash-vs-Blob-hard-delete
asymmetry, delta/canonical parity).

## Implementation

- `database/baseline/060_evidence.sql`, `database/baseline/205_evidence_deletion.sql`,
  `900_constraints.sql` and the dated delta add the durable deletion intent/tombstone, per-store
  outcomes/lease, evidence marker, guarded finalizer, RLS and per-file replay indexes.
- `services/data-api/src/features/cases/evidence-delete.ts` adds the authenticated per-case image DELETE route with
  wrong-case/kind checks, Archive preflight, intent/audit-before-stores, idempotent Archive/Blob cleanup,
  retryable partial outcomes, safe cancellation/reactivation before any store delete, guarded
  finalization and durable status recomputation.
- Evidence review, classification, archive mirroring and case merge now refuse/ignore an image with an
  active deletion marker. Automatic evidence persistence suppresses an exact deleted Blob-path/Archive-
  file replay and removes any deterministic copy recreated before the tombstone check; a shared email
  Message-ID never suppresses sibling attachments, a cancelled intent never acts as a tombstone, and
  cleanup begins per store only after its durable deleted/missing outcome. A new identity is still accepted.
- `services/functions/box-webhook/box_operations.py` and `function_app.py` add a file-only validation/deletion route.
  It refreshes read-write scope, verifies the exact direct case-folder parent and rejects read-only,
  sibling or outside-root targets before `DELETE /files/{id}`.
- `apps/web/src/shared/ui/ImageDeleteDialog.tsx` and the case-detail evidence/controller modules add an
  accessible action on every image card, a filename and
  Archive-specific confirmation, mutation-free cancel, progress/error state and **Finish deleting**
  retry. An explicit server cancellation clears the pending card state immediately. Documents/source
  rows have no delete action. A successful response removes only that image and refreshes the
  server-recomputed case status.
- Audit actions `image_deletion_requested`, `image_deletion_failed`, and `image_deleted` are registered
  through schema, domain choices, API audit and last-activity mapping. Evidence responses expose only a
  `deletionPending` flag, not internal operation details.
- ADR-0012, ADR-0017, architecture data-model/integration/data-protection text and
  `docs/operations/delete-case-image.md` distinguish this staff-confirmed single-file exception from
  prohibited automated retention/disposition deletion.

## Tests added or extended

- Data API: ownership/kind/scope refusal, store ordering, present/missing outcomes, partial failure,
  truthful finalization failure, scope-change cancellation/reactivation, safe evidence-child FK actions,
  repeat completion, Box client contract, exact per-file replay suppression, sibling Message-ID
  isolation and same-byte/new-identity upload.
- Box Function: exact-folder deletion, missing-file idempotency, sibling and read-only-root refusal,
  validation-only GET and DELETE route arguments.
- SPA: filename/source-boundary copy, mutation-free cancel, explicit confirmation, visible retry after
  partial failure, encoded DELETE route, completion result and non-2xx propagation so partial failure
  cannot appear successful.

The repository-reset review found that the reorg had omitted the existing Box deletion methods from the
new operations mixin. Their reviewed implementation was restored; all 274 Archive-function tests pass,
including the exact-folder and scope-lock suite. Live test-folder proof, deployment and the `now -> verify`
verdict remain the independent verifier's
work. The database, Box façade, API and SPA were later deployed with `DELETE_CASE_IMAGE_ENABLED`
default-off; no production or non-test Archive mutation was performed.

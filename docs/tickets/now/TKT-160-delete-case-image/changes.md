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

## 2026-07-20 — gate flipped live by explicit operator direction (TKT-159 audit)

- A fresh `az functionapp config appsettings list -n cespk-api-dev -g rg-collisionspike-dev` readback
  (operator-run) confirmed the prior default-off state. Current settings were backed up
  (`cespk-api-dev-appsettings-backup-2026-07-20.json`, scratch, not committed) before mutation.
- `DELETE_CASE_IMAGE_ENABLED` was set `true` on `cespk-api-dev` (`az functionapp config appsettings set`),
  confirmed by readback, and the app was confirmed `Running` with 144 registered functions and no new
  5xx/exceptions in the 15 minutes after the settings-change recycle (Flex Consumption recreates on a
  settings change).
- Before flipping, the route's actual scope was re-checked against code: `deleteCaseImage` is gated only
  by `withRole('CollisionSpike.User')` (the standard staff role) with no case-folder restriction in the
  API layer itself — the Box leg is confined to `BOX_ALLOWED_ROOT_ID` (live `392761581105`), but the
  Postgres/Blob legs are not. The operator confirmed `392761581105` is a genuinely separate Box "test
  folder" (verified live via `npx box folders:get 0`), distinct from the real archive root `4077648161`
  ("Collision Engineers") which is not currently written to — i.e. this environment's case data is
  currently all test/dev data, not real customer records.
- **This is only the gate flip.** No live delete was performed and no independent verifier has run the
  designated-test-folder proof in `docs/operations/delete-case-image.md` (SPA-driven cancel→confirm→
  readback→repeat→replay sequence on a chosen test case/image). The verdict in `verification.md` stays
  `PENDING` until that proof runs. `LIVE_FACTS.json.safetyGates.deleteCaseImage` updated with a dated note.

## 2026-07-20 — the claimed SPA action from the paragraph above never actually rendered (found + fixed)

The "accessible action on every image card" claimed in the Implementation section above (lines 29-34)
was **never reachable in the live `apps/web` tree**, despite `DELETE_CASE_IMAGE_ENABLED` being live-on.
Root cause: PR #87 built the real button inside `mockup-app/src/screens/CaseDetail.tsx` (a prototype app
on a branch that forked before `mockup-app` was renamed to `apps/web`, commit `b224c54b`). The
reconciliation merge `bbe20b3e` ported `ImageDeleteDialog.tsx` and `useDeleteCaseImageGate` into
`apps/web`, but had no way to merge the screen-level wiring against a target file (`CaseDetail.tsx`)
that no longer existed in that shape — so the dialog and hook shipped completely orphaned (zero
references outside their own test files). A second feature hit the identical failure mode the same day
(see TKT-200's `changes.md`).

Fixed by wiring the existing (previously-orphaned) pieces into the real screen — no new component or API
behaviour, purely the missing integration:

- `apps/web/src/features/cases/case-detail.controller.tsx` — reads `useDeleteCaseImageGate()` into
  `deleteImageEnabled`; adds `deleteImageTarget`/`deletingImage`/`deleteImageError` state and
  `openDeleteImage`/`cancelDeleteImage`/`confirmDeleteImage` handlers (calls the existing
  `deleteCaseImage(caseId, evidenceId)`, then removes the row from local `imgState` on success).
- `apps/web/src/features/cases/case-detail-cards.tsx` — `EvidenceCard` gains an optional `onDelete`
  prop; the "Delete image" button only renders when a handler is passed (i.e. only while the gate is on).
- `apps/web/src/features/cases/case-detail-main.tsx` — passes `onDelete={deleteImageEnabled ?
  openDeleteImage : undefined}` into each card.
- `apps/web/src/features/cases/case-detail-dialogs.tsx` — renders the existing `ImageDeleteDialog` wired
  to the controller's state/handlers.
- `apps/web/src/data/index.ts` — `useDeleteCaseImageGate` itself was missing from the barrel re-export
  (unlike every other gate hook in the file); added.

Verification (offline only — no live mutation): `tsc --noEmit` clean; full `apps/web` suite **556/556**
passing (`npx vitest run`); production build (`tsc -b --force && vite build`) succeeds. The
designated-test-folder live proof this ticket requires is unchanged and still outstanding — this entry
only fixes the previously-nonexistent UI path, it does not constitute that proof.

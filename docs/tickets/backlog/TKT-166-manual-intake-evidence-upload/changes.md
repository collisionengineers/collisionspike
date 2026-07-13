# Changes — TKT-166: Persist instruction and extra files from Manual Intake

## Status

Implemented and tested offline on `codex/tkt-166-manual-intake-evidence-upload`. The dispatching
loop still owns the ticket-status move, database delta, deployment and independent live verification.

## Commits

- `9be15f2` — make Manual Intake case creation and its source-file batch resumable, target-bound and
  truthful on partial failure.
- `c0f3a82` — reconcile the source-file blocker with the merged canonical readiness contract.
- `51979b1` — pin the locked submission refusal while the source batch remains incomplete.
- `9229ed7` — carry the source-file readiness group through the SPA checklist adapter.
- `3090ca4` — safely reopen a completed binding when a lost response is followed by a changed file
  selection.
- `b00b22c` — close independent-review gaps: reload-safe retry identity, per-file source roles,
  tri-state completion, batch-result audits and truthful recovery controls.
- `53a56df` — close the second independent audit: durable post-create reconciliation, fixed
  instruction identity, strict role validation, one-time response-loss auditing and terminal archive
  recovery.
- `44708d9` — make terminal archive state atomically recompute canonical status and preserve
  earlier-key/content-dedup source failures across changed-selection rebinds.
- `505f7b5` — preserve Manual Intake operation, batch, item and canonical evidence ownership through
  case merges, including the later dead-letter and survivor retry lifecycle.
- `2076979` — semantically rebase over merged TKT-153 so explicit Save retains the source blocker and
  archive recovery advances the dirty draft, persisted baseline and concurrency version together.
- `0ee53b1` — limit terminal archive dead-lettering to Manual Intake-owned evidence so unrelated
  automated evidence keeps retrying, and preserve the archive-failure distinction in recomputation.
- `9fe981e` — transfer the durable upload batch before its items during case merge while keeping
  evidence rebinding ownership-neutral until that ordered transfer.

## Files touched

- `mockup-app/src/screens/ManualIntake.tsx`, `manual-intake-files.ts`,
  `manual-intake-upload.ts`, and `data/rest-client.ts` — the instruction plus every selected extra
  file now uses the canonical staff upload route. The page navigates only after every selected file
  has a confirmed evidence identity; partial/total failure stays on a per-file recovery screen and
  retries the same case.
- `api/src/functions/cases.ts`, `evidence-upload.ts`, `internal.ts`, and
  `lib/manual-intake-operation.ts` — one actor/request-bound case operation survives response loss or
  double submission, binds/rebinds the exact canonical upload retry, records the case-create audit
  once, and keeps source-evidence-incomplete cases Not Ready until the complete batch is confirmed.
- `packages/domain/src/contracts/case-status.ts` and `dto/index.ts` — optional Manual Intake retry
  metadata plus the shared source-evidence readiness blocker.
- `migration/assets/schema/196_manual_intake_case_create.sql`, its additive live delta, and
  `900_constraints.sql` — durable operation ownership, pending-source index, forced RLS and non-delete
  application grants.
- `api/src/functions/archive-mirror-outbox.ts`, its request helper, the TKT-166 delta and
  `mockup-app/src/screens/CaseDetail.tsx` — archive work stops after eight failed attempts, remains a
  Not Ready blocker for Manual Intake source files, and can be explicitly retried from Evidence.
- `docs/azure/deploy.md` — binding rollout order: additive TKT-166 delta, API, then SPA.

## Summary

Document-led Manual Intake no longer creates a case and then merely says its selected files were
linked. A PDF instruction and all JPG/PNG/WebP/PDF extras are uploaded through the TKT-165 contract,
with the instruction persisted as instruction-kind evidence under its original filename and bytes.
The manual picker deliberately no longer advertises Word or email files because the canonical staff
upload route cannot validate those formats safely end to end; automated mailbox parsing retains its
existing format coverage.

The case-create key is independent from the file-batch key. A lost create response returns the same
case and transactionally reconciles any missing field-source rows or notes exactly once. A lost upload
response replays the same evidence identities and writes one distinct recovery audit, and a handler
changing the file selection rebinds the unfinished operation without allocating another Case/PO. The
instruction position is an explicit part of both bindings; recovery never promotes the next PDF after
the chosen instruction is removed. The shared readiness
contract blocks Review while the selected source batch is incomplete. The recovery view names every
outstanding file, preserves already-added identities, and does not navigate automatically. The
single-case response also carries this pending state, so the case-page checklist cannot appear
complete while the persisted status is still Not Ready.

## Offline checks

- Full Domain suite: **1,138 tests passed**.
- Full API suite: **658 tests passed**.
- Full orchestration suite: **417 tests passed**.
- Full SPA suite: **480 tests passed**.
- Production TypeScript builds passed for Domain, API, orchestration and the SPA; the Vite bundle was
  produced successfully.
- `node verify-all.mjs`: **8 passed / 0 failed / 13 expected skips**.
- Postgres parity, documentation links, ticket integrity and shared-skill checks passed.

## Scope boundaries / overlap

- TKT-024 changes the images-only fields and layout in the same `ManualIntake.tsx`; it does not own
  this document/manual source-file transaction. Do not merge its version of that screen over this
  branch: it needs a semantic rebase that preserves the explicit instruction object/index and the
  recovery controls.
- TKT-153 owns explicit saving on an existing case. This change does not turn the New case form into
  a general case editor and does not alter its save contract. Its `CaseDetail.tsx` work must preserve
  the terminal-archive warning/retry action when the branches are integrated.
- TKT-130's merged canonical readiness evaluator remains authoritative. TKT-166 contributes one
  additional source-file check to that evaluator and to the locked submission re-check; it does not
  reintroduce a parallel readiness predicate.
- Archive mirroring and image classification remain the canonical TKT-165 outbox/classifier paths.
  TKT-166 adds terminal state and a staff retry to that same outbox; it does not introduce another
  byte or cleanup lifecycle.

## Independent review follow-up — 2026-07-12

- The case-create and evidence retry keys now survive a same-tab reload in session storage and are
  cleared only after confirmed completion or an intentional fresh-draft reset.
- The multipart contract carries one bound role per selected file. The chosen PDF is persisted as
  the instruction; extra PDFs are persisted as other documents; photos remain classifier-owned
  images. The role and explicit instruction index participate in the operation binding and manifest
  hash. Exact-content dedup refuses a conflicting document role instead of silently promoting an
  earlier extra PDF.
- Manual source completion now returns `completed`, `already_complete` or `not_bound`. A stale/rebound
  operation returns an honest retry state even when every evidence identity exists; it cannot be
  displayed as finished while the source blocker remains.
- Manual Intake writes one controlled batch-result audit for full, partial, refused and recovered
  attempts alongside the existing per-evidence success audits.
- Confirmed files no longer show a remove control in recovery. Outstanding selections remain
  removable, and the add-files label says exactly what the control does.

## Second independent review follow-up — 2026-07-13

- Case creation now commits its field-source rows and intake notes in one marker-guarded transaction.
  An exact create replay repairs a process stop after the case commit without duplicating the case,
  Case/PO, create audit, field-source rows or notes.
- The browser keeps the exact `File` selected as instruction. Removing it leaves the operation without
  an instruction until staff explicitly chooses “Use as instruction”; another PDF is never promoted
  because of its position. Equal filenames and sizes are retained for server-side content hashing.
- The API requires one valid role for every operation-bound file and an exact instruction index when
  an instruction role is present. Missing, multiple, mismatched and stale bindings fail before Blob
  persistence. Browser MIME/extension checks now match the server's contradiction rules.
- An `already_complete` upload claims one durable response-loss audit in the completion transaction;
  later identical replays return the same result without another recovery audit.
- Archive mirror work dead-letters after eight failed attempts and leaves automatic pending pages.
  A terminal failure on a selected Manual Intake source file keeps the case Not Ready with an Evidence
  action that clears the terminal marker, advances the generation and requeues the canonical outbox.

## Fresh audit follow-up — 2026-07-13

- The eighth archive defer now selects and locks the actual attempt/dead-letter fields, writes terminal
  state and advances the case's durable status-recompute generation in the same transaction. A stale
  duplicate defer observes the terminal marker and cannot increment attempts or enqueue another
  recompute. The canonical recompute regression proves a stale Review case becomes Not Ready.
- Manual source archive readiness no longer derives from the operation row's current upload key.
  It joins every `manual_intake` upload item for the case to its persisted evidence identity and outbox
  row. This includes prior keys after changed-selection rebind and evidence identities obtained by
  content deduplication. The retry route uses the same all-bindings join.
- `sourceReadinessInputForCase` and `mergeSourceReadinessIntoCase` are exported from the shared domain.
  The latter updates only server-owned status/source flags on a local draft. The archive recovery UI is
  isolated in `ManualSourceArchiveRecovery.tsx`, so an explicit-save integration can retain the action
  without replacing unsaved field values.

### TKT-153 integration contract (audited after merge at `ab2d677`)

Do not merge either implementation mechanically. The merged TKT-153 `rest-client.ts` removes TKT-166's
create-operation headers, per-file roles/completion result and archive retry while adding
`saveCaseEdits`; the semantic result must contain both contracts. Its `CaseDetail.tsx` removes the
source recovery surface while adding the explicit draft/save session. The API's explicit-save
`statusForReviewCase` input must spread `sourceReadinessInputForCase(existing)` after the full snapshot
has restored `manualIntakeEvidenceState`; otherwise Save can promote a source-blocked case. Preserve
`ManualSourceArchiveRecovery` in the Evidence tab and use `sourceReadinessRecoverySnapshot` after its
fresh read to update the draft, persisted baseline and `caseVersion` together. This retains dirty EVA
fields while making the next If-Match current. Keep TKT-153's Save/Discard/concurrency behavior
unchanged. TKT-024 remains a separate semantic integration for `ManualIntake.tsx` and was not merged.

The branch is now rebased on `ab2d677` and implements that contract. Explicit Save includes the
persisted source readiness flags in its canonical status evaluation, so a dead-lettered Manual Intake
source cannot be promoted. Recovery applies the fresh server source/status snapshot to both the dirty
draft and persisted baseline and advances the latest version token without replacing edited EVA
values. The TKT-024 form remains deliberately unmerged for its separate layout integration.

## Final reciprocal-review follow-up — 2026-07-13

- The eight-attempt terminal state now applies only when the evidence has a durable Manual Intake
  upload-item binding. Other evidence retains capped hourly retries instead of becoming an invisible,
  unrecoverable dead letter during a longer archive outage.
- Internal status recomputation now carries both pending and archive-failed source state, matching the
  normal case snapshot and preserving the correct recovery guidance.
- Case merge now rebinds only evidence identities during evidence coalescing, then moves the parent
  upload batch before its items. The regression pins the ordering and the final survivor ownership.

## Merge lifecycle follow-up — 2026-07-13

- A merge now locks both cases' Manual Intake operations and refuses the merge while either create
  side effects or selected source batch is incomplete. Completed historical operations are safe to
  transfer to the survivor.
- Non-colliding staff upload items, batches and Manual Intake operations move to the survivor with
  their evidence. For a SHA collision, every item that referenced the redundant source evidence is
  rebound to the canonical target evidence before the source retires. Content-dedup and rebound
  identities therefore continue to drive survivor readiness and retry.
- The operation `case_id` is no longer unique: a merge can legitimately leave multiple completed
  historical create operations on one survivor. Exact upload-key predicates keep their replay and
  completion bindings separate; operation/upload keys themselves remain unique.
- The regression sequence merges a rebound old-key/content-dedup instruction, applies a later archive
  dead-letter to the canonical survivor evidence, proves the survivor evaluates Not Ready, then proves
  the survivor retry clears that same outbox row. A separate test proves an incomplete operation blocks
  the merge before evidence moves.

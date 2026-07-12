# Changes — TKT-166: Persist instruction and extra files from Manual Intake

## Status

Implemented and tested offline on `codex/tkt-166-manual-intake-evidence-upload`. The dispatching
loop still owns the ticket-status move, database delta, deployment and independent live verification.

## Commits

- `d20584b` — make Manual Intake case creation and its source-file batch resumable, target-bound and
  truthful on partial failure.

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
- `docs/azure/deploy.md` — binding rollout order: additive TKT-166 delta, API, then SPA.

## Summary

Document-led Manual Intake no longer creates a case and then merely says its selected files were
linked. A PDF instruction and all JPG/PNG/WebP/PDF extras are uploaded through the TKT-165 contract,
with the instruction persisted as instruction-kind evidence under its original filename and bytes.
The manual picker deliberately no longer advertises Word or email files because the canonical staff
upload route cannot validate those formats safely end to end; automated mailbox parsing retains its
existing format coverage.

The case-create key is independent from the file-batch key. A lost create response returns the same
case, a lost upload response replays the same evidence identities, and a handler changing the file
selection rebinds the unfinished operation without allocating another Case/PO. The shared readiness
contract blocks Review while the selected source batch is incomplete. The recovery view names every
outstanding file, preserves already-added identities, and does not navigate automatically.

## Offline checks

- Full Domain suite: **53 files / 1,119 tests passed**.
- Full API suite: **64 files / 628 tests passed**.
- Full orchestration suite: **30 files / 401 tests passed**.
- Full SPA suite: **40 files / 459 tests passed**.
- Focused final run: Domain **41**, API **40**, SPA **57** tests passed.
- Production TypeScript builds passed for Domain, API, orchestration and the SPA; the Vite bundle was
  produced successfully.
- Postgres parity, documentation links, ticket integrity and shared-skill checks passed.

## Scope boundaries / overlap

- TKT-024 changes the images-only fields and layout in the same `ManualIntake.tsx`; it does not own
  this document/manual source-file transaction. Its branch will need a normal rebase conflict review.
- TKT-153 owns explicit saving on an existing case. This change does not turn the New case form into
  a general case editor and does not alter its save contract.
- TKT-130's merged canonical readiness evaluator remains authoritative. TKT-166 contributes one
  additional source-file check to that evaluator and to the locked submission re-check; it does not
  reintroduce a parallel readiness predicate.
- Archive mirroring and image classification remain the canonical TKT-165 outbox/classifier paths;
  this ticket reuses them rather than introducing another byte or cleanup lifecycle.

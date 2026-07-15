---
id: TKT-160
title: Delete an individual case image from every active store
status: now
priority: P2
area: evidence
tickets-it-relates-to: [TKT-003, TKT-010, TKT-089]
research-link: docs/tickets/now/TKT-160-delete-case-image/evidence/operator-note.md
plan: PLAN-004
---

# Delete an individual case image from every active store

## Problem
Staff can exclude images but cannot deliberately delete one image. The requested action must remove the selected image from active evidence and archive storage without affecting source emails/documents, sibling evidence or the case folder, while retaining a durable audit and safe retry behavior.

## Evidence
- [Operator note](./evidence/operator-note.md) — raw drop-note after distillation.
- [Source note](./evidence/source-evidence/delete-image.button.md) — preserved input from the distillation inbox.
- ADR-0012/ADR-0017 — current retention rules prohibit automated Box deletion and need an explicit staff-confirmed exception.

## Proposed change
PROPOSED (not built): add a staff-confirmed per-image deletion workflow with server-side ownership checks, deletion intent, idempotent cross-store cleanup, replay suppression and explicit partial-failure recovery.

## Acceptance
- Every image card has an accessible “Delete image” action; documents and source emails are unaffected.
- Confirmation identifies the selected filename/image and states that its archive copy will also be removed. Cancelling performs no mutation.
- The server verifies that the evidence belongs to the case and is image evidence before recording or deleting anything; authorization is enforced server-side.
- A durable deletion intent/audit is recorded before cross-store work begins, with actor, evidence ID, storage identities and outcome but no image bytes.
- The selected image is removed idempotently from transient Blob storage when present, from Box by its persisted file ID inside the case folder/test root, and from all active evidence, preview, ordering, EVA and readiness views.
- An already-purged Blob or already-missing Box file is a successful idempotent outcome. Wrong-case/non-image/unsafe-scope targets fail before deletion.
- Partial failure is visible, retryable and reconciled; the UI never reports complete success while a required active copy remains.
- Replaying the originating email/document or webhook does not silently resurrect a deliberately deleted derived image. Explicit later re-upload remains possible and auditable.
- The action never deletes sibling evidence, the source email/document, a containing folder, or anything outside Box test root `392761581105` during verification.
- Photo order and readiness are recomputed after successful active-state removal; a case can leave Review when the deletion removes required usable evidence.
- ADR-0012/ADR-0017 and architecture/runbook text explicitly distinguish this staff-confirmed single-image action from prohibited automated retention deletion.
- Tests cover Blob/Box present and absent, wrong-case, non-image, out-of-scope Box ID, partial failure/retry, repeated request, replay suppression, re-upload and readiness recomputation.
- Live proof uses only a designated test case/folder and records before/after Blob, Box, database, UI, readiness and audit evidence.

## Research
Distilled 2026-07-12 from the supplied operator note, now preserved in this ticket's evidence folder.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
- [Source note](./evidence/source-evidence/delete-image.button.md)

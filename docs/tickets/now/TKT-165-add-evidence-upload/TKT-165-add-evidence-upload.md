---
id: TKT-165
title: Make Add evidence upload the selected files
status: now
priority: P0
area: evidence
tickets-it-relates-to: [TKT-003, TKT-023, TKT-068, TKT-089]
research-link: docs/tickets/now/TKT-165-add-evidence-upload/evidence/code-audit.md
plan: PLAN-004
---

# Make Add evidence upload the selected files

## Problem
The live Add evidence screen accepts files and a case selection, but its action ignores the files and only navigates to the case. The UI therefore presents an evidence-upload workflow that cannot add evidence.

## Evidence
- [Code audit](./evidence/code-audit.md) — read-only source trace of the missing call.

## Proposed change
PROPOSED (not built): connect the screen to the canonical authenticated evidence-upload seam and make completion, failure and retry truthful.

## Acceptance
- Search includes every active state that can receive evidence, including Held. After exactly one active case is selected, the action uploads the selected files through the canonical evidence endpoint; it never treats navigation as attachment.
- File type, size, count, image safety and authorization checks are enforced server-side as well as reflected in the picker. An inactive, merged, removed, ambiguous or inaccessible case is rejected before bytes are stored.
- Picker copy/accept filters and server validation advertise the same supported types. If email/Word formats remain advertised they are implemented safely; otherwise they are removed from the promise rather than rejected only after selection.
- The action shows upload progress, prevents accidental duplicate submission, and navigates only after the server confirms the resulting evidence identities.
- Content hash plus an idempotency key prevents duplicate evidence, archive uploads and audits when the user retries or double-clicks.
- Partial or total failure keeps the case and selected files visible, identifies which files need retry in plain language, and never claims success for an unpersisted file.
- Successful files create canonical evidence rows, enter the archive outbox, run image classification where applicable, recompute readiness and produce one understandable audit.
- Source and audit labels identify a staff `Add evidence` upload; the existing assistant-specific wording is not reused for this route.
- A retry cannot create evidence on a different case if the case selection changed or became stale; the server revalidates the target at commit time.
- Keyboard, screen-reader, narrow viewport and 200% zoom states can select a case, add/remove files, start upload and understand progress/result.
- Tests prove no navigation-only path remains and cover success, duplicate retry, mixed partial failure, validation refusal, stale case, authorization, archive retry and readiness recomputation.
- Deployed Chrome proof uploads a harmless fixture to a designated test case and verifies UI, database, Blob and Box mirror only beneath test root `392761581105`.

## Research
Discovered during the 2026-07-12 production-readiness source audit requested by the operator.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Code audit](./evidence/code-audit.md)

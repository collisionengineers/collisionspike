---
id: TKT-166
title: Persist instruction and extra files from Manual Intake
status: backlog
priority: P0
area: intake
tickets-it-relates-to: [TKT-001, TKT-003, TKT-023, TKT-024, TKT-165]
research-link: docs/tickets/backlog/TKT-166-manual-intake-evidence-upload/evidence/code-audit.md
plan: PLAN-004
---

# Persist instruction and extra files from Manual Intake

## Problem
Manual Intake uploads images for an images-only case, but its instruction/document path creates the case without uploading the selected instruction or extra evidence. It then tells staff that the files were linked, leaving a case without the source evidence needed for audit, reprocessing or archive completeness.

## Evidence
- [Code audit](./evidence/code-audit.md) — read-only source trace of the asymmetric upload behavior and false success message.

## Proposed change
PROPOSED (not built): persist the instruction and every accepted extra file through the same canonical evidence/archive lifecycle before reporting the manual intake complete.

## Acceptance
- Document/manual intake uploads the chosen instruction and every accepted extra file to the newly created case; the instruction retains its source-document role and filename/content identity.
- Picker copy/accept filters and server validation agree for images, PDF, Word and email formats. A format is either safely supported end to end or removed from the picker; it is never promised then discarded.
- Case creation and evidence upload use an idempotent resumable operation. A retry cannot mint a second case, duplicate a file or allocate another Case/PO/folder.
- The case is not reported as complete and cannot enter Review while its required instruction/source evidence is unpersisted or archive work has failed terminally.
- Full success reports the confirmed number and role of persisted files. Partial/total failure identifies outstanding files, keeps a retry route, and never uses “linked” for files the server has not stored.
- Persisted source bytes are available to the parser/remediation path, evidence page and archive outbox; extras receive the correct document/image classification and readiness treatment.
- Validation and authorization are server-side. Unsupported, oversized, unsafe or empty files fail without deleting the created case or obscuring the recovery action.
- Content hash and operation idempotency cover browser retry, response loss and double submission; audits distinguish case creation, each evidence result and eventual recovery.
- Tests cover instruction only, instruction plus extras, document plus images, partial failure, complete failure, retry after response loss, duplicate content, parser handoff and archive retry.
- Deployed Chrome proof creates a disposable manual test case, verifies the exact selected bytes through UI/database/Blob, and verifies the Box mirror only beneath test root `392761581105`.

## Research
Discovered during the 2026-07-12 production-readiness source audit requested by the operator.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Code audit](./evidence/code-audit.md)

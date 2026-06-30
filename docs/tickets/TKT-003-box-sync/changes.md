# Changes — TKT-003: Get .eml / images / instructions into the Box folder

## Status
done — source files now land in the Box folder at intake; verified e2e for the first time.

## Commits
- `c87430d` — fix(intake): parse.ts→parser contract, Box folder at intake, Case/PO mint → folder-at-intake plus the contract that feeds the archive step.
- `94902ce` — feat(work-todo-spike): mega-commit (TKT-001..014,019,020) → the evidence-archive-to-Box path.
- `d5e2d4b` — fix(box): add 3 missing case Box API routes (Open-in-Box 404 fix) → `caseBoxSharedLink`, `caseBoxCopyFileRequest`, `caseBoxFinalize` in `api/src/functions/cases.ts`.
- `1d8708d` — fix(intake): decouple Box folder/archive/image-extract from automation mode → the archive step now runs on every intake.

## Files touched
- `orchestration/src/functions/intakeOrchestrator.ts`
- `api/src/functions/cases.ts` (caseBoxSharedLink, caseBoxCopyFileRequest, caseBoxFinalize)

## Summary
The Box folder was created at intake but no files were stored. The archive step now uploads the source `.eml` and the instruction documents into the case folder, decoupled from automation mode so it always runs. The three missing case Box API routes were added to fix the Open-in-Box 404. A live case confirmed the folder now contains the expected files.

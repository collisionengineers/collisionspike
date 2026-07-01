# Changes — TKT-003: Get .eml / images / instructions into the Box folder

## Status
done — regressed after the 2026-06-30 PR30 review-fix wave, re-fixed and redeployed
2026-07-01. Root cause + fix for both the sync regression and a co-discovered junk-image bug;
see [changes-regression-01-07-26.md](./changes-regression-01-07-26.md) for the follow-up.

## Commits
- `c87430d` — fix(intake): parse.ts→parser contract, Box folder at intake, Case/PO mint → folder-at-intake plus the contract that feeds the archive step.
- `94902ce` — feat(work-todo-spike): mega-commit (TKT-001..014,019,020) → the evidence-archive-to-Box path.
- `d5e2d4b` — fix(box): add 3 missing case Box API routes (Open-in-Box 404 fix) → `caseBoxSharedLink`, `caseBoxCopyFileRequest`, `caseBoxFinalize` in `api/src/functions/cases.ts`.
- `1d8708d` — fix(intake): decouple Box folder/archive/image-extract from automation mode → the archive step now runs on every intake.
- `493433e` / `781f02b` — fix(pr30): reworked `boxArchiveEvidence` to read persisted evidence via a new Data API route (enabling images + `box_file_id`/`box_synced_at` stamping) — but introduced the regression fixed 2026-07-01 (see below).
- **(uncommitted as of 2026-07-01)** — the regression fix + the decorative-image fix; see the follow-up doc for files.

## Files touched
- `orchestration/src/functions/intakeOrchestrator.ts`
- `api/src/functions/cases.ts` (caseBoxSharedLink, caseBoxCopyFileRequest, caseBoxFinalize)
- `api/src/functions/internal.ts` (regression fix, 2026-07-01 — see follow-up doc)
- `orchestration/src/functions/activities/boxArchive.ts` (manual backfill lever, 2026-07-01)
- `functions/parser/cedocumentmapper_v2/application/service.py` + sibling `cedocumentmapper_v2.0` (decorative-image filter, 2026-07-01)

## Summary
The Box folder was created at intake but no files were stored. The archive step now uploads the source `.eml` and the instruction documents into the case folder, decoupled from automation mode so it always runs. The three missing case Box API routes were added to fix the Open-in-Box 404. A live case (QDOS26001) confirmed the folder contained the expected files — but the same-day PR30 review-fix wave then broke it again for every subsequent case (see follow-up doc). That regression is now fixed and redeployed.

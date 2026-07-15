# Changes — TKT-002: Auto-extract vehicle images from PDFs + flag unsuitable

## Status
done — image auto-extraction is live; the registration-flagging half is gated off (see verification).

## Commits
- `94902ce` — feat(work-todo-spike): mega-commit (TKT-001..014,019,020) → the PDF image-extraction path that writes embedded vehicle images as evidence rows.
- `1d8708d` — fix(intake): decouple Box folder/archive/image-extract from automation mode → image extraction now runs regardless of automation mode (`Both`), so it fires on every intake.

## Files touched
- `services/orchestration/src/workflows/intake/intakeOrchestrator.ts`
- `apps/web/src/shared/ui/ImageOrderList.test.ts` (unit test)

## Summary
Embedded vehicle images are auto-extracted from incoming PDFs and persisted as image evidence rows on the case. The extract step was decoupled from automation mode so it always runs at intake. The "flag unsuitable" half (no-registration-visible images) is in place but degrades to a generic note while plate OCR is disabled. Live counts of extracted images match the telemetry exactly.

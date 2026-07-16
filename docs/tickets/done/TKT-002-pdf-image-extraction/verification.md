# Verification — TKT-002: Auto-extract vehicle images from PDFs + flag unsuitable

## Verdict
VERIFIED-LIVE (extraction); the unsuitable-flagging half is NOT yet live.

## Evidence
Live e2e (2026-06-30, two cases since the 10:21Z clean-slate reset):
- `dc307411`: 63 image evidence rows (61 jpeg + 2 png); App Insights custom event `{"evt":"extractImages","extracted":63}` matches the DB row count exactly.
- `ca3acf21` = `QDOS26001`: 3 image rows; event `extracted:3`.
- `extractImages` ran 6× with 0 failures.
- Unit test: `apps/web/src/shared/ui/ImageOrderList.test.ts`.
DB reads cross-checked against App Insights custom events.

## Pending / gaps
Registration-flagging of unsuitable photos needs `PLATE_OCR_ENABLED` (currently off). With OCR off the pipeline degrades to a generic note rather than detecting no-registration-visible images, so that half is NOT yet live. Gate state: see ../../operations/live-environment.md.

## How to re-verify
Send a PDF with embedded images to a live intake mailbox; query the case's image evidence rows in Postgres and compare to the `extractImages` custom event count in App Insights. To verify flagging, enable `PLATE_OCR_ENABLED` and re-run with a PDF containing a no-registration image.

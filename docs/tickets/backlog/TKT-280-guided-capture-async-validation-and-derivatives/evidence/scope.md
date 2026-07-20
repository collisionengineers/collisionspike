# Scope — TKT-280 (formerly CCAP-011)

Verified live against `services/data-api/src/features/cases/`:
- `capture-cleanup.ts`: real `app.timer('capture-retention-cleanup', ...)`, deletes unmaterialised
  assets of expired/revoked/complete/locked sessions past a configurable retention window. Shipped.
- `upload-validate.ts` (used by `capture-upload.ts`'s completion handler): `sharp({ limitInputPixels })`
  decompression-bomb guard + animated-image (`animatedImage()`) rejection, run synchronously inline
  during upload completion. Shipped.
- No `capture-validate.ts` or equivalent async queue consumer exists under `services/orchestration`.
- No advisory OCR/plate-read hookup for capture assets found (`grep -r "derivative"` across
  `services/data-api/src/features` returns nothing).
- No display-derivative generation (EXIF-stripped/normalized copies) found.

# Verification — TKT-089: Confirm non-vehicle images (signatures/logos) are no longer stored on Box

## Verdict
PARTIAL — the PDF-lane suppression is BUILT + DEPLOYED (offline-proven); the live audit + backfill + proof
remain. Moved to `verify`.

## Evidence (what is proven)
- **Offline test green:** `functions/parser/tests/test_extract_images.py:161`
  `test_small_decorative_image_is_filtered_out` — an 80×40 logo-sized raster yields `count == 0`
  ("must be filtered, not stored as evidence"); the docstring cites the exact QDOS26004 /
  `LtrtoEngineerIn__RJS_UnknownVRM_img_1_3` bug from this ticket's screenshot. Companion large-image
  test proves real photos are still kept.
- **Deployed on `main`:** the `is_decorative` floor (`service.py:401`, applied at lines 433 + 453) shipped
  via `aafeba1`; the parser Function serves it on `POST /extract-images`.

## Pending / gaps (required before `done`)
1. **Data audit** — Postgres + Box sweep of non-vehicle evidence images captured after `aafeba1`, split by
   lane (email-attachment vs PDF-extraction); queries + results recorded here.
2. **Email lane** — zero post-deploy signature captures (closes TKT-047's still-pending live proof), or fix.
3. **Live probe** — re-parse (or fresh intake) a letterhead-bearing PDF → no logo evidence rows and no logo
   files in the Box case folder.
4. **Recall guard** — a genuine vehicle-photo PDF still lands its images in evidence + Box.
5. **Backfill** — the delete/keep decision for existing non-vehicle images recorded + executed (audited).

## Coverage caveat
The fix is a 200×200 *area* floor, so a large logo/banner above that area is not caught. The audit must
confirm whether this residual actually manifests; if so, raise a follow-up (content/aspect heuristic), do
not silently treat this ticket as fully covering it.

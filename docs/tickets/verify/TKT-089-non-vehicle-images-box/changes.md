# Changes — TKT-089: Confirm non-vehicle images (signatures/logos) are no longer stored on Box

## Status
**Reclassified `backlog` → `verify` (2026-07-07)** — the core PDF-lane fix is **built + deployed on
`main`**; what remains is the live audit + backfill decision + proof, which is `verify` work, not a build.

## Commits
- No new code in this ticket — the fix shipped earlier and is recorded here for the status correction.
- The PDF-extraction decorative-image floor is live on `main`: last shipped via `aafeba1`
  (`feat(case-type): ADR-0021 marker taxonomy end-to-end + TKT-051 EVA-provider-leak fix`).

## Summary
The ticket's central ask — suppress PDF-extracted letterhead/logo crops from becoming case-image evidence
(the `LtrtoEngineerIn__RJS_UnknownVRM_img_1_x` QDOS26004 sample) — is **implemented and deployed**:

- `functions/parser/cedocumentmapper_v2/application/service.py:401` `is_decorative(width, height)` — an
  area floor `_MIN_EXTRACTED_IMAGE_AREA = 200*200` (line 45); unknown dimensions are kept (recall-safe).
- Applied on **both** PDF extraction paths: PyMuPDF (`service.py:433`) and the pypdf fallback (line 453).
- Unit-tested against this ticket's exact evidence:
  `functions/parser/tests/test_extract_images.py:161` `test_small_decorative_image_is_filtered_out`
  (docstring names "the QDOS26004 bug … `LtrtoEngineerIn__RJS_UnknownVRM_img_1_3`"; asserts `count == 0`),
  with the companion large-image "is kept" recall guard.

**Rescope caveat:** this is a *size* floor, not a content classifier — a large letterhead/banner logo above
the 200×200 area still passes. The audit (below) must confirm whether that residual gap actually occurs; if
it does, it becomes a follow-up ticket rather than reopening this one.

## Remaining before `done` (moves to verify)
1. Data audit — sweep post-`aafeba1` live cases' evidence rows + Box case folders for signature/logo-shaped
   images, split by lane (email-attachment [TKT-047] vs PDF-extraction).
2. Email-attachment lane — close TKT-047's own live proof (zero post-deploy signature captures).
3. Backfill decision — list existing non-vehicle evidence images; operator delete/keep (Box delete is
   ACK-only per ADR-0017 — removal may be evidence-row-only).

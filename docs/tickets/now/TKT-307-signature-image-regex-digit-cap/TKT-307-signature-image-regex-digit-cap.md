---
id: TKT-307
title: Signature/logo image regex caps its digit run at 4 — a six-digit Outlook cid escapes as evidence
status: now
priority: P1
area: triage
tickets-it-relates-to: [TKT-043, TKT-047]
research-link: docs/tickets/now/TKT-307-signature-image-regex-digit-cap/evidence/code-read-2026-07-21.md
---

# Signature/logo image regex caps its digit run at 4 — a six-digit Outlook cid escapes as evidence

## Problem

`_SIGNATURE_IMAGE_RE = re.compile(r"^image0*\d{1,4}\.(?:png|jpe?g|gif|bmp)$")` caps the digit run
at `\d{1,4}`, so a six-digit Outlook cid (`image078315.png`) matches nothing. The filename then
falls through to the extension/hint tiers in `_is_image_evidence_file` and reads as genuine image
evidence, which can promote a reply carrying only an inline signature/logo image to
`case_update`/`images_received` (Rule 4a2) and let the letterhead/logo raster reach live evidence
uncropped.

The regex is authored once in `services/engine/cedocumentmapper_v2/.../email_classifier.py`, and
materialized by `scripts/build/sync-engine.py` into `services/functions/parser/` and
`services/functions/ocr/`. A hand-written TS twin exists at
`services/orchestration/src/workflows/intake/triagePolicy.ts` (`_SIGNATURE_IMAGE_RE`,
`deliveredImagesOnly`) — kept parallel by comment only, so a fix here needs both sites touched.

The area floor (`AREA_FLOOR = 200 * 200` in `image-sniff.ts` /
`_MIN_EXTRACTED_IMAGE_AREA = 200*200` in `service.py`) is a separate mechanism (raster size, not
filename pattern) and does not cover this case — a full-size cid attachment is not filtered by it.

## Change

- Widened the digit run to unbounded (`\d+`) in the Python authoring source, then
  `python scripts/build/sync-engine.py` to update the materialized copies — never hand-edited a
  materialized copy directly.
- Widened the TS twin in `triagePolicy.ts` to match, in lockstep per its own comment.
- Regression tests added on both sides for a six-digit cid filename
  (`image078315.png`), which previously read as delivered evidence and now does not.

## Acceptance

- `image078315.png` (and any all-digit `imageNNNNNN.ext` stem) classifies as a signature/logo
  image, not evidence, on both the Python engine and the TS twin.
- `scripts/checks/check-engine-materialized.py` passes (materialized copies match the authoring
  source byte-for-byte).
- Existing 4-digit-and-under cases (`image001.png`, etc.) are unaffected.
- Let the P0-A image-classify fix (TKT-306) exclude the raster at the vision-classifier layer;
  this ticket only stops the filename-tier false negative that let it in as evidence in the
  first place.

## Artifacts

- [Changes made](./changes.md)
- [Code-read evidence](./evidence/code-read-2026-07-21.md)

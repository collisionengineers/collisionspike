# Changes — TKT-047: Email signature images archived to Box in error

## Status
now — the 2026-07-08 FAILED-live coverage gap (above-floor banner signatures) is code-complete +
offline-tested; NOT yet deployed (deploy + live proof owned by the dispatching session).

## Commits
- (none yet in this repo — this wave's edits are uncommitted on `feat/lifecycle-wave`; the original
  floor shipped earlier as `de7991d` feat(orch): non-inline signature-image raster floor)

## Files touched
- `services/orchestration/src/platform/image-sniff.ts` (+ `image-sniff.test.ts`)
- `services/orchestration/src/adapters/graph.ts` (skip-trace wording only)

## Summary
Root cause of the 2026-07-08 operator report ("signatures still being picked up and filed to Box
from many emails") given that the deployed area floor was provably acting (221 skip traces): the
floor is **area-only** — wide banner-style signature images (e.g. 600x150 = 90,000 px², above the
40,000 px² floor) sailed through, and GIF/BMP signatures were never dimension-sniffed at all (only
the 8KB byte-floor could catch them, so any padded/large-byte GIF banner escaped).

## 2026-07-09 — above-floor banner heuristic + GIF/BMP dimension sniff

- **Banner-shape rung** in `isLikelySignatureImage`/`assessSignatureImage`
  (`services/orchestration/src/platform/image-sniff.ts`): an image whose dimensions sniff ABOVE the area floor is
  still flagged when **aspect ratio >= 3.5:1 (either orientation) AND short side <= 240 px** — new
  exported constants `BANNER_ASPECT_RATIO = 3.5`, `BANNER_MAX_SHORT_SIDE = 240`, mirroring the
  engine's `is_decorative_raster` (sibling `engine-v2.11`, TKT-089 — the two filters are documented
  to stay in lockstep). Recall guard (binding doctrine): no real phone/camera photo shape can match —
  photos are 4:3/3:2/16:9 (aspect <= ~1.8), and a panoramic crop reaching 3.5:1 carries a short side
  far above 240 px (tests pin 4032x3024, 1920x1080, 3000x1000, 4000x1000 and the 845x241 boundary as
  kept; 840x240 — both boundaries inclusive — as flagged).
- **GIF + BMP dimension sniffing** added to `sniffImageDimensions` (dependency-free, same rigor):
  GIF87a/89a logical-screen dims (little-endian uint16 at bytes 6-9); BMP BITMAPINFOHEADER-and-later
  int32 LE dims at 18-25 (negative height = top-down DIB, magnitude taken) plus the BITMAPCOREHEADER
  uint16 variant; any structural surprise still returns `undefined` (unknown, never guessed). Those
  formats now get a real area/banner verdict instead of falling through to the byte-floor-only rung;
  sniffed dims WIN over the byte floor (a photo-dims GIF with tiny bytes is kept — recall-safe).
- **`AREA_FLOOR` (40,000 px²), `BYTE_FLOOR_FOR_UNKNOWN` (8KB), the non-image-always-false rule, and
  the `GRAPH_IMAGE_FLOOR_DISABLED` kill switch are all unchanged.**
- **Skip trace** (`graph.ts skipAsSignatureImage`) now distinguishes the rung via the new
  `assessSignatureImage` verdict: `dimensions WxH` (area floor — wording unchanged, existing App
  Insights queries keep matching), `banner shape WxH` (new rung), `byte-size Nb` (unknown dims).
  Every skip stays logged by name; traces only, nothing handler-facing.
- **Tests** (`image-sniff.test.ts`): banner cases flagged (600x150 PNG + JPEG, 900x180 GIF, 150x800
  BMP tall strip, 840x240 boundary), photo shapes kept (list above), GIF/BMP sniff found + malformed
  matrices (zeroed dims, truncations, unrecognised DIB, negative width), verdict-envelope assertions,
  and all pre-existing cases unchanged. Suites: `npm --prefix services/orchestration test` → **203 passed
  (13 files)**; `tsc -b` clean; `node verify-all.mjs` → 11 passed / 1 failed (the parser pytest
  FAIL is the known-environmental ALS_doc failure on this Windows box, pre-existing).

Coupled fixes this wave: the PDF-extraction lane's identical banner heuristic is TKT-089
(engine `engine-v2.11`, re-vendored); the evidence-filename RJS/UnknownVRM fix is TKT-090.

Remaining (dispatcher-owned): deploy `cespk-orch-dev`, then live proof — a real signature-bearing
email produces `banner shape` skip traces and no signature files in the case's Box folder.

## Update — 2026-07-09 (PLAN-003 lifecycle wave: deploy + audit tie-in)

- **Deployed live:** orch republished with the above-floor banner heuristic (aspect ≥ 3.5, short
  side ≤ 240 px) + GIF/BMP dimension sniffing in `image-sniff.ts`; skip traces now distinguish
  `dimensions WxH` / `banner shape WxH` / `byte-size Nb` rungs.
- **Audit context (from the TKT-089 sweep):** since the 2026-07-02 floor deploy the email lane
  produced 881 image evidence rows of which only ~5 were signature-suspects that slipped the
  floor — the bulk of the operator-reported leak was the PDF-extraction lane (TKT-089's 160) plus
  above-floor email banners that this deploy now covers. One audited email-lane leak
  (`image771667.png`, 3 KB, dimension-sniffed above the area floor) was excluded in the TKT-089
  cleanup.
- Live proof (a fresh signature-bearing email producing a `banner shape` skip + nothing in Box)
  is verify-stage.

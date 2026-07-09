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

## 2026-07-09 — PDF-lane large-banner heuristic (closes the "Rescope caveat" above)

Reopened verify→now on the 2026-07-08 operator FAILED-live report. The residual gap the caveat
flagged is now closed in code: the size floor alone missed LARGE letterhead/banner/logo crops
above the 200×200 area.

- **Engine (ADR-0018 sibling-first):** sibling `cedocumentmapper_v2.0` commit `4cbf19a`, tag
  **`engine-v2.11`** (branch `feat/tkt043-open-case-ref-context`, on top of the vendored
  `engine-v2.10`). `application/service.py`: `is_decorative` lifted to module-level
  `is_decorative_raster` and extended — an above-floor raster is still decorative when
  **aspect >= 3.5:1 AND short side <= 240 px** (new constants `_BANNER_ASPECT_RATIO = 3.5`,
  `_BANNER_MAX_SHORT_SIDE = 240`). The 200×200 area floor and the unknown-dimensions-kept rule are
  unchanged. Recall guard (binding doctrine): no real phone/camera photo shape can match — 4:3/3:2/
  16:9 photos have aspect <= ~1.8, and a pano crop reaching 3.5:1 carries a short side far above
  240 px. Applied on BOTH PDF paths (PyMuPDF + pypdf fallback) via the existing closure.
- **Sibling fixtures** (`tests/test_extract_images.py`, new): 900×180 wide banner suppressed,
  150×800 tall sidebar strip suppressed, 80×40 classic logo suppressed; 1600×1200 and 4032×3024
  photo shapes kept; `is_decorative_raster` unit matrix incl. unknown-dims-kept and the
  840×240 / 845×241 / 3000×1000 boundaries. Sibling suite: **396 passed, 4 skipped**.
- **Re-vendored** into `functions/parser/cedocumentmapper_v2/` per the PROVENANCE.md mirror loop —
  only `application/service.py` changed, byte-identical to the `engine-v2.11` tag; drift guard
  (`test_engine_vendored_in_sync.py`) 7 passed. `PROVENANCE.md` updated (history entry + Cut-from
  section → `engine-v2.11`).
- **Mirrored wrapper tests** (`functions/parser/tests/test_extract_images.py`):
  `test_large_banner_furniture_is_filtered_out` (900×180 + 150×800),
  `test_real_photo_shape_is_never_banner_filtered` (1600×1200), plus the TKT-090 naming test.
  File: 13 passed. Full parser suite: 278 passed / 11 skipped / 1 failed
  (`test_multiformat_extraction[ALS_doc]` — known-environmental on this Windows box, pre-existing).
- **Email lane in lockstep:** the identical thresholds now also run on the Graph-attachment lane
  (TKT-047, `orchestration/src/lib/image-sniff.ts`) — both filters cite each other in comments.

NOT done here (dispatcher-owned): parser Function deploy, the live data audit (item 1 above),
TKT-047's live proof (item 2), the backfill decision (item 3), and the live re-parse probe.
NOTE: the sibling `engine-v2.11` commit + tag are LOCAL (like the `engine-v2.10` pin before them) —
push before relying on the ref in CI.

## Update — 2026-07-09 (PLAN-003 lifecycle wave: data audit + cleanup + deploy)

**Live data audit (Postgres, csadmin window; full queries in verification.md):**
- Lane split of image evidence created since the TKT-047 email-lane deploy (2026-07-02T13:14Z):
  **email lane 881 rows (824 in Box, 122 excluded) · PDF-extraction lane 4,129 rows (3,182 in Box,
  318 excluded)**.
- Signature/logo residue above the 200×200 floor, not yet excluded: **165 suspects (160 PDF-lane +
  5 email-lane)** — dominated by recurring per-provider letterhead crops (`LtrtoEngineerIn__…_img_1_1.png`
  @10.7 KB across ~40 cases, `InspectionRequest_*_img_1_1.png` @19.5 KB, SBL instruction art @6.8 KB).
  Nearly all were already `accepted_for_eva=false` (the image classifier keeps them out of EVA) but
  still polluted the evidence view + Box mirror.

**Audited cleanup EXECUTED** — [`deltas/2026-07-09-tkt089-evidence-cleanup.sql`](../../../../migration/assets/schema/deltas/2026-07-09-tkt089-evidence-cleanup.sql):
**163 rows excluded** (rungs: <25KB doc-extract crops already EVA-rejected = 161; email-lane
`imageNNN.*` signature = 1; sub-1.5KB crop = 1), backup table `backup_20260709_tkt089_evidence`
(163 rows), **107 per-case audit rows** (action `attachment_classified`, actor
`agent:PLAN-003-lifecycle-wave-2026-07-09`), residual suspect count after: **0**.

**Backfill decision (recorded):** evidence-row-only — the mirrored Box files are NOT deleted or
renamed (ADR-0012/0017: Box is a one-way additive mirror; delete is ACK-only). The excluded rows
no longer surface in the evidence view or EVA flow; the Box copies remain as archive artifacts.

**Forward fix deployed live (2026-07-09):** parser at sibling tag `engine-v2.11` (banner-aspect
heuristic: aspect ≥ 3.5 with short side ≤ 240 px is decorative even above the area floor) and orch
with the mirrored email-lane heuristic + GIF/BMP dimension sniffing. Live re-parse probe + recall
guard remain verify-stage.

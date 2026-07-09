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

---

## Verification pass — 08-07-26 (read-only)

Verified by: ticket-verifier dispatch, 08-07-26. Scope: the read-only subset (pending items 1–2);
items 3–5 need a non-read-only pass. Ticket stays in `verify`.

### Verdict
PENDING — no regression found on any readable surface; substantial live telemetry gathered for pending
items 1–2, but the decisive Postgres+Box data audit is unreachable read-only (the transient firewall
rule is a mutation; Box case-folder descent is outside the scope-guard allowlist).

### Evidence
- **Email lane (TKT-047 floor) live and acting:** no `GRAPH_IMAGE_FLOOR_DISABLED` on `cespk-orch-dev`;
  App Insights shows **221 signature-image skip traces** 2026-07-02T13:23Z → 2026-07-07T11:49Z (daily
  22/63/48/71/17; all dimension-sniff skips, 0 byte-floor fallbacks), e.g.
  `[graph] skipped attachment "image001.png" — likely signature/logo image (dimensions 140x78)`.
- **PDF lane serving the fixed engine:** parser `extract_images` requests since the 2026-07-04 `aafeba1`
  deploy: 3/3, 2/2, 67/67, 86/85, 4/4 ok by day.
- **Recall guard (read-only portion):** genuine vehicle photos still extract + persist post-floor —
  2026-07-06 cases `b4e379d1` (90 imgs, regVisible:true), `30eb86c5` (26), `4bfe252c` (42),
  `76e3fcdb` (47), `c1d1da42` (36), `cd9b6a97` (9), `4c80e215` (33). Box-mirror half not confirmable
  this pass.
- **Residual-gap signal:** post-deploy extractions named `RJS_UnknownVRM_img_1_*.jpeg` still occur —
  either genuine page-1 photos or banners above the 200×200 area floor; only the DB/bytes audit can
  disambiguate. The coverage caveat stays open, not disproven.

### Pending / gaps
Expected absences: the Postgres lane-split sweep + "zero post-deploy signature captures" DB proof
(workstation IP not in the `cespk-pg-dev` firewall; adding a rule is a mutation), Box case-folder
listings (allowlist is root-only). Real issue observed (out of scope, follow-up flagged): 382
`[extractImages] plate OCR failed … fetch failed` traces since 2026-07-04.

### How to re-verify
- Email-lane skips (app 7c7ea68a): `traces | where timestamp > datetime(2026-07-02T13:14:00Z) | where message contains "skipped attachment" | summarize total=count(), byteFloorSkips=countif(message contains "byte-size")`
- Parser serving (app da68d9aa): `requests | where timestamp > datetime(2026-07-04) | where name == "extract_images" | summarize n=count(), ok=countif(resultCode startswith "2") by bin(timestamp,1d)`
- Recall (app 7c7ea68a): `traces | where message contains '"evt":"extractImages"' | where timestamp > datetime(2026-07-04)`
- Postgres sweep (non-read-only pass; Entra admin → `SET ROLE csadmin`, transient FW rule): lane-split
  count of post-`2026-07-02T13:14Z` image evidence rows by
  `file_name ~ '_img_\d+_\d+'` (pdf lane) vs email attachment, flagging
  `file_name ~* '^image0\d\d|logo|signature|banner|^B64image'` and `size_bytes < 25000`; list any hits
  with case_id/file_name/box_file_id for the Box cross-check + backfill list.

## Verdict update — 2026-07-08

FAILED (live) — operator report 2026-07-08: signatures still being picked up and filed to Box from many emails. Email-lane floor provably acting (221 skip traces), so the leak points at above-floor signature images and/or the PDF-extraction lane. Reopened verify->now for the coverage fix.

Verified by: operator report transcribed by the orchestrating session, 2026-07-08.

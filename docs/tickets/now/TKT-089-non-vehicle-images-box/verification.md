# Verification — TKT-089: Confirm non-vehicle images (signatures/logos) are no longer stored on Box

## Verdict
PENDING — the reopen fix is **deployed live 2026-07-10 ~17:35Z with the implementer's re-probe
passing** (see [changes.md §2026-07-10 REOPEN fix](./changes.md) for the design + the full re-proof:
both named samples now return count=1 on live `/extract-images` — the QDOS logo engine-suppressed at
engine-v2.15; the archive-evidence selection filters `excluded = false`, live-proven by the
box-archive lever on A.QDOS26009 completing `{uploaded:1, total:1}` with the excluded logo row left
`box_file_id NULL` while a legit 19.1 MB `.eml` mirrored). A FRESH verifier pass certifies; suggested
checks below.

**For the fresh verifier:**
1. Re-run the two-sample `/extract-images` probe (scratchpad `tkt089-reprobe.py` pattern; parser
   function key via `az functionapp keys list`) — expect count = 1 per sample, only the ~29 KB badge
   jpeg (the 10.7 KB logo png gone).
2. The badge's excluded-and-not-mirrored path: on the next post-17:35Z QDOS letter intake, the case
   should show NO `img_1_1` logo evidence row, the badge row `excluded=true` with reason
   `non-vehicle image detected (auto-classified)` and `box_file_id NULL`, and the orch
   `extractImages` App Insights event carrying `excludedNonVehicle >= 1`
   (`traces | where message contains '"evt":"extractImages"' | where timestamp > datetime(2026-07-10T17:35:00Z)`).
3. Forward-window SQL (the recon query in changes.md): suspect-class rows created AFTER
   2026-07-10T17:35Z should be zero-or-excluded, never `excluded=false AND in_box=true`.
4. Mirror filter regression-free: a genuine post-deploy intake still mirrors its photos/docs
   (boxArchiveEvidence `uploaded > 0`; W2 Q5 recall baseline 744 kept / 671 mirrored for reference).

## Prior verdict (2026-07-10, superseded by the deployed reopen fix above)
FAILED (live, acceptance line 3) — reopened to `now` 2026-07-10 with a dated follow-up
([evidence/reopen-followup-100726.md](./evidence/reopen-followup-100726.md)).

Verified by: ticket-verifier dispatch, 10-07-26. Lines 1, 2 and 4 individually PASS; line 3 (the
PDF-lane sample re-parse) FAILS a direct live probe:

- **The decisive probe:** compute-only POST of two real retained `LtrtoEngineerIn.pdf` samples to the
  live /extract-images (engine-v2.13) → HTTP 200, **count=2 both times — the QDOS Assistance logo
  (575×174, 10,720 B) and the MGAA badge (204×204, ~29 KB) still extract**, visually identical to
  the ticket's own screenshot and byte-matched to the audit's ~40-case recurring-suspect class. Both
  evade the deployed heuristics by tiny margins (aspect 3.305 < 3.5; area 41,616 vs the 40,000 floor,
  +4% and square so the banner rung can't apply). Fixtures pass only because they test shapes the
  thresholds catch (900×180, 80×40). Recall half is fine (synthetic 1600×1200 photo kept; W2 Q5:
  744 kept / 671 mirrored).
- **Compounding storage gap:** extractImages persists every parser-returned image, and the Box mirror
  selection (internal.ts:2727-2736) has NO excluded/role filter — classifier-stamped non-vehicle
  crops still mirror into the Box case folder. The classifier lanes mitigate the evidence view + EVA
  flow, not Box storage.
- **What passed:** line 1 — the written audit + lane split (881 email / 4,129 PDF rows; 165 suspects)
  and the executed cleanup (163/163, 107 audits, residual 0, live-checked 07-09); line 2 — the email
  lane forward window (0 name-suspects in Box across 1,160 new rows; floor acting, 62 skips today);
  line 4 — the backfill decision recorded + executed (evidence-row-only; Box copies retained per
  ADR-0012/0017).
- **Queued SQL** (quantifies the forward-window PDF-lane leak; run at the next data pass): the
  forward-window extraction-crop query in the verifier block — expect QDOS-logo (~10.7KB png) /
  MGAA-badge (~29KB jpeg) rows present, most with in_box=true.
- **How to re-verify after the fix:** re-run the probe script
  (scratchpad tkt089-real-sample-probe.py pattern, function key via az functionapp keys list) on the
  two named samples — fixed state = count 0 or excluded-and-not-mirrored; then the queued SQL.

## Prior verdict (2026-07-09)
PARTIAL — the PDF-lane suppression BUILT + DEPLOYED (offline-proven); the live audit + backfill +
proof remained. Superseded by the FAILED probe above.

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

## Audit record — 2026-07-09 (PLAN-003 lifecycle wave; verdict stays PENDING pending live probe)

- Lane-split + suspect queries and results: see changes.md §2026-07-09 (data captured via the
  csadmin window; transient FW rule added + removed).
- Cleanup verified live: `backup_20260709_tkt089_evidence` = 163 rows; excluded rows with
  exclusion_reason 'Non-vehicle image … TKT-089 …' = 163; per-case audit rows = 107; residual
  suspects (same heuristics) = **0**.
- Box cross-check basis: 133/163 excluded rows carried `box_file_id` (already mirrored) — the Box
  copies are deliberately left (ADR-0017; decision in changes.md).
- Still pending before `done`: live probe (letterhead PDF re-parse → no logo evidence; signature
  email → banner-shape skip) + recall guard (a genuine photo email/PDF still lands evidence+Box)
  on the engine-v2.11 / new-orch deploys.

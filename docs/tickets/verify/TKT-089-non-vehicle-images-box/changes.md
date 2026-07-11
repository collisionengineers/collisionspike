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

## 2026-07-10 — REOPEN fix: classifier-gated suppression + Box-mirror filter (deployed live)

Reopened verify→now by the 2026-07-10 verify-sweep FAILED verdict
([evidence/reopen-followup-100726.md](./evidence/reopen-followup-100726.md)): the ticket's own two
samples still extracted on the live parser (QDOS logo 575×174 aspect 3.305 < 3.5; MGAA badge 204×204
area +4% over the floor and square), AND the Box-mirror selection had no `excluded` filter, so even
classifier-stamped non-vehicle crops mirrored. Per the follow-up's constraint, the robust fix is
**classifier-gated, not threshold-tuned** — three coordinated pieces:

### 1. Box-mirror filter (api — the storage-gap closure)
`api/src/functions/internal.ts` `internalCasesArchiveEvidence`
(`GET /api/internal/cases/{id}/archive-evidence`): the selection now carries **`AND excluded = false`**
(column is `NOT NULL DEFAULT false`), so an excluded row — classifier-stamped non-vehicle, person
reflection, staff/cleanup exclusion — is never offered to `boxArchiveEvidence` as mirror work.
**Chosen semantics (the race + the refinement):**
- **Race-free by ordering, not by skip-and-retry.** Both intake persist lanes stamp `excluded`
  in-memory BEFORE their persist call (`classifyPersist` and `extractImages` classify inline), and the
  orchestrator sequences `boxArchiveEvidence` strictly AFTER both in every lane (main / attach_case /
  linked-reply), so a row is never mirror-visible in a pre-classification state when classification
  succeeded. There is no "stamps later" window left on the intake path.
- **Classify-failure = fail-open (deliberate).** A crop whose classify returned null (AOAI blip/outage/
  content-filter) persists role-unknown, NOT excluded, and stays mirror-eligible — the follow-up's
  "row as today" rule. The alternative (archive skips still-unclassified rows on the first pass)
  was REJECTED: `boxArchiveEvidence` only runs per-intake-email + via the manual lever, so there is no
  guaranteed later archive run per case and skipping would strand genuine photos out of the Box archive
  after any transient AOAI failure (a Box-mirror recall regression).
- **Deliberately NOT role-aware.** A classified-'other' crop is stored as role `unknown` (the domain
  choice-set has no `other` row — `imageRoleCodec` coalesces it), which is indistinguishable from
  not-yet-classified; filtering on role would strand real photos. `excluded` is the one deliberate,
  auditable, staff-reversible discriminator (un-excluding a row makes the next archive run pick it up).
- Offline pin: NEW `api/src/functions/internal-archive-evidence.test.ts` (3 tests — the four-condition
  predicate incl. `excluded = false`, row passthrough, 400 guard).

### 2. Classifier-gated suppression for extraction crops (orchestration)
`orchestration/src/lib/image-classify.ts` `classificationToEvidenceFields` gains an options param
`{ nonVehicleExcluded?: boolean }`: when set and the classification is non-vehicle **`other`** (and not
person-reflection, which keeps precedence + its own reason), the mapping returns
**`excluded: true, exclusionReason: 'non-vehicle image detected (auto-classified)'`** (user-legible,
parallel to the person-reflection wording). `extractImages` passes the option — **extraction lane
ONLY**: a non-vehicle crop from INSIDE a document adds nothing (the document itself is already
evidence), whereas a DIRECT email/Box image attachment classified 'other' (e.g. a photographed V5C)
may be genuine correspondence, so `classifyPersist` / `box-classify-sweep` / `evidence-backfill` keep
today's visible-but-not-accepted semantics. A classify failure never reaches the mapper (classifyImage
never-throws → null → the row persists role-unknown, NOT dropped, exactly as before TKT-064).
Observability: the `extractImages` summary event now carries **`excludedNonVehicle`**.
**AOAI cost: ZERO new calls** — extraction crops have classified inline since TKT-064
(`IMAGE_ROLE_CLASSIFY_ENABLED=true` live); volume for context: the PDF lane produced ~4,129 rows in the
7 days to 2026-07-09 (~590/day, ~$1.40/day at TKT-131's ~$0.0024/image), unchanged by this fix; the
engine retune (below) slightly REDUCES it (suppressed crops never reach the pipeline).
Offline pins: `image-classify.test.ts` (+3 mapping tests incl. recall guard over all three vehicle
roles) and NEW `orchestration/src/functions/activities/extractImages.test.ts` (5 tests through the
REAL mapping: 'other'→excluded+reason; vehicle crop accepted+not-excluded; classify-null fail-open;
gate-off never calls the classifier; the excludedNonVehicle counter).

### 3. Threshold supplement (sibling-first per ADR-0018 — NOT the sole fix)
Sibling `cedocumentmapper_v2.0` commit **`79efe22`**, annotated tag **`engine-v2.15`** (branch
`feat/tkt043-open-case-ref-context`, **branch + tag pushed to origin**): `_BANNER_ASPECT_RATIO`
**3.5 → 3.2** (short-side cap 240 px unchanged) — deterministically suppresses the recurring QDOS
Assistance letterhead logo (575×174 = 3.305) engine-side, independent of AOAI health / per-provider
`ai_allowed` opt-outs. Recall analysis: photos are ≤ ~1.8:1 (21:9 crop ≈ 2.33); a genuine 3.2:1 pano
carries a short side far above 240 px. The **204×204 MGAA square badge is deliberately NOT
shape-caught** (the verifier's judgement: a small square is indistinguishable from a small genuine
photo) — it stays engine-kept and the classifier lane (#2) owns it; a sibling pin documents that
division of labour. Sibling fixtures: 575×174 suppressed (unit matrix + PDF-extraction param),
768×240 / 767×240 inclusive-boundary pair, 204×204 kept. Sibling suite **452 passed / 5 skipped**
(all skips environmental). **Re-vendored** into `functions/parser/cedocumentmapper_v2/` per the
PROVENANCE mirror loop — only `application/service.py` changed; drift guard green; PROVENANCE.md
history + Cut-from updated to `engine-v2.15`. The parser deploy **rides the already-vendored
`engine-v2.14`** (TKT-147 Tractable `two_label_join` + VIN envelope — additive, EVA export
byte-stable, no DDL dependency; live was v2.13). Email-lane lockstep:
`orchestration/src/lib/image-sniff.ts` `BANNER_ASPECT_RATIO` 3.5 → 3.2 (+ test boundaries updated,
575×174 flagged, 204×204 documented classifier-owned).

### Suites / gates
- orchestration **296/296**, api **415/415** (vitest); parser Function **283 passed / 11 skipped /
  1 failed** — the failure is the documented pre-existing environmental
  `test_multiformat_extraction[ALS_doc]` on this Windows box (identical pre-change; memory:
  windows-parser-test-preexisting-failures), which also keeps `verify-all.mjs` at its known baseline
  (parser gate FAIL environmental, all other gates pass).

### Deploys (2026-07-10 ~17:25–17:35Z, Windows func per the deploy playbook)
- `cespk-api-dev` (96 functions), `cespk-orch-dev` (74), parser
  `cespike-parser-dev-x7xt3d5ovhi7y` (4, `--build remote`) — **counts unchanged** (modifications
  only), all three **Running** (ARM), post-deploy App Insights: api 49 reqs / 0 5xx / 0 exceptions,
  orch 20 / 0 / 0, parser `extract_images` 2/2. `mcp__azure__get_azure_bestpractices` consulted
  pre-deploy. LIVE_FACTS.json + live-environment.md updated (counts/timestamps + narrative).

### Live re-proof (the verifier's probe, re-run post-deploy)
- **Engine probe:** both named samples POSTed to the live `/extract-images`
  (`test-cases-and-data/QDOS261608/.../42117_1_LtrtoEngineerIn.pdf` and
  `docs/tickets/to-distill/audits/report-and-audit-report/LtrtoEngineerIn.pdf`) → **HTTP 200,
  count = 1 each** (was 2/2): the QDOS logo (10,720 B png) is **gone**; only the MGAA badge returns
  (28,728 / 29,026 B jpeg) — by design, it is classifier-owned downstream.
- **Mirror-filter probe (excluded-and-not-mirrored, live):** Postgres recon found A.QDOS26009 holding
  exactly 1 excluded unmirrored blob row — **the QDOS logo itself** (10,738 B, cleanup-excluded
  2026-07-09) — plus 1 legit unmirrored 19.1 MB `message.eml` (pre-TKT-142 stranding). The keyed
  `box-archive` lever completed **`{uploaded: 1, total: 1}`**: the excluded logo was **not selected**
  (`box_file_id` still NULL, `updated_at` untouched) while the `.eml` mirrored via the TKT-142
  streamed lane (box file `2339522313264`) — the mirror filter and the mirror-still-works recall
  proof in one run. Pre-fix, `total` would have been 2 and the logo would have been pushed to Box.
- **Forward-window baseline (the queued SQL, run):** since 2026-07-09, **40** suspect-class extraction
  crops (logo 10,720/10,738 B png + badge 28,728/29,026 B jpeg across ~18 QDOS cases, plus a
  30,057 B DFD-form class), **38 already in Box, 0 excluded** — the quantified pre-fix leak, newest at
  2026-07-10T14:16Z (all pre-deploy). Transient FW rules `tkt089-reprobe-*` created + trap-deleted.
- **Queued (needs the next natural QDOS letter intake, post-17:35Z):** expect NO `img_1_1` logo row at
  all (engine), the badge row persisted `excluded=true` with the auto-classified reason and never
  mirrored, and `excludedNonVehicle ≥ 1` on the case's `extractImages` App Insights event.

NOT done here (dispatcher-owned): the fresh verifier pass (verdict stays PENDING) and any ticket
status move.

## Regression follow-up

- [2026-07-11 evidence recall and durable review controls](./changes-regression-11-07-26.md)

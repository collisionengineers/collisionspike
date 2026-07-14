# Verification — TKT-047

## Verdict
PENDING

Verified by: ticket-verifier dispatch, 10-07-26 (verdict block transcribed 1:1 below). The email-lane
floor is provably acting on live mail (71 skips today); the 2026-07-08 coverage fix (banner-aspect +
GIF/BMP rungs) is deployed but has not yet been exercised by a qualifying live attachment. Decisive
remaining artifacts: the "zero new signature files reached Box" data pass (Q1–Q5, queued for W2) and
one live banner-rung firing (or the Q1/Q2 zero-leak result standing in for it).

## Ticket-verifier verdict (transcribed 1:1, dispatch of 2026-07-10)

### Verdict
PENDING

(Not FAILED — no readable surface contradicts the fix, and the email-lane floor is provably acting on
live mail today. Not VERIFIED-LIVE — the two decisive forward-behavior artifacts are still
ungathered: a live banner-rung exercise, and the "zero new signature files reached Box" data pass,
which is Postgres-gated from this workstation.)

### Evidence
1. **Original raster floor deployed and acting live — VERIFIED-LIVE at line level.** Kill switch
   GRAPH_IMAGE_FLOOR_DISABLED absent on cespk-orch-dev. AppTraces daily skips 2026-07-07→10 =
   17/11/16/**71**, e.g. `[graph] skipped attachment "image001.png" — likely signature/logo image
   (dimensions 140x78)` at 2026-07-10T15:48:29Z — real inbound mail, today.
2. **Above-floor banner heuristic + GIF/BMP sniff (the 2026-07-08 FAILED-live coverage fix) is
   deployed** — image-sniff.ts carries BANNER_ASPECT_RATIO=3.5 / BANNER_MAX_SHORT_SIDE=240 + GIF/BMP
   sniffers; committed 9fee9f6 (2026-07-09); deploy/orch/main.cjs contains `banner shape` (2 hits),
   republished 2026-07-09 + 2026-07-10 (orch 74 fns per registry) — the live build carries the rung.
3. **Skip traces distinguish rungs / heuristic pins** — verifier re-ran the orch suite: 284/284
   passed, incl. the banner matrix (600x150/900x180/150x800/840x240 flagged; photo shapes kept) and
   GIF/BMP dims-win-over-byte-floor.
4. **Parser/PDF lane** — the vendored engine carries the identical heuristic constants; live parser
   runs engine-v2.13 (heuristic entered at v2.11) — included. (Repo vendored at v2.14, not yet
   deployed — expected, not a gap here.)
5. **Historical cleanup** — recorded live-verified in TKT-089's verification.md 2026-07-09 (163 rows
   excluded, residual suspects 0).
6. **New rungs not yet exercised live** — KQL 2026-07-09T06:30Z→now: zero `banner shape` /
   `byte-size` / .gif/.bmp skips; all 98 post-07-07 skips are area-floor. Absence of stimulus, not
   proof of function — only the data pass can close this.

### Pending / gaps
Expected absences (not bugs): no wide-banner/GIF/BMP signature has arrived since the deploy; the
Postgres forward sweep is firewall-gated (queued Q1–Q5: leak detector, window summary, PDF-lane
residual, forward exclusions, recall guard); Box case-folder descent is outside the root-only
allowlist. No real bugs observed on any readable surface.

### How to re-verify
Rung breakdown KQL (AppTraces, rung = banner-shape / byte-floor / area-floor by day); the banner
watch (`Message contains "banner shape"`) — or a real email carrying a ~600x150 PNG signature to an
intake mailbox; the kill-switch read; Q1–Q5 as csadmin; `npm --prefix orchestration test` (284/284).

### Confidence + unread surfaces
High confidence the coverage fix is deployed and the floor is live. Medium on forward behavior
overall: unread — Postgres (queued), Box case folders (allowlist), the banner rung's live behavior
(no qualifying attachment yet; sampling could in principle hide sparse traces). Sibling parser pytest
not re-run (known environmental ALS_doc failure on this box).

## Orchestrator data-pass W2 — pending

Results (run 2026-07-10, transient window trap-deleted):

- **Q2 (window summary — the NAME-based signal): name_suspects 0, suspects_live_in_box 0** of 1,160
  new image rows since the deploy. ✓ The classic signature-name class has NOT leaked to Box at all.
- **Q1 (name-OR-size detector):** 50 suspect rows / 47 in Box — with name_suspects=0 (Q2), all 50
  are SIZE-only catches (1–25KB images from any lane). Ambiguous predicate, not proven leaks (small
  bytes ≠ signature; the floor is dimension-based and email-lane-only). Eyeball next sweep.
- **Q3 (PDF-lane residual, size-based): 208** — same ambiguity (compressed extractions land <60KB);
  includes the 67 pre-fix TKT-090 rows from 12:12Z 07-09. Same disposition as Q1.
- **Q4 (forward exclusions):** 6 stamped on 2026-07-10 — classifier lanes still catching. ✓
- **Q5 (recall guard):** 744 kept images (>100KB), 671 mirrored — the floor is not over-firing. ✓

Verdict stands: PENDING — the name-class leak signal is clean (Q2 = 0) and recall healthy; remaining
= the banner rung's first live firing, or an eyeball pass over the 50 size-only Q1 rows.

## Prior verdict history

### Verdict update — 2026-07-08
FAILED (live) — operator report 2026-07-08: signatures still being picked up and filed to Box from
many emails. Email-lane floor provably acting (221 skip traces), so the leak pointed at above-floor
signature images and/or the PDF-extraction lane. Reopened verify->now for the coverage fix.
Verified by: operator report transcribed by the orchestrating session, 2026-07-08.

## Verdict update — 2026-07-14 (independent PLAN-005 sweep; transcribed verbatim)

## Verdict

PENDING

## Evidence

- Wanted line 25 (extend the inline skip for non-inline raster images): `cespk-orch-dev` is Running;
  `GRAPH_IMAGE_FLOOR_DISABLED` is absent. Fresh App Insights evidence from **2026-07-10T17:55Z onward**
  shows **29** real `[graph] skipped attachment` events through 2026-07-13, including `image001.png`
  140×78, 40×37 images, `image001.jpg` 95×97, and B64image PNG/JPEG files. This is VERIFIED-LIVE for the
  small-raster floor acting before persistence.
- Wanted line 26 (pixel-area semantics; unknown dimensions kept): fresh focused run
  `npm --prefix orchestration test -- image-sniff` → **51/51 passed**. The suite pins area-floor behavior,
  unknown-dimension retention, and the recall guard. This line is TESTED (offline), with the area-floor arm
  additionally live-observed.
- Wanted line 27 (header sniff + byte fallback at message fetch): the same 51-test suite covers PNG/JPEG
  plus the 2026-07-09 GIF/BMP and banner-aspect follow-up, malformed headers, and dimensions winning over
  byte fallback. The live 29-event window exercised only the ordinary `dimensions WxH`/area-floor rung:
  **zero `banner shape`, byte-floor, GIF, or BMP rung fires** were observed.
- Wanted line 28 (signatures never become evidence or reach Archive): the last readable DB pass on
  2026-07-10 recorded **0 classic signature-name suspects and 0 such suspects in Archive** among 1,160 new
  image rows, but also 50 ambiguous size-only suspects / 47 mirrored. A fresh post-10-Jul DB census was
  attempted twice through the approved read-only Azure PostgreSQL path and stopped under the two-strikes
  rule: `Failed to connect to 51.142.242.153:5432`. Therefore there is no current data/Archive artifact
  proving the universal "never reaches" clause after the 29 live skips.
- The 2026-07-08 operator failure is incorporated: above-floor banners and GIF/BMP gaps were fixed/deployed
  in v2.15. However, the registry's last relevant live deploy remains v2.15, while TKT-089's current v2.16
  panoramic-photo regression repair is explicitly `TESTED (offline) — deployment pending`
  (`verification.md:178–198`), so source/live parity is not current.

## Pending / gaps

- No fresh post-10-Jul evidence/Archive census; direct case-folder descent was intentionally not performed.
- No live stimulus has exercised the banner, GIF/BMP, or byte-fallback rungs after the Jul-8
  failure/follow-up.
- Current main's v2.16 image-filter behavior is not yet the deployed live behavior.

## How to re-verify

- After an allowed DB route is available, rerun the bounded post-`2026-07-10T17:55Z` census for
  signature-name and size suspects, direct-email provenance, `excluded`, and `box_file_id`; inspect only
  any returned suspect rows within the explicitly approved Archive scope.
- Observe a natural real inbound above-floor PNG/JPEG banner or GIF/BMP signature and require a
  corresponding skip trace plus no evidence row/Archive file. Do not manufacture or send a production test
  email.
- Deploy the reviewed v2.16 repair first if main/live parity is required, then repeat the forward check.

## Confidence + unread surfaces

High confidence in PENDING. Live telemetry proves the original area floor is actively skipping
signature-like attachments, and no fresh evidence contradicts the fix. Unread/unevidenced surfaces are the
post-10-Jul Postgres/Archive census, the new rungs' natural live behavior, and v2.16 live parity.

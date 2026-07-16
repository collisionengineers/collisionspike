# TKT-054 — changes made

> Rulings: [020726 review](../../../reviews/020726/decisions.md). Live state:
> [the registry](../../../operations/live-environment.md).

## 2026-07-02 — built + DEPLOYED (operator items remain — see verification)

**Backend**
- `da0571b` fix(intake): `source_mailbox` now stores the mailbox **UPN** — Graph
  change notifications echo the mailbox object-id GUID; `fetchMessage` +
  `graph-lifecycle` resolve the subscribed UPN via `GET /subscriptions/{id}`
  (memoised, never blocks intake). Root cause of every chip reading "Other source".
- `751768f` feat(inbox): inbound list LEFT JOINs `case_` for **`casePo`**;
  `bodyJobref`/`conversationId` mapper gap closed.
- `bb999d4` feat(inbox): **gated Outlook filing** — SPA button → Data API
  `POST /api/inbound/{id}/outlook-move` (server-derived folder, audit, 409 while
  gated) → `outlook-move` storage queue (MSI REST enqueue) → orch mover (resolve
  by `internetMessageId`, walk/create Inbox child folders, `/move`) → outcome
  write-back (`moved` flips new→actioned). +`GET /api/gates/outlook-move`;
  `inbound_email.outlook_move_*` columns + audit codes 100000039–41.

**SPA**
- `eef56c0` pure modules: e-mail-type filter + earlier-URL migration
  (`?type=`/`?dismissed=1`), status-cell model, suggested-action model.
- `659ecda` Inbox rework: category tabs / Triage-status links / Show toggle /
  subtype dropdown REMOVED; one list (all except dismissed, handled muted,
  Show-dismissed switch); **E-mail type** rename + per-category icons; **all
  strength UI removed** (020726 E3); VRM|Ref split; status
  "Case created / Linked to case · CCPY26050 →" links; Suggested-action column.
- `653d54c` Dashboard inbox panel: 2×2 equal tiles, flush-right chevrons; deep
  links moved to `?type=` (earlier URLs still migrate).

**2026-07-03 — regressions round 2 (operator flagged: panel still looked broken)**
- The first pass re-gridded only the four inbox tiles — but the regression
  screenshot's red circle covered the **whole right column**, and the
  "Today / this week" block below was left on the old `flex-wrap` strip
  (3 min-180px cells + a floating min-180px all-time box), which still wrapped
  unevenly at side-column widths — visually identical to the "before" shot.
- Fix: the throughput block is now the **same 2×2 equal grid** as the inbox
  tiles (In today / Submitted today / Cleared this week / Sent to EVA), all
  four cells one anatomy; the lifetime cell keeps its charcoal identity rail
  + an "All time" caption in the chevron slot so a lifetime total is never
  read as windowed. Labels ellipsize instead of wrapping.
- Verified by **rendering, not inspection**: a throwaway local harness mounted
  the real Dashboard with screenshot-matching counts (85/41/50/171, thru
  6/0/0) and headless-Chromium screenshots at 1920×1080 and 1280×900 showed
  both regions aligned on shared tracks with no wrap. SPA redeployed
  (bundle `index-B-vxJJzr.js` live).

**2026-07-03 — regressions round 3 (operator screenshot: labels chopped at a
restored-down ~1280 window)**
- Round 2 verified the grid but chose `text-overflow: ellipsis` for tile
  labels — at the operator's real (non-maximised) window width that rendered
  "Receiving …" / "Needs sort…": the label-doesn't-fit bug in a new outfit.
- Fixes: tile + throughput labels now **wrap up to 2 lines** (line-clamp)
  instead of truncating; `gridAutoRows: 1fr` keeps cells equal when one
  wraps; the "All time" caption moved from the chevron slot to a sub-line
  under "Sent to EVA" (it crowded the cell when narrow); and the cockpit's
  two-column breakpoint moved **992 → 1200px** — below that the side column
  is too narrow for any label treatment, so the panels stack full-width.
- Verified in the harness with the operator's own screenshot counts
  (142/65/68/265, 58 in today) at 1024 (stacks, full labels), 1210 + 1280
  (two columns, whole-word wraps), 1920 (single-line labels). Deployed
  bundle `index-_PzfPvQC.js` confirmed live byte-identical (sha256).

**2026-07-03 — regressions round 4 (operator: STILL a UI error — at MAXIMIZED 1920,
not 1280)**
- Rounds 2–3 chased label truncation in the narrow ~1280 two-column band — the
  **wrong condition**. The operator runs Chrome **maximized (1920)**; live
  inspection of the round-3 build at that width showed the real defect: the right
  column ended after "Today / this week" and left a tall empty **void** down the
  rest of the page beside the long needs-action list — exactly what
  `regressions/1.png` circles. Labels already fit at 1920; the void was the bug.
- Fix (operator-chosen, direction A): a third right-column `<section>` — a
  **Queues snapshot** (Not ready / Review / Held, from the existing `useDashboard`
  `liveCounts`; each row deep-links its queue via the funnel/held routes) —
  reusing the `InboxTile` anatomy in a single-column stack (`queueList`). Fills
  the void; the column now reads intentional and balances the left list. The
  `cockpitGrid` 1200px breakpoint + 3fr/2fr ratio are **unchanged** (purely additive).
- Verified by rendering at the operator's REAL condition: deployed bundle
  `index-BbQFemVH.js` at **maximized 1920 on live data** — the right column now
  runs INBOX → TODAY/THIS WEEK → QUEUES (Held row bottom ≈ the left "Show all 100"),
  void gone. `npm run build` + SPA vitest green; live CSP header verified. (Narrow
  band reasoned, not re-rendered — live width-control unavailable this session;
  additive change + short queue labels.)

**Live (2026-07-02 ~16:00Z)**
- DDL delta `2026-07-02-tkt054-outlook-move.sql` APPLIED; backfill
  `2026-07-02-tkt054-source-mailbox-backfill.sql` RUN — 264 `inbound_email` +
  113 `case_` rows GUID→UPN (engineers@ 120 / info@ 78 / desk@ 69; zero
  non-address values remain).
- Deployed: orch **53** functions (+`outlook-move`), api **72** (+3 routes),
  SPA rebuilt + CSP re-verified. Api MI granted Storage Queue Data Message
  Sender on `cespkorchstdev01`; `OUTLOOK_MOVE_QUEUE_SERVICE_URL` set;
  **`OUTLOOK_MOVE_ENABLED` absent (dark)** pending [ticket board B4](../../BOARD.md).

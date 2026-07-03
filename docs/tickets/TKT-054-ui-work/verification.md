# TKT-054 — verification

> Filled as slices deploy. **The Outlook move is operator-live-tested only** —
> no automated live move (operator ruling, 020726 E6).

## Planned checks

1. Function counts non-zero post-deploy (orch/api; bundle-crash signature is 0).
2. Fresh email → `inbound_email.source_mailbox` holds the UPN (psql; App
   Insights `evt:fetchMessage` shows the resolved mailbox).
3. Backfill: zero non-address `source_mailbox` values in `inbound_email` and
   `case_`.
4. `GET /api/inbound?view=all` → linked rows carry `casePo`;
   `GET /api/gates/outlook-move` → `{enabled:false}` until consent; move POST →
   409 while gated.
5. SPA vitest suites (inbox-status / inbox-email-type / inbox-suggested-action,
   banned-word sweeps) + `node verify-all.mjs` red-budget gate.
6. Live SPA: mailbox chips named info@/engineers@/desk@; single condensed list;
   VRM|Ref columns; no strength UI; status links open the case; suggested-action
   column display-only while gated; legacy `/inbox?category=…&view=…` deep links
   rewrite to `?type=…`; dashboard tiles 2×2-aligned at ~1024/~1440.
7. Operator: Mail.ReadWrite re-consent → `OUTLOOK_MOVE_ENABLED=true` → live move
   test → mark E6 verified here.

## Results — 2026-07-02 deploy pass

1. ✅ Function counts post-deploy: orch **53** (incl. `outlook-move`), api **72**
   (incl. the 3 outlook routes) — non-zero, no bundle crash.
2. ⏳ Fresh-email UPN check: awaiting the next live email (the code path is
   deployed; one pre-fix `desk@` row already reads as an address). App Insights
   `evt:fetchMessage` now logs `mailboxVia`.
3. ✅ Backfill: 264 `inbound_email` + 113 `case_` rows GUID→UPN; **0**
   non-address values remain in either table (psql verified).
4. ✅ API posture: `/api/inbound` + `/api/gates/outlook-move` → 401 unauth;
   outlook-move POST route registered (GET → 404 as expected, POST-only).
   Authenticated `casePo`/gate reads: verify in the SPA click-through (5/6).
5. ✅ `npm test` suites green (1439 across workspaces incl. the new
   inbox-status / inbox-email-type / inbox-suggested-action + banned-word
   sweeps); `verify-all.mjs` red-budget gate PASS; `VERIFY_LIVE=1` registry
   drift PASS @ 2026-07-02T16:05Z. (Known unrelated: 2 pre-existing parser
   pytest failures — multiformat `.doc`/`.eml` fixtures, predates TKT-054.)
6. ⏳ **Operator click-through** (SPA was redeployed + CSP verified; visual
   pass needs a signed-in staff session): mailbox chips read info@/engineers@/
   desk@; single condensed list; VRM|Ref columns; no strength UI; status links
   open the case; Suggested-action column display-only while gated; legacy
   `/inbox?category=…&view=…` deep links rewrite to `?type=…`; dashboard tiles
   2×2-aligned.
   **⚠ 2026-07-03 correction:** the first pass claimed the dashboard panel
   fixed when only the inbox tiles were re-gridded — the "Today / this week"
   block still wrapped like the "before" screenshot (operator caught it).
   Round 2 re-gridded the throughput block to the same 2×2 and verified it by
   rendering the real Dashboard in a local harness (headless-Chromium
   screenshots at 1920×1080 + 1280×900: both regions on shared tracks, no
   wrap, all-time cell railed + captioned). New bundle `index-B-vxJJzr.js`
   confirmed live. Operator re-check requested.
   **⚠ 2026-07-03 round 3:** operator screenshot (restored-down ~1280 window)
   showed labels ellipsized mid-word ("Receiving …", "Needs sort…") — the
   round-2 ellipsis traded wrapping for truncation. Now: labels wrap ≤2 lines,
   equal-height cells, All-time caption as a sub-line, and the two-column
   cockpit breakpoint raised 992→1200px (below it the panels stack). Harness
   re-verified at 1024 / 1210 / 1280 / 1920 with the operator's own counts;
   bundle `index-_PzfPvQC.js` live (sha256-matched). Operator re-check
   requested at their normal window size.
   **✅ 2026-07-03 round 4:** operator re-checked and reported the UI error
   **persists at MAXIMIZED 1920** (not ~1280) — rounds 2–3 had chased the wrong
   condition (label truncation in the narrow band). The true defect, seen live at
   1920 on real data, was the right-column **dead-space void** below Today/this-week
   (regressions/1.png). Fixed by a new **Queues snapshot** section (Not ready /
   Review / Held) filling the column. Deployed bundle `index-BbQFemVH.js`; verified
   live at maximized 1920 (void gone, columns balanced); build + SPA vitest + live
   CSP green. Memory corrected: operator runs **maximized 1920**, verify there first.
7. ⏳ **Operator (gated.md B4)**: Mail.ReadWrite Exchange-RBAC re-consent →
   `OUTLOOK_MOVE_ENABLED=true` on both apps → **live-test the move yourself**
   (no automated live move was or will be run) → record here.

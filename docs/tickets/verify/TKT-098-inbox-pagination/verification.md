# Verification — TKT-098: Inbox pagination (15/page)

## Verdict
CODE-COMPLETE + functionally verified in a real browser (dev harness). Awaiting live/operator proof on
the deployed SPA (`cespk-spa-dev`) — deliberately NOT deployed from the feature branch. Status: `verify`.

## Offline gates (2026-07-08, worktree `feat/tkt-098-inbox-pagination`)
- `npm --prefix mockup-app test` → **293 passed / 20 files** (incl. the new `inbox-pagination.test.ts`).
- `npm --prefix mockup-app run build` (`tsc -b && vite build`) → **clean** (only the pre-existing
  >500 kB single-chunk warning, unrelated to this change).

## Functional acceptance (browser, chrome-devtools-mcp)
Driven against a dev-only harness that mounts the real `Inbox` screen (no MSAL) with a mock seam seeded
to 42 inbound rows across info@/engineers@/desk@ (harness NOT committed). Every acceptance item passed:

- **15-cap:** page 1 shows exactly rows #1–#15; pager reads "1–15 of 42 emails"; First/Prev disabled,
  Next/Last enabled.
- **Paging:** Next → "16–30 of 42" (#16–30); Last → page 3 "31–42 of 42" (12 rows, Next/Last disabled);
  First/Prev return correctly. Row numbers strictly ascending #1..#42 across pages → **sort preserved**.
- **Mailbox chip resets + hides pager:** from a later page, picking `info@ (14)` refilters to 14 rows,
  resets to page 1, and the pager **disappears** (≤1 page); "All (42)" brings it back at page 1. The
  "All (N)" badge stays the full 42 (unpaged), independent of the page window.
- **Search / e-mail-type reset to page 1** with the pager total updated.
- **Dismiss does NOT reset the page:** on page 2, dismissing a row keeps you on page 2, drops the total
  42→41 ("16–30 of 41"), and focus lands on the correct next row (verified via `document.activeElement`).
- **Clamp:** dismissing every row on the last page shrinks it and cleanly clamps to a valid, non-blank
  page.
- **a11y:** `nav aria-label="Emails pages"`; range `role="status" aria-live="polite"`; four aria-labelled
  buttons; disabled bounds out of tab order. **Boundary focus** verified: after Last, focus = "Previous
  page"; after First, focus = "Next page" (no drop to `<body>`).
- **Console:** no new errors during interaction (only harness-only React-Router future-flag warnings +
  a favicon 404).

## Review
general-purpose review gate verdict: **PASS-WITH-NITS** (no blockers/majors; clean code review). The two
nits — (1) boundary focus dropping to `<body>`, (2) post-dismiss focus landing on the search box — were
both **fixed** and re-verified in the browser. Nit 2's root cause was a pre-existing stale-`setTriage`
closure in the memoized `columns` (see changes.md), fixed via `filteredRef`.

## Pending / gaps (for `verify` → `done`)
- Live proof on the deployed SPA with real inbox data (>15 rows): confirm the pager, the chip-reset, and
  cross-page dismiss/focus behave as above. Not deployed from the branch — operator/PR-merge deploy.

## How to re-verify
- Inbox shows at most 15 emails per page with a working pager.
- Mailbox-chip filter + actions behave correctly across pages; sort preserved.
- Filter change resets to page 1; dismiss keeps the page; the pager hides when the list fits one page.

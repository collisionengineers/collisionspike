# Verification — TKT-098: Inbox pagination (15/page)

## Verdict
DONE — merged (PR #44) and **deployed live to `cespk-spa-dev` on 2026-07-08**. The live bundle is
byte-identical to the reviewed + functionally-verified code (asset hash `index-naq92Vhi.js` served), the
app boots healthy (200 + CSP intact + MSAL sign-in redirect), and the pager was functionally verified
pre-deploy against the real `Inbox` component. Status: `done`.

## Live deployment (2026-07-08)
- **Merged:** PR #44 → `main` (merge commit `001a2f7`).
- **Built (Windows):** `npm run build` in `mockup-app/` → clean; `.env.production` values confirmed baked
  into the bundle (API host + Entra client-id present — guards the 2026-07-02 blank-first-paint class).
- **Staged:** `staticwebapp.config.json` copied into `dist/` (ships the strict CSP + SPA nav fallback).
- **Deployed (WSL):** `swa deploy ./dist --env production` → `cespk-spa-dev` → "Project deployed 🚀".
- **Live smoke (`https://proud-sky-04e318b03.7.azurestaticapps.net`):**
  - `GET /` → **HTTP 200**; `Content-Security-Policy` header present, matching `staticwebapp.config.json`.
  - `index.html` serves the new build hash **`assets/index-naq92Vhi.js`** — the TKT-098 code is live.
  - Browser boot: app initialises MSAL and redirects to the Entra sign-in gate (client-id `30ff23e0…`,
    tenant `858cf5b3…`, scope `api://fa2fb28c…/access_as_user`) — no blank crash.

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

## Post-deploy watch (optional, operator — not an open blocker)
- With >15 real inbound rows on live, glance that the pager, chip-reset, and cross-page dismiss/focus
  match the pre-deploy proof above. This is inherently sign-in + data-gated (needs staff auth and live
  intake volume). Pagination runs on the in-memory `filtered` list — source-agnostic between the mock
  harness and the live REST seam — so bundle-identity + the harness proof already cover the behaviour;
  a live discrepancy would reopen this.

## How to re-verify
- Inbox shows at most 15 emails per page with a working pager.
- Mailbox-chip filter + actions behave correctly across pages; sort preserved.
- Filter change resets to page 1; dismiss keeps the page; the pager hides when the list fits one page.

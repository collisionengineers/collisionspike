# Verification — TKT-025: Mark + filter inbox by source mailbox (info/engineers/desk)

## Verdict
CODE-COMPLETE, NOT CONFIRMED LIVE

## Evidence
Built 2026-07-02 (rules-engine-v2 Phase 5): the Inbox toolbar now renders a source-mailbox facet-chip row (`apps/web/src/features/inbox/Inbox.tsx`, styles/markup copied from `CaseList.tsx`'s reason-facet chips), backed by a new pure module `apps/web/src/features/inbox/inbox-mailbox-filter.ts` (`mailboxFacets`, `mailboxChipLabel`, `matchesMailboxFilter`; unit-tested in `inbox-mailbox-filter.test.ts`). One chip per **distinct `sourceMailbox` value present in the rows already loaded** for the active category/Show-view — labelled by local part (e.g. `info@`) when it reads as a real address, with a live count; multi-select (OR filter across selected chips); none selected = all sources. Wholly **client-side**: no API change, no hard-coded mailbox list (a chip only exists if a loaded row actually carries that mailbox) — a server-side facet/count parameter is the documented scale follow-up once the inbox routinely holds more rows than a page comfortably loads. Wired into the existing search/subtype/triage-state filtering pipeline and the "no rows match the current filters" empty-state hint. `npx tsc -b`, `npx vitest run` (247 tests), and `npm run build` all green from `apps/web/`.

## Pending / gaps
- **Not yet confirmed against the live Azure SPA/API** — built and verified locally only (unit tests + a local `npm run dev` pass); no live click-through has been run yet. That is what the script below is for.
- The ticket's "marker" acceptance criterion ("each inbox item shows which source mailbox it arrived through … distinguishable at a glance") is satisfied here at the **toolbar/category level** (the chip row tells staff, at a glance, which mailboxes are represented in the current view, and lets them isolate one) — not by a **per-row** badge/icon added to every grid row. A per-row marker was not part of the build instructions for this pass; the email preview panel and the "Open in mailbox…" dialog (both pre-existing, unchanged here) already surface the exact `sourceMailbox` for a row once it's opened. If a literal per-row grid marker is still wanted on top of the toolbar chips, that's a follow-up, not covered by this change.
- Facet counts are scoped to the rows already loaded for the current category + Show view (client-side, per the design above) — with more than a page's worth of rows, a count reflects only what's loaded, not the true total for that mailbox.
- The development-only rows now live under `apps/web/src/__fixtures__/` (with the fixture entry point at `fixture-source.ts`) and use the three expected mailbox addresses. Production code cannot import those fixtures; the live API returns the mailboxes actually ingested.

## How to re-verify — operator click-through (live SPA)

**Prerequisites:** signed in to the live SPA (`https://proud-sky-04e318b03.7.azurestaticapps.net`) as a staff account holding the `CollisionSpike.User` (or `.Superuser`) app role; inbound email present from more than one source mailbox (check the registry — currently `info@`, `engineers@`, `desk@collisionengineers.co.uk`).

1. Open **Inbox** (`/inbox`). Directly under the category tabs, above the search/filter toolbar, look for a row labelled **MAILBOX**.
   **Expect:** one chip per distinct source mailbox among the rows currently loaded for this category + Show view (e.g. `info@ (4)`), each showing a live count. If only one mailbox is represented, only one chip shows — that's correct, not a bug. If NO chip row appears at all, either the category is empty or every loaded row has a blank/unreadable `sourceMailbox` — note which.
2. Switch category tabs (e.g. Receiving work → Queries) and re-observe.
   **Expect:** the chip set and counts change to match the new tab's loaded rows; a mailbox absent from this category simply has no chip; any previously-selected chip is no longer highlighted (the filter resets on tab change).
3. Click one chip (e.g. `info@`).
   **Expect:** it switches to the selected (dark) state with a pressed appearance; the grid narrows to only rows from that mailbox; the "N of M email" count above the grid updates to match.
4. With that chip still selected, click a **second** chip (e.g. `engineers@`).
   **Expect:** rows from **either** selected mailbox now show (OR, not AND) — this is deliberately multi-select, not radio-button single-select.
5. Click a selected chip again to deselect it, then deselect the other too.
   **Expect:** deselecting one chip brings its rows back into the (still-filtered) view; with **no** chips selected, every mailbox's rows show again ("multi-select-none = all").
6. Select one chip, then type something in the search box that matches nothing in that mailbox's rows.
   **Expect:** the empty state reads "No email matches the current filters." with the hint "Clear the mailbox chip, search box or dropdowns to widen the results." — confirms the mailbox filter is wired into the same empty-state logic as the other filters, not silently producing a blank screen.
7. Clear the search box. Tab to a chip using the **keyboard only** (no click) and press **Space** or **Enter**.
   **Expect:** the same toggle behaviour as a click, and a visible focus ring on the chip while it's focused.
8. Switch the **Show** toggle between Active / Handled / All with a chip selected.
   **Expect:** the mailbox selection persists across a Show-view change (only a category-tab change resets it — step 2).

### What to record
- The exact chip labels + counts you saw for at least two different category tabs (paste a couple of examples) — this is the evidence for "the marker/filter source list follows the live mailbox set, not a hard-coded list": there should be no fixed `info@ / engineers@ / desk@` trio baked in if the live data happens to carry a different or additional address.
- Pass/fail for: multi-select OR-filtering (steps 3–5), the empty-state hint wording (step 6), keyboard operability + visible focus (step 7), and selection surviving a Show-view change but not a category change (steps 2 and 8).
- Any chip labelled **"Other source"** instead of a `local-part@` label — that means a loaded row's `sourceMailbox` didn't read as a real address (blank, or no `@`). Note the row's Subject/From so it can be investigated; this should not happen for genuine Graph-ingested mail.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. Live signed-in SPA 2026-07-09: MAILBOX facet-chip row renders All + one chip per live mailbox with counts (All 738 / desk@ 259 / engineers@ 283 / info@ 196; sums match), per-item source line in the preview, filter-to-one-and-back proven with pager counts matching chips, keyboard reachable with the CE focus ring, honest empty-state with one Clear-filters action, and the chip set derives from data (re-derives under an E-mail-type filter; exactly the registry mailbox set, no extra mailbox chips, zero "Other source" fallbacks — the GUID→UPN backfill holds). Note: the deployed shape is the BINDING-REVIEW single-select chip row (020726 E1/E7), not the ticket's earlier multi-select-OR runbook — the runbook description is stale; the acceptance as written is satisfied.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.

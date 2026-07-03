# Verification — TKT-005: Make the inbox actionable (dismiss removes from view)

## Verdict
CODE-COMPLETE, NOT CONFIRMED LIVE

## Evidence
The dismiss-removes-from-view behaviour is coded and present in the live SPA bundle (commit `94902ce`). It is data-driven on `inbound_email` rows, which now exist again following the 2026-06-30 10:21Z clean-slate reset. The live e2e agent (2026-06-30) did NOT exercise the SPA UI, so there is no behavioural confirmation, and the operator reported it as NOT live.

Traced end to end for this runbook (rules-engine-v2 Phase 5 pass, 2026-07-02): `Inbox.tsx`'s three dismiss affordances all call `data.setTriageState(id, 'dismissed')` → `POST /api/inbound/{id}/triage` (`api/src/functions/inbound.ts`) → `UPDATE inbound_email SET triage_state = 'dismissed'` (a real Postgres column, `migration/assets/schema/120_inbound_email.sql`) **and** a `writeAudit()` call with action `inbound_dismissed` (audit code `100000027`, already live in the base schema — not one of the gated rules-engine-v2 codes). Both the SPA's default view and the API's own `inboundViewWhere` SQL exclude `dismissed`/`actioned` rows from the `active` slice, so this is a genuine server-side state change, not a client-only hide.

## Pending / gaps
Confirm in the live SPA that dismissing an email actually removes the row from the active view. No SPA UI test was run — the script below is what an operator should now follow to close that gap.

## How to re-verify — operator click-through (live SPA)

**Prerequisites:** signed in to the live SPA (`https://proud-sky-04e318b03.7.azurestaticapps.net`) as a staff account holding the `CollisionSpike.User` (or `.Superuser`) app role; at least one inbound email row available that is not already dismissed.

1. Open the left-nav **Inbox** link (`/inbox`). Confirm the **Show** toggle (top-right of the toolbar) reads **Active** (the default on plain navigation).
2. Pick any category tab with at least one row. Note the exact **Subject** and **From** of one row you're about to dismiss (you'll need to find it again in steps 6–8) and whether it is linked to a case (a case-linked row shows a "Preview case" quick action / "View case" menu item; an unlinked row shows "Open in mailbox…" instead).
3. Dismiss that row using ONE of the three affordances (repeat with a different row for each, if you want to exercise all three):
   - Hover the row → its **Dismiss** icon button appears in the row's quick actions → click it.
   - Click the row's **⋯ (More actions)** button → **Dismiss** menu item.
   - Click the row's Subject to open the email preview panel (right-hand sidebar) → the panel's **Dismiss** button.
4. **Expect immediately:** a success toast titled `Marked "Dismissed"` with the email's subject as the body; the row disappears from the grid; if the preview panel was open for that row, it closes (or advances to the next row).
5. **Reload the whole page** (hard refresh). **Expect:** with **Show: Active** still selected, the same row does **not** reappear — this is the actual bug TKT-005 fixes (the state must survive a reload via Postgres, not just vanish from local React state).
6. Switch **Show** to **Handled** (or **All**). **Expect:** the dismissed row reappears there with a "Dismissed" status badge, and its **⋯** menu now offers **Reopen** instead of **Dismiss**.
7. Open **Action logs** (left nav, under Admin — `/logs`). **Expect**, at or near the top of the newest-first list:
   - a description reading `Inbound email <previous-state> -> dismissed` (e.g. `Inbound email new -> dismissed`) in bold;
   - a **Status** badge — NOT a "Dismissed" badge (the `inbound_dismissed` audit action has no dedicated log category, so it groups under the generic "Status" kind; don't search for wording that doesn't exist);
   - an actor value matching your signed-in name/UPN (or "System" if the token carried no name claim);
   - a timestamp matching "now" (`DD/MM/YYYY HH:mm`);
   - a chevron/click-through to the case ONLY if the row was case-linked (step 2) — an unlinked row's audit entry is still written, just not clickable.
8. Optional (exercises the reverse path): from the **Handled** view, use **Reopen** on the same row. **Expect:** it returns to the Active view, and a second Action-logs row appears reading `Inbound email dismissed -> new`.

### What to record
- Which of the three dismiss affordances you used (step 3).
- Pass/fail for each of: toast text (step 4), row leaves the active grid (step 4), state survives a hard reload (step 5), row reappears under Handled/All with Reopen available (step 6).
- The **exact text** of the Action-logs row you found (badge, description, actor, timestamp) — paste it verbatim. `writeAudit()` swallows its own write failures server-side (logs to App Insights, never surfaces an error to the browser), so a **missing** log row is a silent audit failure a 200-looking dismiss would otherwise hide — treat "no matching row in the first ~10 entries of `/logs`" as a fail, not an inconclusive.
- Anything that reads differently from the above (wrong toast copy, row surviving reload, no log row, wrong actor).

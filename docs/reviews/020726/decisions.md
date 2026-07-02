# Inbox simplification decision register — 2 July 2026

Operator rulings distilled from ticket
[TKT-054](../../tickets/TKT-054-ui-work/TKT-054-ui-work.md) (three drop-stubs +
screenshots, plus four explicit answers given when the ticket was picked up).
Per the [review method](../README.md), a later review supersedes an earlier one:
**this register supersedes 010726 D16 and amends D15** for the inbox; everything
else in the 010726 register stands.

| # | Decision | Ruling | Provenance |
|---|---|---|---|
| E1 | **Single condensed inbox list** | The category tabs, the Triage-status link row (All/New/Routed/Actioned/Dismissed), the Show Active/Handled/All toggle, the "N of N emails" count, and the subtype dropdown are all REMOVED. One list, newest first, showing **everything except dismissed**; actioned rows stay in place visually muted; a "Show dismissed" switch reveals the rest. Remaining filters: search + mailbox chips + one compact **E-mail type** dropdown (categories with their subtypes). Legacy `?category/?view/?triageState` URLs are migrated to the new `?type=`/`?dismissed=1` scheme. | **operator** (inbox-simplification stub + list-scope answer) |
| E2 | **"E-mail type", not "Classification"** | The column and every user-facing string say **E-mail type** ("Change e-mail type…"). Badges stay neutral charcoal outline (010726 D3 upheld — no colour coding); scannability comes from a per-category icon inside the badge. | **operator** |
| E3 | **Strength is backend-only — supersedes 010726 D16** | No user-facing confidence/strength UI at all: no "Strong · 95%"-style captions AND no weak/abstain amber marker. Confidence remains stored backend data. The reclassify trigger is staff judgement + the "Change e-mail type…" action. (D16's two-line cell shape survives only as: tag + optional Overridden chip — the Overridden chip is provenance, not strength, and stays.) | **operator** ("strength / % should be a backend and non-visible feature — not user facing. remove all.") |
| E4 | **Status carries the case link** | Linked rows render "**Case created** · <Case/PO> →" (receiving work) or "**Linked to case** · <Case/PO> →" (queries/updates/etc.), clickable to the case. Unlinked: New (amber, icon+text — D4) / Handled / Dismissed. The Case/PO appears ONLY here — the VRM/Ref cells never duplicate it. | **operator** (inbox-simplification stub + VRM/Ref-split answer) |
| E5 | **VRM and Ref split** | Separate VRM column (plate chip) and Ref column (the email's own reference — body case-ref, else provider job-ref, mono). | **operator** |
| E6 | **Suggested outlook action = a real move (gated)** | A per-row "Suggested action" column proposes the Outlook filing (derived from the e-mail type). With `OUTLOOK_MOVE_ENABLED` on, clicking **actually files the message** into that folder in the shared mailbox via Graph (needs the Mail.ReadWrite Exchange-RBAC re-consent — operator step, see docs/gated.md); while the gate is off the column is display-only text. This retires D16's "implied a move that doesn't happen" rationale for hiding the folder — the folder is now an honest, actionable suggestion. **The operator live-tests the move himself; no automated live testing of it.** | **operator** |
| E7 | **Mailbox chips must name the real mailboxes** | "Other source" for every chip is a data bug (mailbox object-id GUID stored instead of the address). Fix at intake (resolve the subscribed mailbox UPN) and backfill historical rows; the SPA's address-shaped labelling and "Other source" fallback stay as-is. | **operator** (inbox-simplification stub) |
| E8 | **Dashboard inbox panel alignment** | The four inbox tiles become a 2×2 equal-width grid, chevrons flush right (always visible — D8 upheld), labels never wrap unevenly. | **operator** (regressions stub) |
| E9 | **Empty states (D15 amended for the inbox)** | The single-list model replaces the old per-facet inbox empty states. Each still carries exactly ONE action: true-empty → "Start a case manually"; everything-hidden-because-dismissed → "Show dismissed"; filter-miss → "Clear filters". | team ruling under D15's principle |

## Known deferrals

- Server-side list paging/filtering for the single `view=all` fetch (fine at
  today's volumes; revisit with growth).
- The Outlook-move activation itself is operator-gated: Mail.ReadWrite
  Exchange-RBAC re-consent + `OUTLOOK_MOVE_ENABLED` flip + operator live test
  (tracked in docs/gated.md).

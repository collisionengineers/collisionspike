---
id: TKT-054
title: Inbox simplification + VRM/Ref split + dashboard inbox-panel regressions
status: done
priority: P1
area: ui
tickets-it-relates-to: [TKT-025, TKT-005]
research-link: docs/tickets/done/TKT-054-ui-work/inbox-simplification/ticket.md
---

# Inbox simplification + VRM/Ref split + dashboard inbox-panel regressions

## Problem
Three operator-reported UI problems, raised together as one ticket (sub-stubs +
screenshots in this folder):

1. **[seperate-vrm-and-case-po](./seperate-vrm-and-case-po/ticket.md)** — the inbox's
   combined "VRM / Ref" cell shows the VRM **or** a reference, never both, and the
   linked case's Case/PO is invisible from the list.
2. **[regressions](./regressions/ticket.md)** — the Dashboard's right-hand Inbox panel
   renders misaligned (unequal tiles, floating chevrons, uneven wrapping); the inbox
   Show/count block and trailing actions column read as broken.
3. **[inbox-simplification](./inbox-simplification/ticket.md)** — the inbox carries too
   many filter layers (category tabs, Triage-status links, Show Active/Handled/All);
   mailbox chips all read "Other source"; the %/strength indicators should not be
   user-facing; status should link to the created/linked case; and staff need a
   **Suggested outlook action** per email.

## Evidence
- Screenshots in each sub-folder (live SPA, 2026-07-02).
- "Other source" root cause: Graph change-notifications echo the mailbox
  **object-id GUID** in `resource`; the orchestration stores it verbatim into
  `inbound_email.source_mailbox`, so the SPA's address-shaped label check falls
  back to "Other source" for every chip. Old rows keep the GUID until backfilled
  (intake values are computed once).
- The linked-case Case/PO is not on the inbound row — the list query does not
  join `case_`.

## Proposed change
Operator rulings captured in the [020726 review](../../../reviews/020726/decisions.md):

- **Backend**: resolve the subscribed mailbox UPN (subscriptionId → Graph
  `GET /subscriptions/{id}`) at intake; backfill existing GUID rows; LEFT JOIN
  `case_.case_po` into the inbound list; new **gated Outlook-move** path
  (Data API enqueue → orchestration Graph move, dark behind `OUTLOOK_MOVE_ENABLED`
  pending a Mail.ReadWrite Exchange-RBAC re-consent).
- **SPA**: one condensed inbox list (all except dismissed; handled rows muted;
  "Show dismissed" switch); filters reduced to search + mailbox chips + one
  "E-mail type" dropdown; Classification renamed **E-mail type** with per-category
  icons (neutral outline badges — D3 upheld); **no user-facing strength UI**
  (supersedes 010726 D16); VRM and Ref as separate columns; Status cell becomes
  "Case created / Linked to case · CCPY26050 →" links; new **Suggested action**
  column (real Outlook filing when the gate is on; display-only text while off);
  Dashboard inbox panel re-laid as a 2×2 equal-tile grid.

## Acceptance
- Mailbox chips name the real mailboxes (info@ / engineers@ / desk@) for new AND
  prior email.
- Inbox shows VRM and Ref in separate columns; linked rows show a clickable
  "Case created / Linked to case · <Case/PO>" status that opens the case.
- No tabs / triage-status links / Show toggles; one list, one type dropdown,
  search, mailbox chips, "Show dismissed" switch.
- No percentages or strength wording anywhere user-facing.
- Suggested action column shows the suggested Outlook filing per email; with the
  gate on, clicking files the message in the shared mailbox (operator live-tests;
  no automated live test of the move).
- Dashboard inbox tiles align (equal widths, chevrons flush right) at ~1024+.

## Research
Distilled 2026-07-02 from three operator drop-stubs in this folder (screenshots
attached there). Root-cause exploration recorded in this ticket + the 020726
review; no separate research pack.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- Sub-stubs: [seperate-vrm-and-case-po](./seperate-vrm-and-case-po/ticket.md) ·
  [regressions](./regressions/ticket.md) ·
  [inbox-simplification](./inbox-simplification/ticket.md)

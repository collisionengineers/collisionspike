---
id: TKT-009
title: Open an associated email in Outlook
status: blocked
priority: P3
area: ui
tickets-it-relates-to: [TKT-005, TKT-011]
research-link: docs/tickets/blocked/TKT-009-clickable-case-and-email/TKT-009-clickable-case-and-email.md
---

# Make associated emails clickable + view-full-email link

## Problem
Cases on the dashboard are already clickable; the **emails linked/associated to a case** also need to be
clickable. In addition there should be a button/link to **view the full e-mail**.

## Evidence
Emails are associated to cases via the inbound-email link; the UI needs to render those associations as
navigable links plus a full-email view affordance. See the research pack.

## Proposed change
Render associated emails as clickable items on the case/dashboard surfaces, and add a "view full email"
link/button.

## Acceptance
Clicking an associated email navigates to it; a "view full email" control opens the full message.

## Reopened follow-up — 2026-07-12

The delivered control opens only the app's own full-message preview. Staff also need a **View in Outlook** action that opens the same mailbox item in Outlook while preserving the internal preview as a fallback.

This follow-up is an input to the TKT-178 final cutover and is blocked from production rollout. It has
no separate execution window. Production work cannot begin without the dated signed-off job spreadsheet,
authenticated and verified EVA access, an independently confirmed production Archive root with explicit
write/retarget authorization, restore proof, a frozen dry-run hash and named operator approval.

### Acceptance
- Every associated email with a valid Graph/Outlook identity offers a clearly labelled `View in Outlook` action alongside, not instead of, the internal preview.
- The target comes from the message's authoritative Outlook web link or a documented stable identifier; the client does not construct an unsafe URL from untrusted subject/body text.
- The action opens the exact message in a new tab, for the correct production mailbox, and remains correct after ordinary folder moves where the provider's stable link supports them.
- Missing, inaccessible or deleted messages leave the internal preview available and show a concise plain-language outcome; they do not open a generic inbox or silently do nothing.
- Link retrieval and opening are read-only. Verification does not mark read/unread, move, delete, categorise, reply or otherwise mutate Outlook.
- External-link handling prevents opener control and rejects non-HTTPS/unexpected-host targets.
- Tests cover a valid link, missing link, deleted/inaccessible item, unexpected host, each production shared mailbox and internal-preview fallback.
- Deployed Chrome proof opens one read-only test/sample message from each available mailbox in the already signed-in Outlook session and records no mailbox mutation.
- The production rollout remains blocked unless every TKT-178 execution gate above is evidenced; offline
  tests, fixtures and planning do not waive a missing spreadsheet, blocked EVA API or unavailable
  production Archive authorization.

## Research
- Operator stub: [clickable-case-and-email.md](TKT-009-clickable-case-and-email.md)
- Research pack: [research/clickable-case-and-email.md](TKT-009-clickable-case-and-email.md)

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Regression changes](./changes-regression-12-07-26.md)
- [Operator follow-up](./evidence/operator-followup-12-07-26.md)

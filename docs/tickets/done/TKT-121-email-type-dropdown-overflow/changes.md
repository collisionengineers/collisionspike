# Changes — TKT-121: Cap the "E-mail Type" dropdown height with a scrollbar

## Status
Built + deployed live (2026-07-09, PLAN-003 UI-wave batch).

## What was built
**`apps/web/src/features/inbox/Inbox.tsx`**: the E-mail type `<Dropdown>` now passes
`listbox={{ className: styles.typeListbox }}` with `maxHeight: '320px !important'` (~10 option rows)
+ `overflowY: auto`. The `!important` is load-bearing: Fluent's popover positioning (autoSize)
writes an INLINE viewport-height max-height on open (measured 713px on a 949px viewport — the
operator's "fills the whole page"), which beats any plain class rule; the first deploy without it
proved the miss. Keyboard nav reaches every option — Fluent scrolls the active option into view
within the capped listbox.

## Deploy + live proof
Measured live after redeploy: listbox height 320px, `maxHeight: 320px`, scrollable=true, all 18
grouped options (incl. the last) reachable by scroll/keyboard. Evidence:
`evidence/live-email-type-dropdown-capped.png`.

## Remainders
None.

# Changes — TKT-009: Make associated emails clickable + view-full-email link

## Status
Done — associated emails render as clickable items with a "view full email" affordance; live data linkage confirmed.

## Commits
- `94902ce` — mega-commit implementing TKT-001..014,019,020 → rendered case-associated emails as
  navigable links and added the "view full email" control on the case/dashboard surfaces.

## Files touched
- SPA case/dashboard email-association components + the inbound-email link rendering (within the
  `94902ce` change set).

## Summary
Emails associated to a case now render as clickable items, plus a "view full email" link/button that
opens the full message. The clickable UI ships in the live SPA bundle and now has correctly linked data
to act on.

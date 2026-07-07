# Changes — TKT-007: Combine email + intake overviews into one compact dashboard

## Status
Done — amalgamated dashboard endpoint, hooks, and UI are wired.

## Commits
- `94902ce` — mega-commit implementing TKT-001..014,019,020 → added the combined dashboard endpoint, its
  data hooks, and the UI that joins the case-pipeline summary with inbound-email triage at a glance.

## Files touched
- `api/src/functions/dashboard.ts` (endpoint) + `api/src/functions/dashboard.test.ts`.
- SPA dashboard component + data hooks (within the `94902ce` change set).

## Summary
The previously separate email overview and intake overview are joined into one compact dashboard surface,
with drill-downs to the dedicated detail/control pages. The combined count contract aligns with TKT-012's
count semantics. The endpoint is unit-tested offline.

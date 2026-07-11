# Verification — TKT-096: Completed/Archive view + dashboard drill-through + search fold-in

## Verdict
VERIFIED-LIVE

Verified by: ticket-verifier dispatch, 10-07-26 (verdict block transcribed 1:1 below). The prior
PENDING notes ("awaiting api + SPA deploy", "GLOBAL_SEARCH gate stays DARK") are superseded — the
2026-07-09 deploys + gate flip are registry-verified and were independently observed live.

## Ticket-verifier verdict (transcribed 1:1, dispatch of 2026-07-10)

### Verdict
VERIFIED-LIVE

### Evidence
Verified 2026-07-10 ~16:33–16:40Z against the deployed SPA (signed-in staff session, own read-only
tab) + App Insights + az reads.

**Acceptance 1 — Completed view lists eva_submitted/done/box_synced with Delivered/Awaiting split;
three work-queues + counts unchanged:**
- SPA `/completed` renders: "Completed cases", subtitle "…Not a work queue."; TabList All (0) /
  Awaiting delivery (0) / Delivered (0); handler-plain empty state (screenshot ss_4325tt0oq). Nav
  shows COMPLETED ("Completed cases") outside the QUEUES group.
- Server leg proven independently (the client seam is safe()-empty, so the empty state alone can't
  prove it): App Insights `completedCases` GET /api/completed/cases → 200 ×3 (my page loads + tab
  clicks); `cespk-api-dev/completedCases` in the function list; deployed source cases.ts:1420-1437 —
  exactly the three terminal statuses, ORDER BY submitted_at DESC NULLS LAST.
- Work-queues unchanged: exactly Not ready 201 / Review 190 / Held 124 render (ss_29024jm4o); no 4th
  queue. Zero terminal rows exist live (Sent-to-EVA all-time = 0) — the view is
  **empty-but-functional by data, not defect**.

**Acceptance 2 — dashboard throughput tiles drill through to /completed:** all three tiles navigated
the tab to /completed ("Sent to EVA (all time)", "Submitted today" — real button with aria "Open
completed cases.", "Cleared this week"); "In today" stays a plain stat as specified.

**Acceptance 3 — global search returns a delivered case and hides removed:**
- Gate LIVE: GLOBAL_SEARCH_ENABLED=true (flipped + readback-verified 2026-07-09).
- Live search: /search?q=SD66CVW → hit "PCH26013 · SD66CVW · … · Missing fields" — the new per-hit
  status field live end-to-end (ss_0736y6yq9). App Insights globalSearch 200 ×5. Function deployed.
- removed exclusion in the deployed bundle: search.ts:119-129 (`AND c.status_code <> $removedParam`),
  :142 returns status; terminals deliberately included (:34-36).

**Terminology:** all rendered strings handler-facing; no raw status codes leak. Pass.

### Pending / gaps
Expected absences (data preconditions, not bugs): (1) no terminal case exists yet (all-time
Sent-to-EVA = 0) — the row-level /completed listing and "search returns a delivered case" exercise
themselves when TKT-094/095 runtime produces the first terminal case; (2) the removed-search negative
probe was not run live (the 2 removed rows are PII-anonymised — no searchable identifier; enforcement
is server-side in the deployed SQL; queued Q2 supplies identifiers for a later probe); (3) the
stale PENDING notes in this file are superseded (transcribed above).

Queued SQL (informational, next data pass): Q1 status distribution by name; Q2 terminal + removed
identifiers for the row-level proof + negative probe.

### How to re-verify
Dashboard → any throughput tile → /completed with the three tabs; App Insights requests for
/api/completed + /api/search → 200s; after the first EVA zip export fires eva_submitted (TKT-094):
/completed Awaiting delivery lists the case, search its VRM → hit with the terminal badge, and search
a removed row's case_po → no hit.

### Confidence + unread surfaces
High on everything shipped. Unread: Postgres directly (queued); the /api/completed/cases response
body (extension captured only OPTIONS preflights — server proof via KQL instead); box_synced row
rendering (no such row exists to observe).

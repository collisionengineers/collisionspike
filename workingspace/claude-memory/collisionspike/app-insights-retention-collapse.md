---
name: app-insights-retention-collapse
description: "App Insights (free tier) queryable history collapses intra-day — from days down to ~1h by evening; live proofs are perishable, run KQL same-day/same-hour and bank results into ticket evidence immediately"
metadata: 
  node_type: memory
  type: project
  originSessionId: da201efb-1edd-46a8-96bb-934171b9929d
---

On the collisionspike free-tier App Insights components (api `95e70d0f…`, orch `7c7ea68a…`, parser),
the queryable KQL window is NOT the nominal retention: on 2026-07-10 the morning/afternoon passes
could read back to 2026-07-02, but by ~19:35Z the window had collapsed to **~1 hour** on both
components (daily-cap/ingestion truncation). A verifier measured it directly; a later sweep the same
evening confirmed KQL was non-probative for anything older.

**Why:** verification strategy depends on it — "await the natural event then KQL it next week" does
not work here; the trace record evaporates.

**How to apply:** treat live KQL proofs as perishable — run queries the same day (ideally within
hours) of the event and transcribe results into the ticket's verification.md/evidence immediately;
prefer DB rows (Postgres audit/provenance tables) as the durable proof layer; when a verifier needs
history the window no longer holds, rely on banked certifications in done tickets rather than
re-querying. Pass `--offset` explicitly on `az monitor app-insights query` (defaults to 1h and
silently clamps wider `ago()` windows). Related: [[live-postgres-connect-path]],
[[azure-deploy-toolchain-gotchas]].

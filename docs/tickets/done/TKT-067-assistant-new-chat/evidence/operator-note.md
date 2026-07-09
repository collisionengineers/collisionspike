# Operator plan excerpt — § 2 Assistant: reset/clear chat (SPA only)

> From `PLAN-assistant-intake-search-fixes.md` (planning session 2026-07-06). The full plan is
> preserved at
> [TKT-066 evidence](../../../verify/TKT-066-assistant-lookup-observability/evidence/operator-note.md).

In `mockup-app/src/components/AssistantDrawer.tsx`: add a "New chat" button in the drawer header
(next to close) that clears `turns` + `input` (disabled while `sending`). No API change — history
lives client-side.

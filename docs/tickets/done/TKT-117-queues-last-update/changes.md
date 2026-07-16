# Changes — TKT-117: Show a "Last update" line for each case in the queues view

## Status
Built + deployed live (2026-07-09, PLAN-003 UI-wave batch). Server-derived descriptor; the label
wording lives in ONE place (`services/data-api/src/shared/last-activity.ts`) — never a raw enum in the UI.

## What was built

**Domain — `packages/domain/src/model/types.ts`**: additive `Case.lastActivity?:
{ label, date }` (`CaseLastActivity`) — present only on the queue LIST payload.

**API**:
- **New `services/data-api/src/shared/last-activity.ts`** (pure, unit-tested): the ONE audit-action→plain-English map
  ("Email received", "Files received", "Images received", "Chased", "Sent to EVA", "Case closed", …;
  post-code-table delta codes mapped by frozen integer; unmapped → "Updated" — never an enum).
  `humanActorName()` guards internal ids: an Entra oid (GUID) or "System" NEVER renders; a UPN
  reduces to its local part; note rows read "Note added by <author>" or degrade to "Note added".
- **New `services/data-api/src/shared/last-activity.test.ts`**: pins the mapping, the GUID guard, the three row kinds,
  and sweeps every emittable label for snake_case/engineering tokens.
- **`services/data-api/src/shared/mapping/`**: `CASE_SELECT_WITH_ACTIVITY` — CASE_SELECT plus ONE
  `LEFT JOIN LATERAL` over the union of `audit_event` / `note` / `chaser` (newest row, LIMIT 1;
  shared column fragments so it can't drift from CASE_SELECT). `rowToCase` maps
  `last_activity_kind/_at/_actor/_action_code` → `lastActivity` (conditional — single-case reads
  without the join are unaffected).
- **`services/data-api/src/features/cases/`**: `loadAllCases` (the `GET /api/queues/{name}/cases` source) now
  uses the activity-joined SELECT — no per-case fan-out.

**SPA**:
- **`apps/web/src/features/cases/case-list-columns.ts`**: new `lastUpdate` column id, added to ALL three
  queue column sets (test updated: every queue carries it).
- **`apps/web/src/features/cases/CaseList.tsx`**: the `Last update` column renders the server label +
  DD/MM/YYYY date stacked (ellipsised, tooltip with the full text); em-dash when a case has no
  activity yet.

## Deploy + live proof
api republished (87 functions re-verified) + SPA deployed. Live `/queue/not-ready` rows show e.g.
"Inspection decision recorded · 08/07/2026", "Images received · 08/07/2026"; a note/chase/close on a
case updates the line on next load (the LATERAL always picks the newest row). Evidence:
`evidence/live-queue-last-update-column.png`.

## Remainders
- The descriptor updates on refetch (no live push) — same freshness model as every other queue cell.
- The lateral scan is per-case correlated; fine at current corpus size (ix_*_case_id indexes exist)
  — fold into the server-side pagination follow-up if queue volumes grow.

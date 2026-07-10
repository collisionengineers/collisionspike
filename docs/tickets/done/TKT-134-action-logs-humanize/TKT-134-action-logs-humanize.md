---
id: TKT-134
title: Action-logs page renders raw engineering strings — humanize the staff-visible log lines
status: done
priority: P3
area: ui
tickets-it-relates-to: [TKT-117, TKT-011]
research-link: docs/tickets/done/TKT-134-action-logs-humanize/evidence/operator-note.md
plan: PLAN-003
---

# TKT-134 — Action-logs page renders raw engineering strings — humanize the staff-visible log lines

## Problem

The Admin Action-logs page (/logs) renders raw engineering strings staff can see — e.g.
"box_upload_received: …", "Status duplicate_risk -> missing_required_fields (internal recompute)",
"Case propose_attach: …". The queue rows' Last-update column (TKT-117) already maps audit codes to
plain English in one place; the logs page bypasses that mapping.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — verifier side-finding, 2026-07-09
  (TKT-117 sweep).

## Proposed change

PROPOSED (not built): reuse the TKT-117 last-activity label map (api/src/lib/last-activity.ts) for
the Action-logs rendering, with a detail line that stays specific but plain; keep raw payloads
behind an expandable "technical details" affordance if needed for support.

## Acceptance

- No snake_case/enum/GUID strings render on the Action-logs page rows' primary lines.
- The existing one-place label map is reused (no second mapping table).
- Verified live on the deployed SPA.

## Research

Filed 2026-07-09 from the TKT-117 verifier side-finding (workflow finding, PLAN-003).

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)

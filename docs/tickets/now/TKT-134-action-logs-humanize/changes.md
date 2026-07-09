# Changes — TKT-134: Action-logs humanization

## Status
built + deployed (2026-07-09, PLAN-003 final wave D1: api republished 94, SPA redeployed
200 + strict CSP) — uncommitted on `feat/final-wave`; awaiting live render proof.

## Commits
(none yet — the wave's work is uncommitted on `feat/final-wave` per the dispatch instructions)

## Files touched
- `api/src/lib/last-activity.ts` — new `plainDetail(raw)` safety filter alongside the ONE
  label map: a raw audit summary renders as a detail line ONLY when it carries no
  engineering-shaped token (any underscore, an enum-transition arrow `->`/`→`, a GUID, a
  `key=value` pair); anything else is withheld (conservative by design).
- `api/src/lib/mappers.ts` — `rowToActivityEvent` re-wired to the ONE map:
  `description` (the PRIMARY line) is now ALWAYS `auditActionLabel(action_code)` — the old
  `rec.name ?? rec.after ?? action` fallback (which leaked `box_upload_received: …`,
  `Status duplicate_risk -> missing_required_fields`, and raw `after` JSON) is gone;
  human-safe summaries surface as the new `detail` field; the raw summary + the enum
  action name move to the new `technical` field; `actor` now goes through
  `humanActorName` (GUID/oid never renders — degrades to `System`).
- `packages/domain/src/model/types.ts` — `ActivityEvent` gains optional `detail` +
  `technical` (documented as TKT-134 fields).
- `mockup-app/src/screens/ActionLogs.tsx` — renders the server-humanized `description`
  as the primary line, `detail` as a secondary Caption, and `technical` ONLY behind a
  per-row expandable **"Technical details"** disclosure (aria-expanded toggle; monospace
  body). Restructured the row so the disclosure is not nested inside the navigation
  button. **No second mapping table** — the SPA renders what the ONE server map produced
  (`KIND_LABELS` for the closed `ActivityKind` union badge already existed and stays).

## Summary
No snake_case/enum/GUID can reach an Action-logs primary line: the primary is drawn from
the single last-activity label map (never raw data), specifics stay on a plain detail line
only when provably human-safe, and the raw payload is one disclosure away for support.
The same mapper serves `GET /api/activity`, `GET /api/cases/{id}/activity`, and the
assistant's case-activity tool, so all three read the same humanized wording.

Tests (all green): `api/src/lib/last-activity.test.ts` (+`plainDetail` suite pinning the
three live sightings from the operator note), `api/src/lib/mappers.test.ts`
(+`rowToActivityEvent` suite: humanized primary, detail/technical split, GUID-actor guard,
no raw-JSON fallback). api suite 352 passed.

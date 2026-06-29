# Actual email management research

## Ticket

Source stub: `docs/plans/work-todo-spike/email-management/actual-management-of-emails.md`

The ticket says the inbox is basically a display, needs actual actions, and dismissing an email does not remove it from the view.

## Summary

The complaint is accurate. The app has row actions, but they are not yet enough to make the inbox behave like an active work queue.

The `Dismiss` and `Mark as actioned` actions call `POST /api/inbound/{id}/triage`, which updates `inbound_email.triage_state`. But the list endpoint and default UI still include all triage states, so the row comes back after refresh. The route also swallows database failures and always returns `204`, so the SPA can show a success toast even when no row changed.

Rows should not be deleted: `inbound_email` is the audit-of-record table, one row per inbound email. The fix is to treat `actioned` and `dismissed` as durable handled states, hide them from the default active view, keep an explicit handled filter/view for reopening, and audit every staff state change.

## Evidence

The schema supports action state:

- `migration/assets/schema/120_inbound_email.sql:12-35` defines `inbound_email`.
- `migration/assets/schema/120_inbound_email.sql:27` defines `triage_state` as `new | routed | actioned | dismissed`.
- `packages/domain/src/dto/index.ts:216-244` defines `TriageState` and the `InboundEmail` DTO.
- `api/src/lib/mappers.ts:433-463` maps unknown/null states back to `new`.

The API writes state, but reads all rows:

- `api/src/functions/inbound.ts:47-53` selects `SELECT * FROM inbound_email ${where} ORDER BY received_on DESC`, filtering only category and client-side subtype.
- `api/src/functions/inbound.ts:67-73` counts every row by category, regardless of `triage_state`.
- `api/src/functions/inbound.ts:81-98` updates `triage_state`, catches all failures, and still returns `204`.
- `api/src/functions/inbound.ts:88-93` does not validate the requested state.

The SPA defaults to "all states":

- `mockup-app/src/screens/Inbox.tsx:306-315` loads one category and keeps `stateFilter` as `ANY`.
- `mockup-app/src/screens/Inbox.tsx:322-343` filters by state only when the user chooses a state filter.
- `mockup-app/src/screens/Inbox.tsx:356-366` shows success after the POST resolves and refetches.
- `mockup-app/src/screens/Inbox.tsx:526-548` has `Mark as actioned`, `Dismiss`, and `Reopen` menu actions.
- `mockup-app/src/screens/Inbox.tsx:639-646` exposes an `All states` option.

The mock source mirrors the same behavior:

- `mockup-app/src/data/mock-source.ts:257-263` filters only category/subtype.
- `mockup-app/src/data/mock-source.ts:267-273` counts every row by category and only separately counts `new`.

Ingestion is not the likely cause of dismissed rows being reset:

- `api/src/functions/internal.ts:465-481` inserts new inbound rows with `triage_state='new'`, but the conflict update does not update `triage_state`.
- Therefore replays should preserve a staff-set `dismissed` or `actioned` state.

## What is missing

1. Active-vs-handled semantics.
   - There is no API-level "active" default.
   - There is no explicit handled view beyond the local state filter.
   - Counts and tabs are total rows, not active work.

2. Trustworthy write semantics.
   - Invalid state values can be written because the database column is free text and the route does not validate.
   - The API cannot tell whether a row was changed because it does not use `RETURNING`.
   - Database errors are swallowed, so UI success can be false.

3. Action audit.
   - `api/src/lib/audit.ts:48-49` includes `inbound_classified` and `inbound_routed`.
   - `packages/domain/src/data/choicesets/audit-event.json` has matching inbound actions.
   - There are no audit actions for staff state changes such as actioned, dismissed, or reopened.
   - `migration/assets/schema/080_audit_event.sql` links audits to cases, but query/other inbound emails often have no case id, so inbound-specific actions need either JSON-only references or an `inbound_email_id` relation.

4. Real management actions beyond state.
   - The current menu only supports `View case` or `Open in mailbox`, plus triage state changes.
   - There is no backend route to link a query to an existing case, create a case from a query, reclassify, move to another category, reply, or move/tag in Outlook.

## UI language risk

The Inbox screen contains internal/process terms that conflict with the no-engineering-language rule:

- `mockup-app/src/screens/Inbox.tsx:491` renders `Triage`.
- `mockup-app/src/screens/Inbox.tsx:626-646` renders `Triage state` and internal state names.
- `mockup-app/src/screens/Inbox.tsx:708-721` renders `Open in mailbox`, `Message-ID`, and mailbox pointer details.
- `mockup-app/src/screens/Inbox.tsx:370-371` can show raw REST errors from the client.

Suggested handler-facing terms:

- `Status` instead of `Triage state`.
- `Done`, `Dismissed`, `Needs action`, `Reopened` instead of workflow words where possible.
- `Find original email` and `Copy email reference` instead of `Message-ID` / `pointer`.
- A generic error such as `Couldn't update this email. Please try again.` while logging technical details elsewhere.

## What changes would resolve it

1. Harden the state model.
   - Add a database default/check for `triage_state`.
   - Backfill null/unknown values to `new`.
   - Keep `new`, `routed`, `actioned`, and `dismissed` as the canonical lifecycle.

2. Make the API active-first.
   - Extend `InboundFacet` with a `state` or `scope` query.
   - Default `GET /api/inbound` to active rows only, likely `triage_state NOT IN ('actioned', 'dismissed')`.
   - Support explicit `state=actioned`, `state=dismissed`, and `state=all` for handled review/reopen.
   - Make counts reflect active rows by category, with a separate handled count if needed.

3. Make writes reliable.
   - Validate `body.state`.
   - Use `UPDATE ... RETURNING triage_state` so missing ids return `404`.
   - Return `400` for invalid states.
   - Stop swallowing real database errors.
   - Only show UI success after a durable update.

4. Audit staff actions.
   - Add `inbound_state_changed` or separate `inbound_actioned`, `inbound_dismissed`, and `inbound_reopened` audit actions.
   - Record actor, inbound email id, source message id, before state, after state, and case id when present.
   - Consider an `inbound_email_event` table because many query/other rows have no case id.

5. Add real next actions.
   - Keep `View case` for linked rows.
   - Always offer a way to find the original email.
   - Add backend-backed `Link to case`, `Create case`, and `Change type` only once the API can audit and persist those transitions.

6. Tests.
   - API: active list hides handled rows by default.
   - API: explicit handled filters return handled rows.
   - API: counts exclude handled rows from active category counts.
   - API: invalid state returns `400`.
   - API: unknown id returns `404`.
   - API: state change writes audit.
   - SPA/mock: dismiss/actioned removes row from active view after successful write.

## Files affected

- `migration/assets/schema/120_inbound_email.sql`
- `migration/assets/schema/080_audit_event.sql`
- `api/src/functions/inbound.ts`
- `api/src/functions/internal.ts`
- `api/src/lib/mappers.ts`
- `api/src/lib/audit.ts`
- `packages/domain/src/dto/index.ts`
- `packages/domain/src/data/choicesets/audit-event.json`
- `mockup-app/src/data/rest-client.ts`
- `mockup-app/src/data/hooks.ts`
- `mockup-app/src/data/mock-source.ts`
- `mockup-app/src/screens/Inbox.tsx`


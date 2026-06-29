# Research pack: clickable case and email links

## Source ticket

`docs/plans/work-todo-spike/ui-changes/clickable-case-and-email.md`

The ticket asks for cases on the dashboard to be clickable, and for emails linked to cases to be clickable too, including a way to view the full email.

## What is already working

Case rows already navigate in the main case surfaces:

- Dashboard action rows navigate with `navigate(...)` around `mockup-app/src/screens/Dashboard.tsx:523` and `mockup-app/src/screens/Dashboard.tsx:527`.
- Case list rows navigate with `navigate(...)` around `mockup-app/src/screens/CaseList.tsx:668` and `mockup-app/src/screens/CaseList.tsx:674`.

So the remaining gap is mostly email-to-case and case-to-email navigation.

## What is missing

Inbound email rows are not generally clickable, and the action menu changes depending on whether a case is linked:

- Inbox rows and columns are defined around `mockup-app/src/screens/Inbox.tsx:412-493`; the subject itself is not a case/email link.
- For emails with `caseId`, the row menu shows `View case` around `mockup-app/src/screens/Inbox.tsx:511-516`.
- The `Open in mailbox` action is only shown for emails without `caseId` around `mockup-app/src/screens/Inbox.tsx:518-521`.

That means a linked email can point to the case, but it loses the full-email action.

The case detail payload also does not include linked inbound emails:

- `api/src/functions/cases.ts:75-80` loads provenance, evidence, notes, and chasers for `GET /api/cases/{id}`.
- The case detail evidence tab renders archive/documents/photos around `mockup-app/src/screens/CaseDetail.tsx:984`, `mockup-app/src/screens/CaseDetail.tsx:986`, and `mockup-app/src/screens/CaseDetail.tsx:1195`.
- There is no inbound email section on the case page.

## Why it happens

The database and DTO do not retain enough mailbox data to reliably open a full message later:

- `migration/assets/schema/120_inbound_email.sql:12-35` stores `source_message_id`, mailbox address, preview, category, triage state, and optional `case_id`, but not a Graph message id, folder id, web link, immutable id, raw message path, or MIME pointer.
- Orchestration fetches both a Graph message id and an internet message id in `orchestration/src/graph/fetchMessage.ts:87-89`.
- The API internal intake route persists only the internet message id into `source_message_id` around `api/src/functions/internal.ts:464` and `api/src/functions/internal.ts:484`.
- `packages/domain/src/dto/index.ts:223-244` exposes only `sourceMessageId`, `caseId`, preview, and triage fields.

An internet message id is useful as a reference, but it is not enough to open the message in Outlook.

## Microsoft Learn evidence

Microsoft Graph message resources include `webLink`, a browser URL for opening the message in Outlook on the web. Learn also notes that Outlook item ids normally change when an item is moved unless every request uses `Prefer: IdType="ImmutableId"`.

Relevant docs:

- `https://learn.microsoft.com/graph/api/resources/message?view=graph-rest-1.0`
- `https://learn.microsoft.com/graph/outlook-immutable-id`

This matters because email management may later move messages between folders. If the app stores default Graph ids and then moves the message, stored links can break. Switching existing subscriptions to immutable ids requires recreating those subscriptions.

## Affected files

- `mockup-app/src/screens/Inbox.tsx` - row actions, subject/case links, full-email action.
- `mockup-app/src/screens/CaseDetail.tsx` - likely location for linked email history on a case.
- `mockup-app/src/data/rest-client.ts` and `mockup-app/src/data/hooks.ts` - API calls for linked emails or new fields.
- `packages/domain/src/dto/index.ts` - inbound email DTO additions.
- `migration/assets/schema/120_inbound_email.sql` - new fields for Graph id, immutable id, web link, or raw message pointer.
- `orchestration/src/graph/fetchMessage.ts` - request and return link/id data from Graph.
- `orchestration/src/graph/graph.ts` - add immutable id preference consistently.
- `api/src/functions/internal.ts` - persist link/id fields during intake.
- `api/src/functions/cases.ts` or `api/src/functions/inbound.ts` - expose linked emails for a case.

## Changes that would resolve it

1. Store a durable email open target.
   - Add fields for Graph immutable id and `webLink`, or store a raw message/archive pointer if mailbox links are not reliable enough.
   - Use `Prefer: IdType="ImmutableId"` consistently when fetching messages and creating future subscriptions.

2. Keep separate actions for case and email.
   - In the inbox, clicking the linked case should open the case.
   - A separate action should remain available to open the full email when the app has a valid link.
   - Suggested rendered copy: `View case`, `Open full email`, and `Copy email reference`.

3. Add linked emails to the case page.
   - Include a compact email history panel or tab with received date, sender, subject, category, and full-email action.

4. Backfill carefully.
   - Existing rows only have `source_message_id`; not every old message can be opened until it is matched again or a raw email copy exists.

5. Test move behavior.
   - Add tests for the DTO/API fields.
   - In read-only/live testing, verify that a message still opens after folder movement before relying on mailbox links for case history.

## Open checks before implementation

- Decide whether the canonical full-email source is Outlook `webLink` or an archived raw message copy. The archive route is more durable; Outlook links are faster to implement but depend on mailbox retention and permissions.

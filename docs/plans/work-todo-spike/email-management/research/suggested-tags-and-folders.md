# Suggested tags and folders research

## Ticket

Source stub: `docs/plans/work-todo-spike/email-management/suggested-tags-and-folders.md`

The ticket asks for suggested email categories/tags, logging when staff overwrite suggestions, future automation, and initial sorting into Outlook folders.

## Summary

The current system has deterministic category/subtype classification, but it does not model suggestions separately from accepted values. It also does not model Outlook folder/category sync. To make the ticket useful for future automation, suggestions need their own durable review/feedback record rather than being folded into `inbound_email.signals`.

Start with app-local suggestions and override logging. Add Outlook categories/folder moves later, behind explicit `Mail.ReadWrite` permission, immutable-id handling, retry/audit records, and DSAR/governance decisions.

## Current taxonomy

ADR-0015 remains the authority for email triage:

- `docs/adr/0015-email-triage-inbox-management.md:12-18` says every email is classified as `receiving_work`, `query`, or `other`, and nothing is silently dropped.
- `docs/adr/0015-email-triage-inbox-management.md:22-32` chooses a dedicated inbound email table and deterministic classifier, with LLM refinement deferred.
- `docs/adr/0015-email-triage-inbox-management.md:46-49` says query/other rows keep metadata and a mailbox pointer, not raw `.eml` bytes.
- `docs/adr/0015-email-triage-inbox-management.md:87-141` adds the 2026-06-29 over-promotion fix and reinforces abstain-to-other for ambiguous messages.

The implemented DTO mirrors that narrow taxonomy:

- `packages/domain/src/dto/index.ts:204-214` defines categories and subtypes.
- `packages/domain/src/dto/index.ts:216-244` defines `triageState`, `classifierMode`, `signals`, and optional `caseId`/`workProviderId`.
- `migration/assets/schema/120_inbound_email.sql:22-31` stores category, subtype, confidence, classifier mode, signals, triage state, body VRM, body Case/PO, case id, and work provider id.
- `api/src/functions/internal.ts:465-481` writes the current classifier result into `inbound_email`.

The requested tag list is broader:

- Provider/Principal Code if known.
- Type: Inspection, Audit, Diminution, Query.
- Logged by bot if logged as case.
- Status managed by the app: Awaiting Images, Awaiting Instructions, Held, Ready for EVA, Sent to EVA.
- Future total-loss/repairable.

Only some of this maps today:

- Provider/principal can be derived from `work_provider_id`.
- Inspection/audit/query mostly map to existing category/subtype.
- Case status belongs to linked `case_`, not the email row.
- `Diminution` is not an inbound subtype today.
- Total-loss/repairable is intentionally deferred in `docs/plans/work-todo-spike/ai-assistant/ai-tools/research/defer-ai-case-category.md`.

## Missing model for suggestions and override feedback

Current fields store the current classifier result, not the review history:

- There is no `suggested_category`, `accepted_category`, `suggested_folder`, `accepted_folder`, override reason, review actor, or review timestamp.
- `classifier_mode='human'` exists as a value in `api/src/lib/mappers.ts:434`, but there is no API route that lets staff reclassify a row and set it.
- `api/src/functions/inbound.ts:81-98` only updates `triage_state`.
- `orchestration/src/functions/gated/triage-classify.ts:46-60` is gated/manual, records only an audit, and does not update `inbound_email`.

Audit is not enough by itself:

- `migration/assets/schema/080_audit_event.sql` links audit events to cases, but query/other inbound rows may not have a case.
- `migration/assets/schema/110_improvement_signal.sql` has a deferred improvement-signal concept, but no inbound email linkage.
- If overrides are stored only as JSON in generic audit rows, they will be harder to query for classifier improvement.

Recommended model:

- Add an `inbound_email_suggestion` table or equivalent structured columns.
- Store `inbound_email_id`, suggestion kind (`category`, `subtype`, `provider`, `folder`, later `damage_outcome`), suggested value, confidence, signals, classifier/model version, input hash, review state, accepted value, reviewed by, reviewed at, and override reason.
- Add `inbound_email_event` or add `inbound_email_id` to audit/improvement tables.
- Add `PATCH /api/inbound/{id}/classification` and possibly `PATCH /api/inbound/{id}/folder-suggestion`.
- When staff change a suggestion, set the accepted value, mark classifier mode as human where relevant, and write append-only feedback.

## Outlook categories and folders

Microsoft Learn confirms the required Outlook operations:

- Updating a message can set `categories`, and `PATCH /users/{id}/messages/{id}` requires `Mail.ReadWrite`: https://learn.microsoft.com/graph/api/message-update?view=graph-rest-1.0
- Moving a message uses `POST /users/{id}/messages/{id}/move`, requires `Mail.ReadWrite`, creates a new copy in the destination, and removes the original: https://learn.microsoft.com/graph/api/message-move?view=graph-rest-1.0
- Outlook message ids can change after move/copy; immutable ids require `Prefer: IdType="ImmutableId"` consistently: https://learn.microsoft.com/graph/outlook-immutable-id
- Outlook folders/categories can be organized through Graph, but creating master categories needs mailbox settings write permission: https://learn.microsoft.com/graph/api/outlookuser-post-mastercategories?view=graph-rest-1.0

Current repo state is read-oriented:

- `orchestration/src/lib/graph.ts:6-15` documents a client-credentials Graph app with `Mail.Read`.
- `orchestration/src/lib/graph.ts:117-136` fetches messages and attachments.
- There are no helper methods for `PATCH categories`, `move`, listing folders, or creating folders.
- `docs/architecture/live-environment.md:69-88` documents Graph PUSH intake over the production mailboxes.
- Production write scope is not established; do not assume `Mail.ReadWrite` is available.

There is also an identity gap:

- `orchestration/src/functions/activities/fetchMessage.ts:68` receives the Graph message id and fetches the message.
- `api/src/functions/internal.ts:484` persists `inbound.internetMessageId` as `source_message_id`.
- Outlook `move` and `PATCH categories` need the Graph message id, preferably immutable, plus the mailbox.
- Therefore the app must store Graph id separately from Internet Message-ID before it can reliably mutate the Outlook message.

## Safe implementation shape

Phase 1: suggestions only.

- Store suggested tags and folder path in the app database.
- Show suggestions in handler language.
- Let staff accept/override.
- Log every override as feedback.
- Do not move or tag the Outlook message yet.

Phase 2: explicit mailbox actions.

- Extend Graph RBAC/scope to `Mail.ReadWrite` for the production shared mailboxes only.
- Store Graph message id, mailbox, current folder id/path, Outlook categories, and sync status on or near `inbound_email`.
- Add Graph helpers for getting current categories, patching merged categories, listing/ensuring folder path, and moving a message.
- Merge categories; do not overwrite categories staff already set in Outlook.
- After move, store returned message id/folder state unless immutable ids are fully adopted.
- Never move before intake has recorded the email and any case link safely.
- Log success/failure and retry state.

Phase 3: automation.

- Use accepted/overridden suggestions as the training/feedback corpus.
- Only auto-apply when confidence and policy thresholds are met.
- Keep a user-visible audit trail and a reversible path.
- Avoid Graph inbox rules initially; rules are a separate automation surface and can bypass app feedback/audit if introduced too early.

## Taxonomy decisions still needed

- Whether `Diminution` is an inbound email type, a case/report type, or evidence metadata.
- Whether `Inspection` should be an explicit subtype or simply the default receiving-work instruction.
- Whether `Logged by bot` is a tag or a derived fact from `case_id` plus intake channel.
- Whether case status should be displayed as a tag on linked emails, without storing it redundantly.
- What initial Outlook folder tree should be created:
  - Instructions
  - Queries
  - Images
  - Other confirmed bespoke folders

## Files affected

- `migration/assets/schema/120_inbound_email.sql`
- `migration/assets/schema/080_audit_event.sql`
- `migration/assets/schema/110_improvement_signal.sql`
- New migration for suggestion/action records
- `api/src/functions/inbound.ts`
- `api/src/functions/internal.ts`
- `api/src/lib/mappers.ts`
- `api/src/lib/audit.ts`
- `packages/domain/src/dto/index.ts`
- `packages/domain/src/data/choicesets/audit-event.json`
- `orchestration/src/lib/graph.ts`
- `orchestration/src/lib/subscriptions.ts`
- `orchestration/src/functions/activities/fetchMessage.ts`
- `mockup-app/src/data/rest-client.ts`
- `mockup-app/src/screens/Inbox.tsx`


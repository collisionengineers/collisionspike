# Changes — TKT-009: Make associated emails clickable + view-full-email link

## Status
Original internal-preview work delivered; reopened Outlook follow-up implemented and tested offline on
`codex/tkt-009-outlook-link`. Awaiting merge, deployment, the additive database delta, and separate live
verification.

## Commits
- `94902ce` — mega-commit implementing TKT-001..014,019,020 → rendered case-associated emails as
  navigable links and added the "view full email" control on the case/dashboard surfaces.
- `c5d5b4b` — carries Microsoft Graph's exact Outlook web link and immutable message identity from
  intake through Postgres/API to the inbox and case email previews, with strict external-link validation.

## Files touched
- SPA case/dashboard email-association components + the inbound-email link rendering (within the
  `94902ce` change set).

## Summary
Emails associated to a case now render as clickable items, plus a "view full email" link/button that
opens the full message. The clickable UI ships in the live SPA bundle and now has correctly linked data
to act on.

## Reopened follow-up — 2026-07-13

- Intake requests an immutable Microsoft Graph message id and retains Graph's own `message.webLink`; the
  client never constructs an Outlook target from a subject, body, mailbox address or Internet-Message-Id.
- The shared domain validator permits HTTPS links only on the expected Microsoft 365 Outlook hosts and
  rejects credentials, explicit ports, malformed URLs and lookalike hosts. The API validates before
  persistence and mapping; the SPA validates again immediately before rendering the external action.
- `View in Outlook` opens in a new tab with `noopener noreferrer`. The existing saved preview remains in
  both the inbox sidebar and the case-linked email panel. A missing or rejected link shows a concise
  saved-preview fallback instead of opening a generic inbox.
- Fresh-schema truth and the replay-safe live delta now carry `graph_message_id` and
  `outlook_web_link`; historical rows safely remain null until replayed/backfilled.

### Files

- `orchestration/src/lib/graph.ts`, `orchestration/src/functions/activities/fetchMessage.ts`
- `api/src/functions/internal.ts`, `api/src/lib/mappers.ts`
- `packages/domain/src/domain/outlook-link.ts`, `packages/domain/src/dto/index.ts`
- `mockup-app/src/components/OutlookMessageAction.tsx`, `LinkedEmailsPanel.tsx`, `screens/Inbox.tsx`
- `migration/assets/schema/120_inbound_email.sql`
- `migration/assets/schema/deltas/2026-07-13-tkt009-outlook-message-link.sql`

### Offline evidence

- Domain link-policy tests: 11 passed.
- API mapper/schema-tolerance tests: 50 passed.
- Orchestration Graph tests: 12 passed, including `info@`, `engineers@`, and `desk@` mailbox coverage
  plus the immutable-id request header.
- SPA Outlook-action and saved-preview fallback tests: 4 passed.
- Domain/API/orchestration TypeScript build: passed.
- Production SPA build: passed.

No Outlook mailbox mutation was performed by this implementation or its tests.

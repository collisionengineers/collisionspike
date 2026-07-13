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
- The SPA now waits for a fresh server check. The API reads the row's mailbox + immutable Graph id
  and delegates a GET-only current-message check to the orchestration identity. Deleted,
  inaccessible and temporarily unavailable messages retain the saved preview with a concise outcome.
- New subscriptions send `Prefer: IdType="ImmutableId"`. Maintenance recognizes their versioned
  callback URL and rotates a legacy subscription create-before-delete; a failed replacement leaves
  the old delivery path alive and renewed.
- Historical remediation is implemented but deliberately not run. An explicit function-key endpoint
  enumerates mailbox-qualified rows, performs GET-only exact Internet-Message-Id matching, and appends
  an immutable outcome to `outlook_link_backfill_ledger`. Only one exact result can atomically fill the
  Graph-id/webLink tuple.
- Inbound arrival identity is mailbox-qualified. The same Internet-Message-Id delivered to two shared
  mailboxes now creates two rows, preventing cross-wired mailbox/Graph/link tuples.

### Files

- `orchestration/src/lib/graph.ts`, `orchestration/src/functions/activities/fetchMessage.ts`
- `orchestration/src/lib/outlook-links.ts`, `orchestration/src/functions/outlook-link-{resolve,backfill}.ts`
- `api/src/functions/internal.ts`, `api/src/lib/mappers.ts`
- `api/src/functions/inbound.ts`, `api/src/lib/outlook-link-{resolver,backfill}.ts`
- `packages/domain/src/domain/outlook-link.ts`, `packages/domain/src/dto/index.ts`
- `mockup-app/src/components/OutlookMessageAction.tsx`, `LinkedEmailsPanel.tsx`, `screens/Inbox.tsx`
- `migration/assets/schema/120_inbound_email.sql`
- `migration/assets/schema/deltas/2026-07-13-tkt009-outlook-message-link.sql`
- `migration/assets/schema/205_outlook_link_backfill.sql` and its replay-safe delta

### Offline evidence

- Domain link-policy tests: 11 passed.
- API mapper/schema-tolerance tests: 50 passed.
- Orchestration Graph tests: 12 passed, including `info@`, `engineers@`, and `desk@` mailbox coverage
  plus the immutable-id request header.
- SPA Outlook-action and saved-preview fallback tests: 4 passed.
- Follow-up focused tests: API 9, orchestration 46, SPA 7, and domain link policy 11 passed.
- Full suites after hardening: domain 1,188, API 722, orchestration 441, SPA 516 passed.
- Domain/API/orchestration TypeScript build: passed.
- Production SPA build: passed.

No Outlook mailbox mutation was performed by this implementation or its tests.

### Rollout still required

1. Apply the phase-A Outlook-link + ledger deltas, which add the composite key while retaining the old
   global key. Then perform a short controlled cutover: stop orchestration so Graph retains and retries
   any deliveries, deploy the composite-upsert API, apply the mailbox-dedup cutover delta that drops
   the old key, prove the API is healthy, and restart orchestration. Do not describe this as a rolling
   zero-error migration: while both keys coexist, a genuinely duplicated Internet-Message-Id delivered
   to a second mailbox cannot be inserted without violating the old global key. The controlled pause
   closes that window without cross-wiring the existing row or losing the Outlook delivery.
2. Deploy orchestration, mint a function-scoped resolver key, and configure the API's
   `OUTLOOK_LINK_RESOLVER_URL` plus Key-Vault-backed `OUTLOOK_LINK_RESOLVER_KEY`; then deploy API + SPA.
3. Observe maintenance's create-before-delete immutable-subscription rotation. Never delete the legacy
   subscription before its replacement exists.
4. Invoke historical backfill only after a dry-run candidate count and explicit approval. Retain its
   ledger evidence and do not mutate any Outlook item.

# Changes — TKT-009: Make associated emails clickable + view-full-email link

## Status
Original internal-preview work delivered. The reopened Outlook follow-up was implemented, reviewed and
merged through PR #86, but it is not currently deployed or verified live. An interrupted rollout was
restored to the pre-PR-86 API and unchanged orchestration/SPA runtime. Its additive Phase-A schema is
present; the final mailbox-key cutover was not applied. This documentation pass hardens the future
cutover plan and performs no further deployment, subscription replacement, historical backfill, EVA
query, Outlook mutation or production Archive write. Deployment, subscription replacement and signed-in
Chrome proof remain **PENDING**.

## Commits
- `2fd3eb6` — main-ancestral mega-commit implementing TKT-001..014,019,020 → rendered case-associated emails as
  navigable links and added the "view full email" control on the case/dashboard surfaces.
- `f419e31` — merged PR #86, carrying Microsoft Graph's exact Outlook web link and immutable message
  identity from intake through Postgres/API to the inbox and case email previews, with strict
  external-link validation.

## Files touched
- SPA case/dashboard email-association components + the inbound-email link rendering (within the
  `2fd3eb6` change set).

## Summary
Emails associated to a case now render as clickable items, plus a "view full email" link/button that
opens the full message. The original clickable preview and case/email data linkage have separate live
evidence. The reopened work that resolves and validates an exact Outlook message link is offline-only
until its rollout and signed-in verification are complete.

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
- New subscriptions are intended to send `Prefer: IdType="ImmutableId"`, and maintenance recognizes
  their versioned callback URL. An equivalent legacy and immutable-ID subscription cannot be relied on
  to coexist, so replacement is **not** create-before-delete. Routine maintenance now keeps and renews
  the legacy delivery path and reports `rotationRequired`; it never tries the Graph-invalid duplicate
  creation or deletes that path. The executable rotation attempt was rejected in review and removed:
  the future plan first needs durable delta checkpoints, drain proof, an operation ledger and an
  idempotent outbox. No subscription was changed by this work.
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
- `orchestration/src/lib/subscriptions.ts` and `subscriptions.test.ts` — retain/renew legacy
  subscriptions and report the blocked rotation instead of attempting an invalid automatic handoff.

### Offline evidence

- Domain link-policy tests: 11 passed.
- API mapper/schema-tolerance tests: 50 passed.
- Orchestration Graph tests: 12 passed, including `info@`, `engineers@`, and `desk@` mailbox coverage
  plus the immutable-id request header.
- SPA Outlook-action and saved-preview fallback tests: 4 passed.
- Follow-up focused tests: API 9, orchestration 46, SPA 7, and domain link policy 11 passed.
- Full suites after hardening: domain 1,188, API 723, orchestration 441, SPA 522 passed.
- Domain/API/orchestration TypeScript build: passed.
- Production SPA build: passed.
- `node verify-all.mjs`: 8 passed, 0 failed, 13 declared skips (retired Power Platform gates,
  locally unavailable Python virtual environments/corpus opt-in, and offline live-registry opt-in).

No Outlook mailbox mutation was performed by this implementation or its tests.

### Final-cutover plan still required

TKT-009 is an input workstream to the TKT-178 final production cutover, not a separate live operation to
run now. Its code and rehearsal evidence may advance offline, but its production DDL/deployment,
subscription replacement, backfill and signed-in proof remain blocked with the final cutover. The
following gates are mandatory; planning, fixtures and a dry-run do not satisfy them:

1. Supply the dated, signed-off job spreadsheet and record the exact artifact and approval that define
   the in-scope jobs and ordered actions.
2. Independently confirm the production Archive root and obtain explicit authorization for every
   production root retarget or write. Until then, Archive work is limited to the approved test root.
3. Produce a zero-write dry-run ledger, freeze its deterministic output, record its SHA-256 hash and
   obtain named approval of that exact hash. Any input or output change invalidates the approval.
4. Capture checksum-verified database and Archive inventories/backups, then attach proof that the
   documented restore procedure succeeds against a non-production copy.
5. The EVA API is currently blocked/unavailable. Do not query it or invent a response: the dry-run must
   record `not queried` and the reason. Before execution, prove the API is available, authenticated and
   returning the expected production evidence. **Final production execution remains blocked until this
   gate passes.**
6. Obtain the operator's final approval for the frozen job, the bounded intake pause, the subscription
   delete/recreate sequence and the authorized Archive/database actions.

After those gates pass, the frozen and separately approved execution plan still has to:

1. Re-confirm the already-applied phase-A Outlook-link + ledger state, which adds the composite key while
   retaining the old global key; if the approved target is ever rebuilt from an earlier snapshot, apply
   those additive deltas before proceeding. Then perform a short controlled cutover: stop orchestration, deploy the composite-upsert
   API, apply the mailbox-dedup cutover delta that drops the old key, prove the API is healthy, and
   restart orchestration. Do not describe this as a rolling zero-error migration: while both keys
   coexist, a genuinely duplicated Internet-Message-Id delivered to a second mailbox cannot be
   inserted without violating the old global key.
2. Deploy orchestration, mint a function-scoped resolver key, and configure the API's
   `OUTLOOK_LINK_RESOLVER_URL` plus Key-Vault-backed `OUTLOOK_LINK_RESOLVER_KEY`; then deploy API + SPA.
3. While the legacy subscription is still delivering, persist a pre-delete Inbox delta checkpoint and
   a durable one-mailbox operation row containing the approved operation ID, phase, legacy definition,
   exact deployment/config hashes and rollback data. Prove the legacy queue and Durable instances are
   drained to a recorded watermark before deletion; a database-only prefilter is not drain proof.
4. Under a time-bounded operation lease, delete only that mailbox's legacy Inbox subscription, create
   the immutable-ID replacement, and re-list Graph until exactly one expected replacement is confirmed.
   On an ambiguous create response, re-list before retrying. If coverage is absent, immediately recreate
   the recorded supported definition and keep the cutover blocked.
5. Resume the saved delta link to reconcile the gap, including messages moved or deleted after delivery.
   Store candidate work in a durable outbox keyed by operation/mailbox/message identity; publish and
   acknowledge each entry idempotently. Queue output arrays are not atomic and cannot prove all-or-none
   delivery. Do not resume intake until the outbox, resulting database identities and delta endpoint
   independently reconcile.
6. Repeat only after sign-off for the next mailbox. Sent Items requires its own documented checkpoint
   and recovery path; an Inbox-only tool must not advertise that it handles Sent Items.
7. Invoke historical backfill only after its own zero-write candidate report, frozen hash and explicit
   approval. Retain its ledger evidence and do not mutate any Outlook item.
8. Complete signed-in Chrome proof against an available sample from each production mailbox and a
   deleted/inaccessible saved-preview outcome. Outlook remains read-only throughout.

### Offline rehearsal and rollback notes

- Rehearse with production-shaped fixtures and the approved Archive **test root only**. Do not retarget
  the application, write beneath the production root, mutate Outlook, call a blocked EVA API or issue
  Graph subscription CRUD during rehearsal.
- Generate the ledger twice from identical canonical inputs and require identical ordered output and
  SHA-256 hash. Exercise duplicated Internet-Message-Ids across mailboxes, conflicting case identities,
  same-name/different-byte files, missing messages and an unavailable EVA API.
- Simulate interruption after each database, subscription and Archive phase. The rehearsal must prove
  that checkpoints prevent duplicate rows/files and that the documented restore procedure recovers the
  pre-cutover relationships and bytes.
- Rehearse persisted delta continuation, legacy-queue/Durable drain checks, ambiguous Graph create
  responses, immediate coverage restoration, outbox partial publication/retry and independent final
  reconciliation. A timestamp/current-folder scan is not sufficient because moved or deleted gap mail
  can disappear from that snapshot.
- Snapshot the previous configuration, subscription resource/notification URL, expiry, client-state
  reference, delta link and intake watermark before any future mutation. A deleted subscription ID
  cannot be restored; rollback means recreating the recorded supported definition, validating it and
  reconciling the entire persisted delta/outbox interval before intake resumes.
- If the spreadsheet, root, backup manifest, dry-run ledger or hash changes, stop. Repeat the dry-run,
  restore rehearsal and approval rather than carrying an old approval forward.

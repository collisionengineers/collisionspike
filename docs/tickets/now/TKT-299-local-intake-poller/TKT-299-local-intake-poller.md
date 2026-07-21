---
id: TKT-299
title: Local intake poller — pull-based mailbox drain for the shadow instance (PLAN-015 Slice B)
status: now
priority: P1
area: intake
tickets-it-relates-to: [TKT-106, TKT-296]
research-link: docs/tickets/plans/PLAN-015-app-alpha-testing.md
plan: PLAN-015
---

# Local intake poller for the shadow instance (PLAN-015 Slice B)

## Problem

During the alpha, live intake is re-scoped to the dedicated instructions mailbox, but email
evaluation must continue on the real traffic arriving at `info@`, `engineers@` and `desk@`. A local
shadow instance cannot receive Graph push notifications (no public endpoint), and normal intake is
push-only — the replay/backfill driver was removed by TKT-106. The shadow needs a pull path that
feeds the existing intake pipeline unchanged.

## Changes

New `services/orchestration/src/workflows/mailbox/intake-poll.ts` — a timer function
(`INTAKE_POLL_CRON`, default every 2 minutes) that:

- is dark unless BOTH `INTAKE_POLL_ENABLED` (new gate `gates.intakePoll()`) is true AND its own
  `INTAKE_POLL_MAILBOXES` (same `{mailbox, minIntakeDate}` JSON shape as `GRAPH_INTAKE_MAILBOXES`,
  deliberately a separate variable) parses non-empty;
- polls each configured mailbox strictly sequentially via the existing
  `listMessageIdsSince(mailbox, sinceIso)` adapter (Graph allows 4 concurrent requests per
  app+mailbox — never poll in parallel);
- enqueues each message id to the `intake-messages` queue in the exact lifecycle-resync message
  shape so `fetchMessage` derives `sourceMailbox` from the resource string;
- persists a per-mailbox watermark (floored at that mailbox's `minIntakeDate`) as a small JSON blob
  in an `intake-poll-state` container via the existing evidence-blob client factory (Azurite
  locally), advancing it only after the page's ids are enqueued;
- caps pages per run so a cold start with a deep backlog cannot run away.

This gate is a LOCAL-ONLY facility: it is never set on `cespk-orch-dev`. Overlap between poll
windows is dedup-safe (deterministic `intake-{messageId}` Durable instance ids + the
`inbound_email` unique source-message-id constraint).

## Acceptance criteria

- Both-conditions-dark: gate on with empty/absent mailboxes, or mailboxes set with gate off, does
  nothing (honest trace).
- Watermark floors at `minIntakeDate` on first run and advances to the adapter's `newWatermark`
  after each enqueued page; a poisoned watermark blob resets to the floor rather than throwing.
- Messages are enqueued in the resync shape (`resource` = `users/<mailbox>/mailFolders('Inbox')/messages/<id>`).
- Page cap honoured; mailboxes processed sequentially in config order.
- Unit tests cover the pure pieces (config parse, watermark floor/advance/reset, message shape,
  page cap).

## Artifacts

- [Changes made](./changes.md)

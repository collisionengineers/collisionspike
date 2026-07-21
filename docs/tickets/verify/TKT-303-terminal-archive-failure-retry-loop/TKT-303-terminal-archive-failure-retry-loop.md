---
id: TKT-303
title: A terminal Box refusal retries forever — classify it and park the outbox row
status: verify
priority: P1
area: archive
tickets-it-relates-to: [TKT-219, TKT-227, TKT-230]
research-link: docs/tickets/verify/TKT-303-terminal-archive-failure-retry-loop/evidence/diagnosis-2026-07-21.md
---

# A terminal Box refusal retries forever — classify it and park the outbox row

## Problem

One case whose `box_folder_id` pointed outside the pinned Box roots produced **1,896
`boxFolderCreate` exceptions in a single day** on `cespk-orch-dev`, and would have produced them
indefinitely. Full evidence: [evidence/diagnosis-2026-07-21.md](./evidence/diagnosis-2026-07-21.md).

The Box facade already distinguishes terminal from transient. `box_operations.py:193-206` proves
folder identity with the **write-side** scope guard before a case adopts a folder as its durable
Archive link, and `function_app.py:136-140` returns HTTP 400 for a scope violation with the
comment *"400 so it's never mistaken for a transient retryable failure."*

The orchestration then discarded that signal. `functions-client.ts:37` mapped every non-2xx to a
plain `Error` and threw *"so the Durable retry policy retries the calling activity"* — no status
inspection anywhere on the path. Two stacked retry policies amplified each permanently-doomed
case into **12 activity executions and 12 Box API calls per monitor wake**
(`box-folder-create.ts` `RetryOptions(5_000, 3)` × `provider-archive-monitor.ts`
`RetryOptions(10_000, 4)`).

Nothing ever gave up. The Data API's `defer` backs off `30 × 2^min(attempt_count, 6)` capped at
3600s, so the cadence decayed from ~10s to hourly but never to zero: the outbox row stayed
`requested > completed` and was re-listed on every wake, forever. A fresh `requestProviderArchive`
reset `attempt_count` to 0 and put it straight back on a 30-second cadence.

Cost was negligible (Flex Consumption, sub-second executions) and nothing was user-blocking. The
real damage was that the affected case could never clear its `provider_archive_pending` hold, and
that 2,528 of the day's 3,630 orchestration exceptions were this one loop — which makes the
"0 exceptions" health checks the deploy runbooks depend on unable to tell healthy from broken.

## Change

1. **Carry the upstream status structurally** — `functions-client.ts` throws
   `FocusedFnHttpError` (message byte-identical to the previous plain `Error`, so the existing
   message-regex callers such as `boxDownloadFailure` are untouched) with a `status` field, plus
   `isTerminalUpstreamStatus` — 4xx **except** 408/429 — and `isTerminalFnFailure`.
2. **Name our own refusals** — `box-folder-create.ts` throws `ArchiveLinkRefusal` for the four
   existing refusal paths (unpinned root, identity mismatch, link-without-Case/PO, first-wins
   linkage conflict). These still throw, so `ensureCaseArchiveFolder` keeps its refuse-loudly
   contract and every existing test passes unchanged.
3. **Convert terminal to an outcome at the activity boundary** — the `boxFolderCreate` activity
   catches `terminalArchiveFailure(e)` and **returns** `{skipped, terminal, reason, detail}`
   instead of throwing. Returning is what breaks the cascade: a returned value is recorded in
   Durable history once and replays deterministically, so neither retry policy engages. Anything
   unclassified (5xx, timeout, transport fault) still throws and still retries exactly as before.
4. **Park the row instead of re-listing it** — `provider-archive-monitor.ts` inspects the
   sub-orchestration result and, on `terminal`, defers with `terminal: true` and never
   acknowledges completion. The Data API `defer` route accepts `terminal` and sets
   `provider_archive_next_attempt_at = 'infinity'`, which the pending slice's
   `next_attempt_at <= now()` filter excludes. The row stays pending with its reason on
   `provider_archive_last_error` for an operator; `requestProviderArchive` unparks it, so recovery
   needs no manual database edit.

Deliberately unchanged: the Box facade. Its 400 is correct and its write-side guard on
`get_folder` is the right posture for adoption.

## Acceptance

- A Box facade 400 during folder ensure produces one recorded terminal outcome, not a retry
  cascade — no `boxFolderCreate` exception is raised for it at all.
- 408 and 429 from the facade, and any 5xx or transport fault, still retry with the existing
  policy.
- A terminally-parked outbox row stops appearing in `internal/provider-archive-outbox/pending`
  and is never acknowledged as complete.
- Re-requesting provider recovery for a parked case makes it eligible again.
- `cespk-orch-dev` shows zero `boxFolderCreate` exceptions across a window spanning at least two
  provider-archive monitor cycles.

## Out of scope

- **Retro reconstruction stamping a discovered live-archive folder as the case's durable
  `box_folder_id`** — the source of the bad data. `RETRO_ADOPT_ARCHIVE_PO_ENABLED` gates adoption
  of the discovered *Case/PO* but nothing gates adoption of the discovered *folder*, so retro
  keeps minting cases that point outside the pinned write root. This ticket stops the loop; it
  does not stop the poison. Tracked as TKT-304.
- The other eternal monitors showing the same anti-pattern (`archiveHoldingRecoverUploads`,
  `archiveMirrorOutboxList`, `evidenceBackfillPublisherDrain`, `providerArchiveOutboxList`).
  Volumes are recorded in the diagnosis; root causes are not established. Tracked as TKT-305.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Diagnosis evidence](./evidence/diagnosis-2026-07-21.md)

---
id: TKT-305
title: Audit every eternal Durable monitor for terminal failures retried forever
status: backlog
priority: P2
area: platform
tickets-it-relates-to: [TKT-227, TKT-303]
research-link: docs/tickets/verify/TKT-303-terminal-archive-failure-retry-loop/evidence/diagnosis-2026-07-21.md
---

# Audit every eternal Durable monitor for terminal failures retried forever

## Problem

TKT-303 fixed one instance of a pattern that recurs across the orchestration service: an eternal
Durable monitor drains an outbox, retries each item under a retry policy that makes no
terminal/transient distinction, and — because the outbox row is never acknowledged — re-lists the
same permanently-broken item on every wake, forever.

`cespk-orch-dev` exception counts by operation, from the same Application Insights pass
(2026-07-16 to 2026-07-21):

| Operation | Exceptions/day |
|---|---|
| `archiveHoldingRecoverUploads` | 1,632 / 1,254 / 1,702 / 1,702 / 1,138 / 278 |
| `boxPurgeOne` | 334 (16th), 860 (17th) — see TKT-227 |
| `providerArchiveOutboxList` | 286 on the 21st (Data API 500s, 16:45–18:05Z) |
| `archiveMirrorOutboxList` | 160 on the 21st |
| `evidenceBackfillPublisherDrain` | 276 on the 21st |

`archiveHoldingRecoverUploads` alone has been running at four-figures per day for at least six
days. **No root cause has been established for any of these** — only the volumes are evidence.
Each needs its own diagnosis before any change.

The cost is negligible (Flex Consumption, sub-second executions). The damage is that orchestration
exception counts are meaningless as a health signal: on 2026-07-21, 2,528 of 3,630 exceptions were
a single stuck case. The deploy runbooks' "0 exceptions / 0 sev>=3" checks cannot distinguish a
healthy deploy from a broken one while this noise floor exists.

## Change

Not designed. Per monitor: establish the actual failure, then decide whether TKT-303's shape fits
— classify terminal at the activity boundary, return an outcome rather than throwing, and park the
outbox row so it stops being re-listed. The building blocks TKT-303 added are reusable:
`isTerminalUpstreamStatus` / `isTerminalFnFailure` in `functions-client.ts`, and the
`terminal: true` defer contract on the provider-archive outbox route.

Consider whether the parked-row concept deserves a shared operator surface rather than a
per-outbox `last_error` column, so terminally-stuck work is visible without a database query.

## Acceptance

- Each monitor in the table above has a recorded root cause for its failures.
- Terminal failures are recorded once and parked; transient failures still retry.
- `cespk-orch-dev` sustains a low enough exception floor that the runbooks' post-deploy exception
  checks are meaningful again.

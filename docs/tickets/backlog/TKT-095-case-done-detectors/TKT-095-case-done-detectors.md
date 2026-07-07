---
id: TKT-095
title: Case `done` detectors — manual → Box report-PDF → sent-email → EVA poll
status: backlog
priority: P1
area: intake
tickets-it-relates-to: [TKT-094, TKT-061, TKT-058]
research-link: docs/tickets/backlog/TKT-095-case-done-detectors/evidence/operator-note.md
plan: PLAN-002
---

# Case `done` detectors — manual → Box report-PDF → sent-email → EVA poll

> Phase C of the case-done-lifecycle cluster. Depends on **TKT-094** (the `done` status model). The full
> plan lives in [TKT-094/evidence/PLAN-case-done-lifecycle.md](../TKT-094-case-done-status-model/evidence/PLAN-case-done-lifecycle.md).

## Problem

Once TKT-094 adds the `done` terminal state, something has to actually *emit* it — i.e. detect that the
CE report has been delivered back to the work provider. There are three real-world signals (sent email,
Box report-PDF, gated EVA poll) plus a manual bridge, and every transition must be safe under Durable
at-least-once, Box webhook re-delivery, and double-clicks.

## Evidence

- `evidence/operator-note.md` — Phase C of the plan (the three detectors + the recommended thin-slice
  manual bridge).
- The Box `FILE.UPLOADED` webhook is already live + E2E-proven (TKT-061), so detector (b) has the least
  new infra.

## Proposed change

PROPOSED (not built) — **Phase C**:
- **Shared transition endpoint first:** `POST /api/internal/cases/{id}/mark-done` (`withServiceAuth`),
  guarded idempotent `WHERE status_code = eva_submitted`, then audit `report_delivered`; add
  `markDone(...)` to the orch data-api lib and `mark_case_done(...)` to the Python box-webhook client.
- **Thin-slice bridge:** a manual "Mark report delivered" `CaseDetail` button (visible only when
  `eva_submitted`) → a staff-role `POST /api/cases/{id}/mark-done` — makes `done` usable day one.
- **Detector (b) Box report-PDF** (build first): classify a CE-report upload in the live box-webhook
  receiver; if the case is `eva_submitted`, mark done + persist as `engineer_report` evidence.
- **Detector (a) sent-email-to-provider** (build second): new Graph subscription on `SentItems`;
  confirm a recipient matches the case's provider + resolve the case by conversation/ref; behind
  `DONE_SENT_EMAIL_ENABLED` (default off, dark).
- **Detector (c) EVA poll** (build last, gated dark): Durable eternal-timer polling
  `GET /Report/GetAvailableReports`; gated on `EVA_API_ENABLED`.

## Acceptance

- Manual bridge: an `eva_submitted` case → "Mark report delivered" → badge Done + `report_delivered`
  audit row + appears under Completed.
- Detector (b): report-named PDF into the case Box folder flips `eva_submitted → done`; re-delivery of
  the same webhook is a no-op.
- Detector (a): with the gate on in a test slot, a CE→provider send on a threaded `eva_submitted` case
  flips it to `done`; a send to a non-provider recipient does not.

## Research

Distilled 2026-07-07 from `PLAN-case-done-lifecycle.md` (Phase C); full plan in the anchor
[TKT-094](../TKT-094-case-done-status-model/TKT-094-case-done-status-model.md).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)

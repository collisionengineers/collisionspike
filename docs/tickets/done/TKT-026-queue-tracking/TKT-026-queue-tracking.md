---
id: TKT-026
title: Queue counts don't match the actual queues
status: done
priority: P2
area: dashboard
tickets-it-relates-to: [TKT-012]
research-link: docs/tickets/done/TKT-026-queue-tracking/evidence/operator-note.md
---

# Queue counts don't match the actual queues

## Problem
The dashboard queue tracking is not 100% following the actual queues — the
displayed queue counts do not reconcile with the real contents of those queues.
Staff cannot trust the counts as a true reflection of work outstanding.

## Evidence
- `evidence/operator-note.md` — the operator's drop-note ("queue tracking not
  100% following actual queues").
- `evidence/1.png` — screenshot of the queue tracking showing the mismatch.

## Proposed change
PROPOSED (not built):
- Reconcile the queue-count source with the actual queue membership so the
  dashboard counts are derived from the same status/queue definition that
  populates each queue list (single source of truth).
- Audit the status → queue mapping for cases that are counted in the wrong
  bucket or double-counted / missed, and correct the aggregation.

## Acceptance
- Each queue's displayed count equals the number of cases actually shown in that
  queue.
- No case is double-counted or missing from its expected queue.
- Counts update consistently as cases move between statuses/queues.

## Research
Distilled 2026-06-30 from an operator drop-note; raw material in [evidence/](./evidence). No formal research pack yet.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)

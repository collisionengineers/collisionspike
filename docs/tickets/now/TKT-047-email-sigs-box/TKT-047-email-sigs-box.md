---
id: TKT-047
title: Email signature images archived to Box in error
status: now
priority: P2
area: intake
tickets-it-relates-to: [TKT-003, TKT-002]
research-link: docs/tickets/now/TKT-047-email-sigs-box/evidence/operator-note.md
---

# Email signature images archived to Box in error

## Problem (operator drop-note, verbatim in [evidence/operator-note.md](./evidence/operator-note.md))

Outlook treats e-mail signature images as attachments; they get extracted and saved to the case's
Box folder in error.

## Current state

The Graph fetch already drops attachments flagged `isInline` — what slips through are signature
images attached as **regular (non-inline) file attachments**.

## Wanted

Extend the existing inline skip with a raster floor for non-inline images, mirroring the engine's
decorative-raster semantics (pixel-**area** floor, unknown-dimensions-kept): a small PNG/JPEG header
dimension-sniff with a byte-size fallback, applied at message fetch so signatures never become
evidence or reach the archive.

## Delivery

Phase 2 of the [Rules Engine v2 plan](../../../plans/rules_engine_v2_plan_9ba034c4.plan.md); the engine
side (sibling PR #4/#5 decorative filter) covers document-embedded rasters.

## Status update — 2026-07-08 (operator live-failure report)

Verdict trail: [verification.md](./verification.md) (FAILED-live 2026-07-08).

[evidence/operator-failure-report-2026-07-08.md](./evidence/operator-failure-report-2026-07-08.md) —
"Signatures still being picked up and filed to Box from many emails." Treat the verify verdict as
FAILED-live: the email-lane floor is provably acting (TKT-089 telemetry), so the leak points at
signatures above the area floor and/or the PDF-extraction lane.

## Status update — 2026-07-02 (now — deployed live, awaiting live proof)

`de7991d` (feat(orch): non-inline signature-image raster floor) is deployed live on `cespk-orch-dev`:
a PNG/JPEG header dimension sniff applies the engine's 40,000 px² area floor to non-inline attachments at
Graph fetch time (`orchestration/src/lib/image-sniff.ts`), with unknown dimensions kept unless under an
8KB byte-size floor (to protect tiny logos), every skip logged by name + reason, and a
`GRAPH_IMAGE_FLOOR_DISABLED` kill switch. Unit-tested (`image-sniff.test.ts`). No live proof yet on a real
signature-bearing email — the fix has not been exercised against an actual inbound message carrying a
non-inline signature image since deploy.

## Artifacts

- [changes.md](./changes.md)

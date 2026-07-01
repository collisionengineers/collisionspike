---
id: TKT-047
title: Email signature images archived to Box in error
status: backlog
priority: P2
area: intake
tickets-it-relates-to: [TKT-003, TKT-002]
research-link: docs/tickets/TKT-047-email-sigs-box/evidence/operator-note.md
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

Phase 2 of the [Rules Engine v2 plan](../../plans/rules_engine_v2_plan_9ba034c4.plan.md); the engine
side (sibling PR #4/#5 decorative filter) covers document-embedded rasters.

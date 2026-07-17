---
id: TKT-242
title: Network-drive VRM scan channel for image receipt
status: backlog
priority: P3
area: intake
tickets-it-relates-to: [TKT-118]
research-link: docs/reviews/160726/decisions.md
---

# Network-drive VRM scan channel for image receipt

## Problem

Case photos accumulate on the office network drive with registrations embedded in filenames and folder
names, but there is no channel that proposes them to Cases. Review 160726 decided the channel
(ADR-0007, channel 4: decided 2026-07-16; not built).

## Evidence

- [Review 160726](../../../reviews/160726/decisions.md) — recorded via the ADR-0007 rewrite.
- ADR-0007 — Receipt of images, channel 4.

## Proposed change

PROPOSED (not built):

- A staged scan reads registrations from network-drive filenames and folder names and proposes
  open-Case matches under ADR-0002/0010; nothing attaches without staff confirmation.
- Each attachment records the network-drive receipt channel; ambiguous media stays visible.
- Any write-capable agent expression of this channel follows ADR-0023's write tier.

## Acceptance

- A staged folder containing registration-named media produces reviewable match proposals with the
  channel recorded, and no automatic attachment occurs.
- Unmatched or ambiguous media remains visible for staff handling.

## Research

Distilled 2026-07-17 from [Review 160726](../../../reviews/160726/decisions.md) (ADR-0007 rewrite).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)

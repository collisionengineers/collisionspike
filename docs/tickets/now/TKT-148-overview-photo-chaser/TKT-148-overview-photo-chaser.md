---
id: TKT-148
title: Targeted overview-photo chaser for cases whose photo sets genuinely lack a vehicle overview
status: now
priority: P2
area: pipeline
tickets-it-relates-to: [TKT-131, TKT-130]
research-link: docs/tickets/now/TKT-148-overview-photo-chaser/evidence/operator-note.md
plan: PLAN-003
---

# TKT-148 — Targeted overview-photo chaser for cases whose photo sets genuinely lack a vehicle overview

## Problem

Post-classification, cases like A.QDOS26029 (28 photos, zero overview-with-registration) are honestly stuck at missing_images — the fix is a real photo, not classification. The data now exists to drive a targeted "send a full-vehicle photo showing the plate" chase.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — final-wave workflow finding, 2026-07-09.

## Proposed change

PROPOSED (not built): a detector for classified-but-overview-less photo sets feeding the chaser workflow (draft-first per the chaser model); handler-plain chase copy.

## Acceptance

- Cases with >=N accepted photos and zero overview candidates surface a suggested overview chase (draft, staff-sent).
- A.QDOS26029 surfaces one (live).

## Research

Filed 2026-07-09 from the final-wave D2 report (PLAN-003 workflow finding).

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)

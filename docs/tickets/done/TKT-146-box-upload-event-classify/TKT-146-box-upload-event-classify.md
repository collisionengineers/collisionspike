---
id: TKT-146
title: Classify images at Box-upload event time (the FILE.UPLOADED lane has no classify path)
status: done
priority: P2
area: evidence
tickets-it-relates-to: [TKT-112, TKT-131, TKT-064]
research-link: docs/tickets/done/TKT-146-box-upload-event-classify/evidence/operator-note.md
plan: PLAN-003
---

# TKT-146 — Classify images at Box-upload event time (the FILE.UPLOADED lane has no classify path)

## Problem

Images arriving via Box FILE.UPLOADED register evidence rows but are never vision-classified at event time (the orch classify path only covers email/PDF intake) — they sit role-unknown until a batch backfill.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — final-wave workflow finding, 2026-07-09.

## Proposed change

PROPOSED (not built): per the TKT-112 ownership model (orch owns autonomous stamps), add an event-time classify hop for box_upload evidence (orch queue consumer or an internal API callback), same never-throws semantics.

## Acceptance

- A Box-uploaded vehicle image carries a role + registration_visible shortly after upload (live proof on the test area).
- Failures fall back to role unknown without blocking registration.

## Research

Filed 2026-07-09 from the final-wave D2 report (PLAN-003 workflow finding).

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)

---
id: TKT-315
title: Inbound-triage rewrite Phase 5 — collapse the vendored triplication and TS/Python twins
status: backlog
priority: P2
area: triage
tickets-it-relates-to: [TKT-314]
plan: PLAN-016
research-link: docs/tickets/next/TKT-310-inbound-triage-ground-truth-corpus/evidence/code-read-2026-07-21.md
---

# Inbound-triage rewrite Phase 5 — collapse the vendored triplication and TS/Python twins

## Problem

The classification engine is vendored three times — `services/engine/cedocumentmapper_v2/`
(authoring source), `services/functions/parser/`, `services/functions/ocr/` — synced by
`scripts/build/sync-engine.py` and gated by `scripts/checks/check-engine-materialized.py`, all
confirmed present. That triplication is already *managed* by tooling: porting a fix is one edit
plus a resync (see TKT-307, done this session). The real drift risk is the hand-written TS
twins kept parallel by comment only, e.g. `triagePolicy.ts`'s `_SIGNATURE_IMAGE_RE` /
`deliveredImagesOnly` vs the Python `_SIGNATURE_IMAGE_RE` / `_delivered_images_only` — a fix
there touches two logical sites with no tooling to keep them in sync (TKT-307 touched both by
hand).

Independently schedulable once TKT-314 (Phase 4) ships; not blocking the taxonomy rewrite's
correctness, only its long-term maintainability.

## Change

Not designed. Collapse to one installable package the orchestrator calls, rather than
re-implementing the engine's logic in TypeScript. Consolidation is hard-to-reverse — record an
ADR under `docs/adr/` for the single-package decision **before** executing this phase, not
after.

## Acceptance

- An ADR exists and is accepted before any consolidation code lands.
- The orchestrator calls the engine for every classification decision currently duplicated by a
  hand-written TS twin; no behaviour-affecting logic is re-implemented in TypeScript.
- `check-engine-materialized.py`'s role is either preserved (if the triplication itself remains,
  now with the twins folded in) or explicitly superseded by the ADR's chosen packaging
  mechanism — not just silently dropped.

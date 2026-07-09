---
id: TKT-131
title: Classify the role-unknown evidence images — retry the backfill residue so cases can reach Ready for EVA
status: verify
priority: P1
area: evidence
tickets-it-relates-to: [TKT-064, TKT-088, TKT-112, TKT-130]
research-link: docs/tickets/verify/TKT-131-image-role-classify-retry/evidence/operator-note.md
plan: PLAN-003
---

# TKT-131 — Classify the role-unknown evidence images — retry the backfill residue so cases can reach Ready for EVA

## Problem

After the TKT-129/130 readiness repair, the blocker for many cases (e.g. A.QDOS26029 — 20 accepted images, zero classified overview-with-visible-registration) is evidence images stuck at role unknown: the ~82 TKT-064 backfill errors were never retried, and pre-backfill/box-lane images were never classified. The EVA image rule needs one overview (registration visible) + one damage closeup, so role-unknown images starve ready_for_eva.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — origin note (workflow finding, 2026-07-09).
- D1 batch report 2026-07-09: A.QDOS26029 evaluates missing_images with 20 accepted images, zero classified overview.
- LIVE_FACTS 2026-07-06: 2704/2784 classified; ~82 MIME/box-fetch errors retryable; box-webhook live-classify path not built.

## Proposed change

PROPOSED (not built): re-run the vision classification over all evidence images with role unknown/null (blob + Box facade lanes), fix the ~82 error causes (MIME/fetch), and record per-case EVA-image-rule movement; decide/document the box-upload live-classify path (TKT-112 ownership applies).

## Acceptance

- All classifiable evidence images carry a role (residual error list enumerated with causes).
- A.QDOS26029 (or an equivalent) passes the EVA image rule after reclassification if its photos genuinely contain an overview with visible registration.
- Case-status re-evaluation movement recorded (how many cases newly pass the image rule).

## Research

Filed 2026-07-09 from the D1 (readiness spine) batch report — an issue encountered during the
PLAN-003 workflow, added per the operator's standing instruction.

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)

## Scope addendum — 2026-07-09

The UI-wave batch added evidence.person_reflection / reflection_dismissed (delta applied live) with the orch classifier stamping the flag from the next intake onward — the ~8.2k historical image rows are unflagged. Fold the reflection-flag backfill into this ticket's reclassification pass (same model call already returns person_reflection).

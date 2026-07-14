---
id: TKT-167
title: Keep image chasers available until every image rule passes
status: verify
priority: P1
area: pipeline
tickets-it-relates-to: [TKT-089, TKT-123, TKT-130, TKT-131, TKT-148, TKT-156]
research-link: docs/tickets/verify/TKT-167-image-gap-chasers/evidence/code-audit.md
plan: PLAN-004
---

# Keep image chasers available until every image rule passes

## Problem
The case screen currently treats the presence of any image row as “images received” and hides general image chasers. Excluded, wrongly classified or incomplete photos can therefore disable the very chaser needed to correct them.

## Evidence
- [Code audit](./evidence/code-audit.md) — current raw-image predicate and template filtering.
- TKT-148 covers one overview-photo draft only; it does not make general chaser availability follow all image rules.

## Proposed change
PROPOSED (not built): derive chaser options and wording from the same canonical image-rule failures that determine readiness.

## Acceptance
- Image-chaser availability is derived from canonical accepted-image rules, not the count or mere presence of raw image evidence.
- Zero accepted images or a set where every image is excluded keeps the general image request and upload-link chasers available.
- Missing registration-visible overview, damage close-up, required angle/role, unreadable/invalid images and any other readiness-owned image gap expose appropriate editable chaser wording even when other images exist.
- A reflection-only observation on an Image Based Assessment case follows TKT-161 and does not create a false gap.
- Chasers are suppressed for image completeness only when every applicable image rule passes; non-image chaser types retain their own eligibility.
- Each offered draft names only the unresolved handler-recognisable gap, is editable, and uses the active File Request from TKT-156 when an upload link is required.
- Chaser availability recomputes after classification, include/exclude, delete, upload, inspection-decision and merge changes without a hard refresh.
- Tests cover no images, all excluded, wrong role, registration not visible, missing close-up, reflection exception, fully valid set, concurrent classification and instruction/no-instruction combinations.
- Deployed Chrome proof walks one designated test case from each representative gap through a successful upload/classification and shows the relevant option disappearing only when that gap is resolved.

## Research
Distilled 2026-07-12 from operator item 6 and confirmed by the production-readiness source audit.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Code audit](./evidence/code-audit.md)

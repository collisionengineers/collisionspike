---
id: TKT-180
title: Use one icon for each app concept
status: backlog
priority: P3
area: ui
tickets-it-relates-to: [TKT-155, TKT-157]
research-link: docs/tickets/backlog/TKT-180-icon-semantic-consistency/evidence/icon-surface-audit.md
plan: PLAN-004
---

# Use one icon for each app concept

## Problem
The dashboard and navigation use different icons for the same queues and actions. A handler has to relearn the meaning of Not ready, Review, Held and Inbox between surfaces, and similar-looking concepts do not have one governed source of truth.

## Evidence
- [Operator source material](./evidence/operator-source/) compares the mismatched dashboard and navigation icons.
- The production SPA already uses Fluent UI; creating custom or generated bitmap icons would add another visual language rather than resolving the mismatch.
- The cross-surface inventory and chosen mapping are to be recorded at [icon-surface-audit.md](./evidence/icon-surface-audit.md).

## Proposed change
PROPOSED (not built):
- Define one shared semantic icon map for app concepts and render it through a shared Fluent component.
- Use Fluent icons only for navigation, dashboard, queue, status and action concepts in scope.
- Keep visible text with workflow icons and treat the icon as reinforcement, not the sole carrier of meaning.

## Acceptance
- **A1.** Inbox, Not ready, Review and Held each use one documented Fluent icon consistently in the main navigation, dashboard cards, queue headings and any repeated status summary where that concept appears.
- **A2.** All repeated workflow concepts on the audited navigation, dashboard, queue and action surfaces obtain their icon from one semantic map or shared component; those surfaces do not carry private duplicate mappings.
- **A3.** Distinct concepts are not assigned the same icon where that would make their actions or destinations ambiguous, and the mapping audit records the reason for every intentional reuse.
- **A4.** No custom SVG, generated image or bitmap icon is introduced for the audited workflow concepts. Brand marks, email content and evidence photos are outside this prohibition.
- **A5.** Every icon is accompanied by visible text or an accessible name appropriate to its control; decorative duplicates are hidden from assistive technology, and status is never communicated by icon or colour alone.
- **A6.** Icons remain aligned and recognisable in default, hover, focus, selected, disabled and high-contrast states at supported desktop/narrow layouts and 200% zoom.

## Validation
- Inventory the current semantic icons on every in-scope surface and agree the resulting Fluent mapping before implementation.
- Add unit tests for the shared mapping and rendered tests proving repeated concepts resolve to the same icon.
- Add negative source/static checks for private in-scope mappings and new custom/bitmap workflow assets.
- Run keyboard, screen-reader, high-contrast, responsive and 200% zoom checks.
- After deployment, capture signed-in paired views of navigation, dashboard and each queue and reconcile them with the approved mapping audit.

## Research
Distilled 2026-07-13 from the operator’s icon-mismatch review. The pre-change inventory, approved semantic map and live paired screenshots belong in [evidence/icon-surface-audit.md](./evidence/icon-surface-audit.md).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator mismatch note](./evidence/operator-source/mismatch.md)
- [Planned research evidence](./evidence/icon-surface-audit.md)

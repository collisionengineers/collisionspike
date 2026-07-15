---
id: TKT-179
title: Make photo decisions explicit
status: backlog
priority: P2
area: ui
tickets-it-relates-to: [TKT-048, TKT-064, TKT-123, TKT-130, TKT-161, TKT-167]
research-link: docs/tickets/backlog/TKT-179-evidence-image-decision-controls/evidence/photo-decision-state-proof.md
plan: PLAN-004
---

# Make photo decisions explicit

## Problem
Each evidence image currently exposes “Use for EVA” and “Exclude” as overlapping controls. A handler can read them as opposites even though the stored state also permits an undecided image. “Registration visible” and the Overview role are presented close enough to look like another duplicate decision, although registration visibility is independent: every Overview must show the registration, but an image can show the registration without being the Overview.

## Evidence
- [Operator source material](./evidence/operator-source/) shows the overlapping image controls in the live evidence view.
- The current evidence model distinguishes accepted, excluded and neither-yet-decided images; reducing it to a two-state switch would lose a real review state.
- The photo-order rule requires an Overview to show the registration, while other image roles may also show it.
- The state-transition proof is to be recorded at [photo-decision-state-proof.md](./evidence/photo-decision-state-proof.md).

## Proposed change
PROPOSED (not built):
- Replace the separate “Use for EVA” and “Exclude” controls with one “Photo use” choice: “Not decided”, “Use for EVA” or “Do not use”.
- Keep “Registration visible” as a separate fact about the image.
- Make selecting the Overview role set “Registration visible” in the same save, without making the reverse action select Overview.
- Preserve exclusion reasons, audit history, readiness and EVA export behaviour through one canonical state mapping.

## Acceptance
- **A1.** Every editable evidence image presents one “Photo use” control with exactly “Not decided”, “Use for EVA” and “Do not use”; separate handler-facing “Use for EVA” and “Exclude” toggles are removed from all evidence surfaces.
- **A2.** The three choices map unambiguously to the existing state: “Not decided” means not accepted and not excluded, “Use for EVA” means accepted and not excluded, and “Do not use” means not accepted and excluded; accepted and excluded can never both be true after a save.
- **A3.** Choosing “Do not use” preserves the existing reason requirement and audit entry, and changing away from it cannot leave a hidden active exclusion reason or an inaccurate audit summary.
- **A4.** “Registration visible” remains independently editable for every image role. Selecting Overview sets registration-visible in the same atomic save, but setting registration-visible does not select Overview and does not change another chosen role.
- **A5.** An Overview cannot be saved with registration-visible false. A failed or concurrent save leaves the previously confirmed state visible and gives the handler a retryable, plain-language error rather than displaying a state that was not stored.
- **A6.** Readiness, photo ordering and EVA export consume the canonical saved choice: only “Use for EVA” images are exported, “Do not use” images are omitted, and “Not decided” remains visibly unresolved where the readiness policy requires a decision.
- **A7.** Existing evidence records reload into the correct one-choice state without losing role, registration-visible, exclusion reason, order or prior audit history; any impossible accepted-and-excluded record is reported for remediation rather than silently guessed.
- **A8.** The control, its reason field and validation messages are keyboard operable, screen-reader named, and usable at the supported narrow layout and 200% zoom.

## Validation
- Add domain tests for all three mappings, every transition between them, the forbidden accepted-and-excluded state and Overview’s one-way implication.
- Add component tests for selection, reason capture/clearing, failed and concurrent saves, reload, keyboard operation and accessible naming.
- Run readiness, photo-order and EVA-export suites against accepted, excluded and undecided fixtures.
- Produce a read-only inventory of impossible prior combinations before migration; preserve them for explicit remediation instead of coercing them.
- After deployment, observe and record genuine operator-designated photo decisions. Exercise only transitions
  required for that case, reload the page, and reconcile visible state with the stored record and audit event;
  keep unavailable live transitions PENDING and prove them in isolation rather than changing live evidence
  solely for verification.

## Research
Distilled 2026-07-13 from the operator’s evidence-control review and the existing three-state evidence contract. The migration inventory and signed-in state proof belong in [evidence/photo-decision-state-proof.md](./evidence/photo-decision-state-proof.md).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator control note](./evidence/operator-source/info.md)
- [Planned research evidence](./evidence/photo-decision-state-proof.md)

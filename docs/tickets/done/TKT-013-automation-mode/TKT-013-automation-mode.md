---
id: TKT-013
title: Define + enforce the per-provider automation modes
status: done
priority: P2
area: platform
tickets-it-relates-to: [TKT-006, TKT-004]
research-link: docs/tickets/done/TKT-013-automation-mode/TKT-013-automation-mode.md
---

# Define + enforce the per-provider automation modes

## Problem
The automation modes are not yet set — **each needs defining precisely**. (These are the per-provider
"how much do we automate" modes that govern how far a case auto-advances vs waits for a handler.)

## Evidence
The provider corpus carries per-provider policy (instruction notes, image-source notes, inspection-location
policy, mailboxes). Automation mode is the missing axis: canonicalise the mode set, expose a provider
update path, and have the orchestration honour the provider's mode. See the research pack.

## Proposed change
Canonicalise the automation modes (precise definitions + the allowed set), add the provider update API to
set a provider's mode, and enforce the mode in the orchestration pipeline.

## Acceptance
The modes are documented with precise semantics; a provider's mode is settable; orchestration behaviour
changes per the provider's mode.

## Research
- Operator stub: [am.md](TKT-013-automation-mode.md)
- Research pack: [research/am.md](TKT-013-automation-mode.md)

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)

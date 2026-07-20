---
id: TKT-285
title: Guided capture — physical device quality-gate calibration
status: backlog
priority: P2
area: integration
tickets-it-relates-to: [TKT-278, TKT-279]
research-link: docs/tickets/backlog/TKT-285-guided-capture-device-gate-calibration/evidence/scope.md
---

# Guided capture — physical device quality-gate calibration

## Problem

Renumbered from collisioncapture's `CCAP-016-device-gates-calibration` during the TKT-278 repository
merge. No evidence directory, calibration record, or executed calibration exists anywhere in the merged
repository for the guided camera's deterministic quality thresholds (brightness/contrast/sharpness/
motion/stability) against real devices. This depends on TKT-279's device matrix existing first.

## Evidence

- [Scope](./evidence/scope.md).

## Proposed change

Once TKT-279's device matrix has run, calibrate the guided camera's quality-heuristic thresholds against
real-device behaviour and record the calibration basis (which devices, which conditions, what threshold
values and why).

## Acceptance

- Calibration record exists, tied to real device evidence, not tuned blind.
- Any threshold change is offline-tested against `packages/capture-core`'s existing guidance unit tests
  before being adopted.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Scope](./evidence/scope.md)

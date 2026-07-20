---
id: TKT-279
title: Guided capture — real-device camera matrix
status: backlog
priority: P2
area: integration
tickets-it-relates-to: [TKT-278, TKT-200, TKT-282]
research-link: docs/tickets/backlog/TKT-279-guided-capture-device-camera-matrix/evidence/scope.md
---

# Guided capture — real-device camera matrix

## Problem

The `apps/capture-web` guided camera (exposure/contrast/sharpness/motion/stability heuristics) and its
OS/file-picker fallback are implemented and unit-tested, but only against jsdom/mocked media APIs. No
physical iPhone Safari or Android Chrome device has run the guided camera flow, the in-app-browser
handoff (SMS/email link opened from Messages/Mail/WhatsApp), permission-denial recovery, or the
various real-world lighting/motion conditions the deterministic heuristics are meant to handle.
Renumbered from collisioncapture's own `CCAP-003-real-device-camera-matrix` during the TKT-278
repository merge.

## Evidence

- [Scope](./evidence/scope.md) — the original CCAP-003 acceptance criteria, carried forward unchanged.

## Proposed change

Run the guided-capture flow on a real device matrix (iPhone Safari, Android Chrome, at minimum) covering:
in-app-browser link opening, camera permission grant/deny/revoke, guided-camera quality heuristics
under real lighting/motion, the OS/file-picker fallback path, and draft recovery across app
backgrounding/foregrounding. Record pass/fail evidence per device/scenario.

## Acceptance

- A real-device matrix (models/OS versions to be selected at execution time) exercises every capture
  route (guided camera, OS/file fallback) and every documented lifecycle recovery path.
- Evidence is recorded per device/scenario, not just "it worked on my phone."
- Any heuristic threshold found unsuitable for real devices is raised as its own follow-up, not silently
  tuned without evidence.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Scope](./evidence/scope.md)

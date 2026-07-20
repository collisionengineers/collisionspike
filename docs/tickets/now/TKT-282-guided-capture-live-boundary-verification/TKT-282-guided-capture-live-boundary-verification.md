---
id: TKT-282
title: Guided capture — client-server live boundary verification (urgent — gates already live-on)
status: now
priority: P1
area: integration
tickets-it-relates-to: [TKT-278, TKT-200, TKT-159]
research-link: docs/tickets/now/TKT-282-guided-capture-live-boundary-verification/evidence/scope.md
---

# Guided capture — client-server live boundary verification (urgent)

## Problem

Renumbered from collisioncapture's `CCAP-013-live-boundary-verification` during the TKT-278 repository
merge, and raised to `now`/P1: TKT-159's 2026-07-20 live-facts audit found `PUBLIC_CAPTURE_ENABLED`,
`CAPTURE_SESSIONS_ENABLED`, and `CAPTURE_DIRECT_UPLOAD_ENABLED` are already live-ON on `cespk-api-dev`
**without** the deliberate, evidenced round-trip verification this ticket exists to perform, and without
the documented Front Door ingress-lockdown prerequisite. This is not "the pilot verification happened
early" — it is unauthorized/unreviewed live exposure that happens to share the same flags. TKT-200's own
`verification.md` still records the client↔server round trip as PENDING.

## Evidence

- [Scope](./evidence/scope.md) — the original CCAP-013 checklist, and the TKT-159 finding that makes
  this urgent.

## Proposed change

Execute the full live client↔server round trip against `cespk-api-dev` + `apps/capture-web` on dev,
recording evidence for: bootstrap-fragment exchange and history-clearing, resume-cookie renewal,
terminal session states (expired/revoked/locked), idempotent upload/submit, and the manifest
reconciliation path. This ticket does not itself decide whether to leave the gates on or off — that is
TKT-159's operator decision — but it must produce the evidence TKT-159's "leave exposed, document only"
decision was made without.

## Acceptance

- A recorded, evidenced live round trip exists for every item in the original CCAP-013 checklist.
- The result is cross-referenced from TKT-159 so the live-gate decision has real evidence behind it,
  not just an operator's provisional call to leave things as they are.
- Any live behaviour that diverges from the offline-verified TKT-200 implementation is raised as its own
  finding, not silently absorbed into "verified."

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Scope](./evidence/scope.md)

---
id: TKT-286
title: Guided capture — deterministic advisory pilot launch (blocked on TKT-159)
status: blocked
priority: P1
area: integration
tickets-it-relates-to: [TKT-278, TKT-159, TKT-282]
research-link: docs/tickets/blocked/TKT-286-guided-capture-advisory-pilot-launch/evidence/scope.md
---

# Guided capture — deterministic advisory pilot launch (blocked on TKT-159)

## Problem

Renumbered from collisioncapture's `CCAP-017-advisory-pilot-launch` during the TKT-278 repository
merge. CCAP-017 asked for a *deliberate*, monitored, telemetry-checked pilot flip of the public capture
gates on live cases. That has not happened in the intended sense: TKT-159's 2026-07-20 live-facts audit
found `PUBLIC_CAPTURE_ENABLED`, `CAPTURE_SESSIONS_ENABLED`, and `CAPTURE_DIRECT_UPLOAD_ENABLED` already
live-ON, with no recorded operator decision to launch a pilot, no Front Door ingress lockdown, and
`LIVE_FACTS.json` still recording `false` as recently as 2026-07-19 — directly contradicting the live
readback. This is an unauthorized/unreviewed exposure that happens to share the same flags as the
intended pilot, not the pilot itself.

## Evidence

- [Scope](./evidence/scope.md).

## Proposed change

Do not treat the current live-on state as "pilot achieved." This ticket is blocked until TKT-159's
discrepancy is resolved (an explicit operator decision recorded, and the ingress-lockdown question
answered one way or the other) and TKT-282's live-boundary verification evidence exists. Only then can a
genuine, monitored, telemetry-checked advisory pilot be planned and launched.

## Acceptance

- TKT-159's live/documented-state discrepancy is resolved with an explicit, recorded operator decision.
- TKT-282's live round-trip verification evidence exists.
- Only after both of the above: a monitored pilot launches with defined telemetry, a rollback trigger,
  and a bounded case set — not a silent continuation of the current unplanned exposure.

## Blocked by

TKT-159 (live-gate discrepancy, unresolved) and TKT-282 (live-boundary verification, not yet run).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Scope](./evidence/scope.md)

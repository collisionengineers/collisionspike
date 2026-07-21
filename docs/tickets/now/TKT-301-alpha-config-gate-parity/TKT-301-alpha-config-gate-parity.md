---
id: TKT-301
title: Config-capture and gate-registry parity for the alpha gates (PLAN-015 Slice D)
status: now
priority: P1
area: platform
tickets-it-relates-to: [TKT-159, TKT-296]
research-link: docs/tickets/plans/PLAN-015-app-alpha-testing.md
plan: PLAN-015
---

# Config-capture and gate-registry parity for the alpha (PLAN-015 Slice D)

## Problem

PLAN-015 introduces two new gates (`EVA_SHADOW_AUTOSUBMIT_ENABLED`, `INTAKE_POLL_ENABLED`) and its
cutover will change live app settings (`GRAPH_INTAKE_MAILBOXES`, capture gates, `EVA_API_ENABLED`).
The gate documentation and the config-capture bicep must not drift from that (TKT-159's whole
theme). Note the split: this ticket lands the parts that are true NOW (new gates documented as
ship-dark; capture entries for settings that exist today); the post-cutover live-state updates
(LIVE_FACTS, feature-gates live columns, bicep value flips) are Phase 7 runbook paperwork executed
with dated evidence, not pre-recorded here.

## Changes

- `docs/operations/feature-gates.md` — add rows for `EVA_SHADOW_AUTOSUBMIT_ENABLED` and
  `INTAKE_POLL_ENABLED` (both live state: not set = off; `INTAKE_POLL_ENABLED` marked local-only,
  never to be set live).
- `infrastructure/config-capture/api.bicep` — capture `EVA_SHADOW_AUTOSUBMIT_ENABLED` (absent/off
  today) alongside the existing gate entries.
- `infrastructure/config-capture/orch.bicep` — capture `EVA_API_ENABLED` (absent/off today); leave
  `graphIntakeMailboxes` at its current live 3-mailbox value (the single-mailbox re-scope is a
  cutover-time edit recorded by the runbook).

## Acceptance criteria

- Both new gates appear in `feature-gates.md` with plain-language meaning, on/off consequences and
  their ship-dark live state.
- Config-capture bicep compiles/lints as before and captures the new setting names without
  changing any live value (`applyAppSettings` stays false).
- No LIVE_FACTS change in this slice (nothing live has changed yet).

## Artifacts

- [Changes made](./changes.md)

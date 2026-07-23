---
id: TKT-308
title: Turn off the retro reconstruction fallback for the alpha (live config, no code change)
status: now
priority: P0
area: archive
tickets-it-relates-to: [TKT-303, TKT-304]
research-link: docs/tickets/now/TKT-308-retro-fallback-off-for-alpha/evidence/gate-read-2026-07-21.md
---

# Turn off the retro reconstruction fallback for the alpha (live config, no code change)

## Problem

`gates.retroCase()` (`packages/domain/src/gates.ts`, `RETRO_CASE_ENABLED`) defaults off in code,
but the live TKT-303 diagnosis shows it fired on `cespk-orch-dev` on 2026-07-21: case
`13f1c47f-f337-48e7-8a2d-a43b3ff9e40e` (Case/PO `A.QDOS26229`) was reconstructed via
`reconstructionSource: box_eml` from a staff-forwarded QDOS instruction that never minted through
normal intake — masking that intake failure and pointing the case at a live-Box folder outside the
pinned write root (the source case for TKT-303/TKT-304).

For the duration of the alpha, this ticket's own operator decision (2026-07-21) is: hold the
inbound-triage rebuild firm with **no interim minting patch** — a forwarded instruction does not
mint until the rebuild lands. Leaving the retro fallback live during that window silently papers
over every such miss with a reconstructed case pointed at the wrong archive folder, exactly the
TKT-303/TKT-304 failure mode.

`retroCase` is the master switch read by **both** the orchestration retro activities and the Data
API's `/api/internal/retro/*` routes — it must be set consistently on both apps, not just one.

## Change

Not a code change. This ticket records the required live state; an operator applies it.

- Confirm `RETRO_CASE_ENABLED` is unset or `false` on `cespk-orch-dev`.
- Confirm `RETRO_CASE_ENABLED` is unset or `false` on `cespk-api-dev`.
- Do not conflate with `RETRO_BOX_ARCHIVE_ROOT_IDS` (the read-only Box search roots) or
  `BOX_READONLY_ROOT_IDS` / `BOX_FOLDER_ROOT_ID` (the box-webhook and orchestration write-root
  settings) — distinct variables, unaffected by this change.

## Acceptance

- Live read-back (`az functionapp config appsettings list`) shows `RETRO_CASE_ENABLED` absent or
  `false` on both `cespk-orch-dev` and `cespk-api-dev`, with timestamp recorded here.
- No new `reconstructionSource` audit event appears for the remainder of the alpha window.
- Reversal: re-enabling this gate at production cutover is tracked separately (TKT-219 already
  gates the related Case/PO-adoption behaviour for that transition) and is explicitly out of scope
  here.

## Artifacts

- [Changes made](./changes.md)
- [Gate read + live incident summary](./evidence/gate-read-2026-07-21.md)

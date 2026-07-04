---
id: TKT-063
title: Go-live runbook, readiness matrix & operator checklist
status: now
priority: P1
area: docs
tickets-it-relates-to: [TKT-058]
research-link: GO_LIVE_SPRINT_PLAN.md
---

# Go-live runbook, readiness matrix & operator checklist

## Problem

The stack live-intakes on info@ + engineers@ + desk@ but there is **no operator-facing
go-live document** — no ordered cutover runbook, no gate-state readiness matrix, no
day-0 smoke, no rollback, no support playbook. Every operator-critical action (PAYG
upgrade, staff app-roles, provider-corpus completion, Case/PO floor seeding, archive
roots + retro gate flips, the File Request template, EVA drag-drop) is scattered across
`docs/gated.md`, ADRs, and the sprint plan, so nobody can execute the cutover from one
place.

**HEADLINE — dated hard stop.** The subscription is still **Free Trial**
(`az account show` quotaId `FreeTrial_2014-09-01`); the oldest resource in
`rg-collisionspike-dev` dates to **2026-06-18**, so the whole stack **hard-disables
around 2026-07-18** (~14 days from authoring) unless upgraded to **Pay-As-You-Go**. The
12-month free Postgres allowance survives the upgrade. This is the **#1 operator action**
([gated.md A1](../../gated.md)) and must headline every deliverable in RED.

## Change

Produce **`docs/plans/go-live/`** (new folder — does not yet exist), authored from the
verified live state (re-check every gate/count against [LIVE_FACTS.json](../../../LIVE_FACTS.json)
before writing, never re-embed a live number):

- **`runbook.md`** — the ordered cutover, each step scripted + verifiable:
  PAYG upgrade → staff app-role roster → provider-corpus completion → Case/PO floor
  seeding + placeholder renumber (references the existing
  [case-po-sequence-cutover.md](../../plans/case-po-sequence-cutover.md)) → archive roots +
  retro gate flips (`RETRO_CASE_ENABLED`, `RETRO_BOX_ARCHIVE_ROOT_IDS`,
  `BOX_READONLY_ROOT_IDS`, `RETRO_OUTLOOK_SEARCH_ENABLED`) → File Request template id +
  `BOX_FILE_REQUEST_TEMPLATE_ID` → EVA drag-drop live procedure → day-0 smoke → rollback.
- **`readiness-matrix.md`** — every gate × current value × meaning × go-live target ×
  owner (agent vs operator), linking the registry for the live value rather than copying it.
- **`day0-smoke.md`** — the first-hours production smoke (intake → parse → review → Box
  → EVA export) with expected results per hop.
- **`rollback.md`** — how to revert each cutover step (gate-flips OFF, restore from the
  pre-cutover pg_dump, Box holding-folder restore).
- **`support-playbook.md`** — on-call: common failures → KQL query → fix.
- A consolidated **operator checklist** with exact commands + portal paths for every
  operator-critical item (A1 PAYG, C1 staff roles, D1 EVA creds, D3/D4 provider domains +
  PHA principal, D11 archive roots + Viewer grant, B4 Exchange grant, TKT-004 prod Box
  root, File Request template).

Docs-only; ships no code. Verify all cited source paths/line-refs by reading them before
writing. Backing plan: [GO_LIVE_SPRINT_PLAN.md](../../../GO_LIVE_SPRINT_PLAN.md) §P8.

## Acceptance

- [ ] `docs/plans/go-live/` exists with `runbook.md`, `readiness-matrix.md`,
  `day0-smoke.md`, `rollback.md`, `support-playbook.md`, and the consolidated operator
  checklist.
- [ ] The Free-Trial → PAYG hard deadline (~2026-07-18, quotaId `FreeTrial_2014-09-01`)
  headlines the runbook and readiness matrix in RED as the #1 operator action.
- [ ] `runbook.md` lists the cutover in strict order (PAYG → staff roles → provider corpus
  → Case/PO floor seed + renumber → archive roots + retro gate flips → File Request
  template + gate → EVA drag-drop → day-0 smoke → rollback), each step with an exact
  command/portal path and a verify check.
- [ ] `readiness-matrix.md` rows every gate with value/meaning/target/owner and links the
  registry for the live value (no live numbers copied in — MAINTENANCE.md rule).
- [ ] Every operator-critical action (A1, C1, D1, D3/D4, D11, B4, TKT-004, File Request
  template) appears in the operator checklist with exact commands/portal paths.
- [ ] Cited source paths/line-refs verified against live source; no broken links.
- [ ] `node scripts/check-doc-links.mjs` and `node scripts/check-tickets.mjs` pass.

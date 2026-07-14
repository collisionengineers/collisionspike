---
id: TKT-063
title: Go-live runbook, readiness matrix & operator checklist
status: done
priority: P1
area: docs
tickets-it-relates-to: [TKT-058, TKT-178]
research-link: docs/plans/go-live/README.md
---

# Go-live runbook, readiness matrix & operator checklist

> **Cutover semantics superseded by TKT-178 (2026-07-13).** This ticket remains `done` because it created
> the documentation pack, but its original Viewer-root/EVA-drag-drop route is not execution authority. The
> maintained documents now fail closed until the signed/checksummed job spreadsheet, authenticated
> contract-verified production EVA API evidence and exact production Archive root with proven explicit
> write/rename/merge/retarget scope reconcile in a frozen approved ledger and named future window.

## Problem

The stack live-intakes on info@ + engineers@ + desk@ but there is **no operator-facing
go-live document** — no ordered cutover runbook, no gate-state readiness matrix, no
day-0 smoke, no rollback, no support playbook. Every operator-critical action (PAYG
upgrade, staff app-roles, provider-corpus completion, Case/PO floor seeding, production Archive
reconciliation/root retarget, the File Request template and authenticated EVA proof) is scattered across
`docs/gated.md`, ADRs, and the sprint plan, so nobody can execute the cutover from one
place.

**HEADLINE — dated hard stop.** The subscription is still **Free Trial**
(`az account show` quotaId `FreeTrial_2014-09-01`); the oldest resource in
`rg-collisionspike-dev` dates to **2026-06-18**, so the whole stack **hard-disables
around 2026-07-18** (~14 days from authoring) unless upgraded to **Pay-As-You-Go**. The
12-month free Postgres allowance survives the upgrade. This is the **#1 operator action**
([gated.md A1](../../../gated.md)) and must headline every deliverable in RED.

## Change

Produce **`docs/plans/go-live/`** (new folder — does not yet exist), authored from the
verified live state (re-check every gate/count against [LIVE_FACTS.json](../../../../LIVE_FACTS.json)
before writing, never re-embed a live number):

- **`runbook.md`** — the ordered cutover, each step scripted + verifiable:
  prerequisites → all TKT-178 inputs → zero-write reconciled ledger/hash + restore rehearsal → named
  window → Case/PO floor/mapping application (references
  [case-po-sequence-cutover.md](../../../plans/case-po-sequence-cutover.md)) → approved production Archive
  actions/root retarget → authenticated production EVA result → genuine-work day-0 smoke → rollback.
- **`readiness-matrix.md`** — every gate × current value × meaning × go-live target ×
  owner (agent vs operator), linking the registry for the live value rather than copying it.
- **`day0-smoke.md`** — the first-hours production smoke using two predesignated, journaled genuine proofs:
  one pending ingress instruction for intake/mint/exact Archive object+parent and one pre-existing EVA-ready
  case for a single authenticated EVA API submission, both with hard-green results.
- **`rollback.md`** — the typed LIFO inverse journal before EVA dispatch and forward-recovery boundary after
  EVA accepts or may have accepted; no blanket promise that external business events can be undone.
- **`support-playbook.md`** — on-call: common failures → KQL query → fix.
- A consolidated **operator checklist** with exact commands + portal paths for every
  operator-critical item (A1 PAYG, C1 staff roles, TKT-178 signed spreadsheet/verified EVA API/approved
  production Archive write scope, D3/D4 provider domains + PHA principal, B4 Exchange grant, TKT-004
  allocator input, File Request template).

Docs-only; ships no code. Verify all cited source paths/line-refs by reading them before
writing. Backing plan: [GO_LIVE_SPRINT_PLAN.md](../../../plans/go-live/README.md) §P8.

## Acceptance

- [ ] `docs/plans/go-live/` exists with `runbook.md`, `readiness-matrix.md`,
  `day0-smoke.md`, `rollback.md`, `support-playbook.md`, and the consolidated operator
  checklist.
- [ ] The Free-Trial → PAYG hard deadline (~2026-07-18, quotaId `FreeTrial_2014-09-01`)
  headlines the runbook and readiness matrix in RED as the #1 operator action.
- [ ] `runbook.md` lists the cutover in strict order (prerequisites → all TKT-178 inputs → frozen
  zero-write ledger and restore proof → named window → deterministic Case/PO mappings → approved
  production Archive actions/root retarget → authenticated EVA proof → genuine-work day-0 smoke →
  rollback), with future commands and verify/refusal checks that remain blocked until every gate passes.
- [ ] `readiness-matrix.md` rows every gate with value/meaning/target/owner and links the
  registry for the live value (no live numbers copied in — MAINTENANCE.md rule).
- [ ] Every operator-critical action (A1, C1, D1, D3/D4, D11, B4, TKT-004, File Request
  template) appears in the operator checklist with exact commands/portal paths.
- [ ] Cited source paths/line-refs verified against live source; no broken links.
- [ ] `node scripts/check-doc-links.mjs` and `node scripts/check-tickets.mjs` pass.

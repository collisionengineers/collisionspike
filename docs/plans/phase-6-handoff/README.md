# Phase 6 — Boundary Evidence & Handoff

**Goal:** prove mechanically that nothing live was touched before activation, and complete the live
validation checklist across all three mailboxes — the M1 "done" definition.

**Status:** offline gates green; the live evidence + §7 checklist are operator work. See
[../../../DEPLOY-RUNBOOK.md](../../../DEPLOY-RUNBOOK.md) §8.

## Implementation checklist

1. [x] Offline gate green — `node verify-all.mjs` (6/6)
2. [x] Static grep gate (no live EVA/Box/Graph/SharePoint calls in the app) / flow-state assertion (all flows off) / no-credentials assertion (only Key Vault references + env-var names)
3. [ ] 🔒 Connection inventory — `pac connection list` (operator evidence at activation)
4. [ ] 🔒 Deploy log — record every `[DEPLOY-WITH-LOGIN]` + `[RESERVED-FOR-USER]` action
5. [ ] 🔒 **§7 live-validation checklist complete across all three mailboxes** — the M1 "done" definition

## References (no standalone plan)

- Boundary/quality audit: [../phase-0-foundations/code-audit-cleanup.md](../phase-0-foundations/code-audit-cleanup.md)
- Operator sequence + boundary gate: [../../../DEPLOY-RUNBOOK.md](../../../DEPLOY-RUNBOOK.md) §8
- Offline gate: `verify-all.mjs` at the repo root

## Needs the operator

All remaining items are hard blockers (live evidence + the three-mailbox checklist). See
[../../gated.md](../../gated.md).

---
id: TKT-271
title: Establish the anti-drift guard doctrine and meta-guard
status: done
priority: P1
area: platform
tickets-it-relates-to: [TKT-251, TKT-261, TKT-266, TKT-269, TKT-270]
research-link: docs/tickets/done/TKT-271-anti-drift-guard-doctrine-and-meta-guard/evidence/distillation-note.md
plan: PLAN-012
---

# Establish the anti-drift guard doctrine and meta-guard

## Problem
Each consolidation plan specifies a terminal drift guard, but plan frontmatter does not identify consolidation
plans or their guard ticket/command. A future plan can omit itself from a hand-maintained registry, and no
check can distinguish it from a plan that legitimately needs no terminal guard.

## Evidence
The series specifies four terminal guards: PLAN-007's AST/import-aware managed-identity guard (TKT-251),
PLAN-010's import/reference-aware single-source guard (TKT-261), PLAN-008's AST/import-aware route/authority
guard (TKT-266), and PLAN-011's cross-language behavioural parity guard (TKT-269). They deliberately use
different proof techniques. `scripts/checks/check-tickets.mjs` currently validates only generic plan fields
and cannot enumerate consolidation intent or terminal-guard wiring.

## Proposed change
After TKT-251/261/266/269 are `done`, record a modality-appropriate guard doctrine as a governance page and
ADR. Extend the plan schema so every plan has a required machine-readable `plan-kind`; consolidation plans
also require flat `terminal-guard`, `terminal-guard-command`, and `guard-mode` fields that the existing
frontmatter parser can read. Backfill the current plans, validate the referenced ticket is a member of the
plan, and derive the canonical guard register from that metadata. Add a meta-check that verifies each
registered command is wired into the offline aggregate verifier and has mode-appropriate negative fixtures.

## Acceptance
- **A1.** A governance page and ADR define guard modes: AST/import analysis for source syntax, import/reference
  analysis for shared-source policy, behavioural fixtures for cross-language contracts, and
  machine-evidence comparison for live state. Guards are production-scoped where applicable and never rely
  on naive lexical matching.
- **A2.** Every plan has a validated `plan-kind`. A consolidation plan must also declare
  `terminal-guard`, `terminal-guard-command`, and `guard-mode`; the terminal-guard ticket must be a plan
  member. PLAN-007/008/010/011 are backfilled with TKT-251/266/261/269 respectively.
- **A3.** The canonical guard register is derived from plan metadata rather than duplicated by hand. A
  meta-check fails on a synthetic plan missing `plan-kind`, on a consolidation plan missing guard metadata,
  on a non-member guard ticket, and on a command absent from the offline aggregate verifier.
- **A4.** The meta-check runs in CI and verifies each registered guard has fixtures appropriate to its mode.
- **A5.** No live write.

## Validation
- Run the meta-check over the current plan corpus and the separate missing-kind, missing-guard, non-member,
  unwired-command, and missing-fixture cases; confirm the ADR and governance page resolve and are linked.

## Research
Distilled from the four plans' terminal-guard tickets and reconciled review Gate 0 item 12, corrected against
the current ticket parser and each guard's actual proof mode. Implementation is gated on TKT-251/261/266/269
being `done` and consumes TKT-270's audit.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)

---
id: TKT-271
title: Establish the anti-drift guard doctrine and meta-guard
status: backlog
priority: P1
area: platform
tickets-it-relates-to: [TKT-251, TKT-261, TKT-266, TKT-269, TKT-270]
research-link: docs/tickets/backlog/TKT-271-anti-drift-guard-doctrine-and-meta-guard/evidence/distillation-note.md
plan: PLAN-012
---

# Establish the anti-drift guard doctrine and meta-guard

## Problem
Each plan ships its own terminal drift guard, but there is no recorded doctrine for how such guards are built
and no check that every plan actually shipped one. Without both, a future plan can consolidate a mechanism and
forget the guard, and the drift quietly returns.

## Evidence
The series authored four terminal guards: PLAN-007's `IDENTITY_ENDPOINT` guard (TKT-251), PLAN-010's
single-source guard (TKT-261), PLAN-008's route/authority guard (TKT-266), and PLAN-011's behavioural parity
guard (TKT-269). All four are specified as import/AST-aware and language-scoped — a lexical ban would
false-flag the Python services and docs. Nothing yet records that convention or asserts each guard's presence.

## Proposed change
Record the guard convention (import/AST-aware, production-scoped, language-aware; pin behaviour not internals;
wired into `verify-all.mjs` with a negative fixture) as a governance page and an ADR. Register the four
terminal guards in one place, and add a meta-check that fails if a distilled plan lacks a registered terminal
guard wired into `verify-all.mjs`.

## Acceptance
- **A1.** A governance page and ADR record the anti-drift guard convention (AST/import-aware, production-scoped,
  language-aware, behaviour-pinning, `verify-all.mjs`-wired with a negative fixture).
- **A2.** The four terminal guards (TKT-251/261/266/269) are registered in one canonical list.
- **A3.** A meta-check asserts every distilled consolidation plan has a registered terminal guard wired into
  `verify-all.mjs`, and fails on a synthetic plan that lacks one.
- **A4.** The meta-check and doctrine run in CI; no lexical guard is introduced.
- **A5.** No live write.

## Validation
- Run the meta-check over the current guards (expect pass) and over a synthetic guard-less plan (expect fail);
  confirm the ADR and governance page resolve and are linked.

## Research
Distilled from the four plans' terminal-guard tickets and reconciled review Gate 0 item 12 (each plan's final
ticket is an import/AST-aware forbidden-pattern guard). Consumes TKT-270's audit.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)

---
id: TKT-273
title: Add the LIVE_FACTS and ledger integrity standing check
status: backlog
priority: P2
area: platform
tickets-it-relates-to: [TKT-257, TKT-258, TKT-270]
research-link: docs/tickets/backlog/TKT-273-live-facts-and-ledger-integrity-check/evidence/distillation-note.md
plan: PLAN-012
---

# Add the LIVE_FACTS and ledger integrity standing check

## Problem
The series was triggered partly by stale live-state (`LIVE_FACTS.json` recorded a free trial and out-of-date
function counts) and depends on byte-preserving governance ledgers. Nothing standing keeps `LIVE_FACTS.json`
honest against reality or guarantees the ledgers do not silently drift.

## Evidence
`LIVE_FACTS.json` is the sole exact live-state registry, with a rule that it is replaced only from dated
read-only evidence and never inferred from source; PLAN-009 refreshes it (offer, function counts, retirements).
The inventory ledgers (`docs/governance/repository-inventory.json` + the reconciliation ledger) are already
integrity-checked by `check:inventory` / `check:reconciliation`, and PLAN-010 keeps their generation
byte-preserving.

## Proposed change
Add a standing check that (a) flags when `LIVE_FACTS.json` has not been reconciled against a fresh read-only
inventory within a defined window, or when a tracked doc asserts a live value that disagrees with it, and (b)
asserts the governance ledgers regenerate byte-identical. This generalises PLAN-009's estate reconciliation
and PLAN-010's byte-preserving-ledger rule into one gating integrity check.

## Acceptance
- **A1.** A check flags a stale `LIVE_FACTS.json` (not reconciled within the defined window) and any tracked
  doc whose live-value claim disagrees with the registry (reusing the existing doc-links leakage authority).
- **A2.** The check asserts the governance ledgers regenerate byte-identical; a synthetic ledger edit fails it.
- **A3.** The check honours the `LIVE_FACTS` rule — reconciliation evidence is dated and read-only; the check
  never mutates live state.
- **A4.** The check runs in CI and is documented on the operations/governance pages.
- **A5.** No live write.

## Validation
- Run the check against the current registry + ledgers (pass); against a synthetic stale registry and a
  synthetic ledger edit (fail); confirm it invokes no live mutation.

## Research
Distilled from PLAN-009's `LIVE_FACTS` refresh (TKT-257), PLAN-010's byte-preserving-ledger rule (TKT-258),
and the `LIVE_FACTS.json` authority doctrine. The estate/registry anti-drift generalisation. Consumes
TKT-270's audit.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)

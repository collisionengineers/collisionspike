---
id: TKT-132
title: Widen the AI-suggestion generate inputs beyond accident circumstances
status: verify
priority: P2
area: ai
tickets-it-relates-to: [TKT-127, TKT-015]
research-link: docs/tickets/verify/TKT-132-generate-suggestions-inputs/evidence/operator-note.md
plan: PLAN-003
---

# TKT-132 — Widen the AI-suggestion generate inputs beyond accident circumstances

## Problem

callSuggestionModel builds its prompt mainly from accident circumstances, which are empty on most intake cases — so generate returns a clean no_input/empty for most cases. The model should also see parsed instruction text, imported overview facts, and image-analysis outputs where present.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — origin note (workflow finding, 2026-07-09).
- D1 batch report 2026-07-09: prompt tokens constant 381 across different cases; empty-circumstances cases produce empty generations.

## Proposed change

PROPOSED (not built): extend the generate input assembly (instruction text excerpt, overview facts, vehicle data, image-analysis results), with prompt-size caps; note the DPIA scope check for any new data class sent to the model.

## Acceptance

- A case with parsed instructions but empty circumstances generates non-empty, relevant suggestions.
- Prompt assembly unit-tested; token cap enforced.
- DPIA note recorded for the widened input classes.

## Research

Filed 2026-07-09 from the D1 (readiness spine) batch report — an issue encountered during the
PLAN-003 workflow, added per the operator's standing instruction.

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)

---
id: TKT-127
title: AI Assistant "Generate Suggestions" does not generate — devtools shows 204 no content
status: done
priority: P1
area: ai
tickets-it-relates-to: [TKT-015]
research-link: docs/tickets/done/TKT-127-ai-suggestions-generate-204/evidence/operator-note.md
plan: PLAN-003
---
# TKT-127 — AI Assistant "Generate Suggestions" does not generate — devtools shows 204 no content

## Problem

Clicking "Generate Suggestions" produces nothing; devtools shows a 204 no-content response. The 2026-07-07 dark-gate audit recorded callModelForSuggestions in api/src/functions/ai-suggestions.ts as a stub returning [] (TODO TKT-015); AI_ASSIST_ENABLED was flipped true at the 2026-07-08 go-live. Examine whether the deployed build still carries the stub, or the model call fails/returns empty silently.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — verbatim operator workstream item, 2026-07-08.
- Operator devtools observation: one request returning "204 - no content".
- LIVE_FACTS 2026-07-07 entry: "callModelForSuggestions is a STUB (return [], TODO TKT-015)".

## Proposed change

PROPOSED (not built): implement/repair the generate path — real model call (keyless AOAI gpt-5, existing MI grant), persist pending ai_suggestion rows, return {generated:N}; make the SPA render generated suggestions; add telemetry so an empty generation is explainable.

## Acceptance

- POST /api/cases/{id}/ai-suggestions/generate on a real case returns generated > 0 and pending ai_suggestion rows exist.
- The SPA renders the generated suggestions after clicking Generate Suggestions.
- A genuine no-suggestion outcome returns an explicit empty result the UI explains (never a silent 204).
- Live proof on the deployed stack.

## Research

Distilled 2026-07-08 from the operator workstream note (see Evidence). 

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)

---
id: TKT-018
title: AI VLM total-loss vs repairable categorisation (deferred)
status: backlog
priority: P3
area: ai
tickets-it-relates-to: [TKT-015]
research-link: docs/plans/work-todo-spike/ai-assistant/ai-tools/research/defer-ai-case-category.md
---

# AI VLM total-loss vs repairable categorisation (deferred)

## Problem
An AI VLM to assess damage and categorise whether a case is a total loss vs repairable. **Explicitly
deferred** until the pipeline is fully complete.

## Evidence
This is the most downstream AI capability and depends on the suggestion layer (TKT-015) and image
analysis (TKT-016) being in place first. Operator marked it deferred. Keep in `backlog`.

## Proposed change
(Deferred) — once the pipeline is complete, add a damage-assessment VLM that suggests total-loss vs
repairable as an observation for handler confirmation.

## Acceptance
Deferred; revisit after the core pipeline + AI suggestion layer land.

## Research
- Operator stub: [defer-ai-case-category.md](../plans/work-todo-spike/ai-assistant/ai-tools/defer-ai-case-category.md)
- Research pack: [research/defer-ai-case-category.md](../plans/work-todo-spike/ai-assistant/ai-tools/research/defer-ai-case-category.md)

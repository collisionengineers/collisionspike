---
id: TKT-015
title: AI suggestion layer (observation-first, gated)
status: next
priority: P2
area: ai
tickets-it-relates-to: [TKT-016, TKT-017, TKT-018, TKT-006]
research-link: docs/plans/work-todo-spike/ai-assistant/research/ai-assistant.md
---

# AI suggestion layer (observation-first, gated)

## Problem
Add an AI assistant — **not** a generic chat surface, but a set of embedded **suggestions** around intake
triage, evidence review, model benchmarking, corpus maintenance, and (later) case/damage assessment.
MVP this session, then expand. This umbrella ticket also covers **model selection** (which models to
test/benchmark) and the **backend-data** clean-up the assistant depends on.

## Evidence
The strongest fit is a **suggestion/observation layer, not an autonomous actor**: any AI output should be
recorded as a suggestion/observation first, then promoted only by deterministic rule or human
confirmation. The `EMAIL_AI_ENABLED` gate exists in the shared gate reader but is off on the live app
settings; the triage row does not yet persist suggested/accepted category, override reason, model
version, or reviewer feedback — so an **AI suggestion contract** (model not mutating state directly) is
the first piece. Image/registration/location analysis needs evidence/case context **after** attachments
are persisted — it must not run inside the Graph webhook path. (Verify live gate + function state against
the registry [live-environment.md](../architecture/live-environment.md).)

## Proposed change
Add a suggestion/observation model (durable AI suggestions on the inbound/case rows) rather than direct
AI mutations; keep it gated; wire the sub-tools (TKT-016 image analysis, TKT-017 reg-OCR) as suggestion
producers. Decide model selection from the benchmark list.

## Acceptance
AI outputs land as suggestions (with model version + confidence), never as silent mutations; promotion is
deterministic or human-confirmed; the gate controls it.

## Research
- Operator stub: [ai-assistant.md](../plans/work-todo-spike/ai-assistant/ai-assistant.md) (empty — see `example.png`)
- Research pack: [research/ai-assistant.md](../plans/work-todo-spike/ai-assistant/research/ai-assistant.md)
- Model selection: [model-selection.md](../plans/work-todo-spike/ai-assistant/model-selection.md) · [research/model-selection.md](../plans/work-todo-spike/ai-assistant/research/model-selection.md)
- Backend-data clean-up: [backend-data/todos.md](../plans/work-todo-spike/ai-assistant/backend-data/todos.md) · [backend-data/research/todos.md](../plans/work-todo-spike/ai-assistant/backend-data/research/todos.md)
- Sub-tools: [TKT-016](./TKT-016-ai-image-analysis.md), [TKT-017](./TKT-017-ai-reg-ocr.md), [TKT-018](./TKT-018-ai-case-category.md).

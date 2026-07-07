---
id: TKT-017
title: Registration-recognition model research + bench
status: next
priority: P2
area: ai
tickets-it-relates-to: [TKT-001, TKT-016, TKT-015]
research-link: docs/plans/work-todo-spike/ai-assistant/ai-tools/research/reg-ocr.md
plan: PLAN-001
---

# Registration-recognition model research + bench

## Problem
Research vehicle-registration recognition models and **compare the best** options (the reg-OCR half of the
image MVP).

## Evidence
A plate-OCR path already exists (the retained OCR Function / `fast-alpr` plate route); this ticket is the
model-comparison research to pick the best reg-recognition approach feeding the image-analysis sequence
(TKT-016) and document parsing's registration field (TKT-001). See the research pack.

## Proposed change
Benchmark candidate reg-recognition models on representative plate images; recommend the best for the
image-analysis pipeline.

## Acceptance
A short benchmark + recommendation comparing the candidate models on accuracy/cost/latency.

## Research
- Operator stub: [reg-ocr.md](../../../plans/work-todo-spike/ai-assistant/ai-tools/reg-ocr.md)
- Research pack: [research/reg-ocr.md](../../../plans/work-todo-spike/ai-assistant/ai-tools/research/reg-ocr.md)

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)

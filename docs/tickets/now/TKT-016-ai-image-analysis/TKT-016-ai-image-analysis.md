---
id: TKT-016
title: Image-analysis VLM sequence (vehicle / reg / location)
status: now
priority: P2
area: ai
tickets-it-relates-to: [TKT-002, TKT-017, TKT-015]
research-link: docs/plans/work-todo-spike/ai-assistant/ai-tools/research/image-analysis.md
plan: PLAN-001
---

# Image-analysis VLM sequence (vehicle / reg / location)

## Problem
Build the initial image-analysis sequence (the image VLM MVP this session): (1) confirm the image
contains a vehicle; (2) confirm the set is all the same vehicle; (3) detect whether a registration is
visible; (4) OCR the reg; (5) detect background readable items (street signs, phone numbers, signage);
(6) OCR those + attempt geolocation via landmarks / a geolocation model; (7) compare to the address
corpus; (8) provide a best inspection-address suggestion from provider history + clarified details.

## Evidence
This is an **observation-first** producer feeding the AI suggestion layer (TKT-015) and the
inspection-address corpus — it does not auto-select an address (ADR-0013: no runtime matcher; staff pick).
It runs on persisted evidence/case context, **not** in the Graph webhook path. Pairs with PDF image
extraction (TKT-002) and reg-OCR (TKT-017).

## Proposed change
Implement the staged image-analysis pipeline as suggestion output (vehicle-present, same-vehicle,
registration-visible, reg text, location hints, ranked address suggestion), gated, never auto-applied.

## Acceptance
For a sample image set the sequence returns the staged observations + a ranked address suggestion as
suggestions (not auto-confirmed); failures degrade gracefully.

## Research
- Operator stub: [image-analysis.md](../../../plans/work-todo-spike/ai-assistant/ai-tools/image-analysis.md)
- Research pack: [research/image-analysis.md](../../../plans/work-todo-spike/ai-assistant/ai-tools/research/image-analysis.md)

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)

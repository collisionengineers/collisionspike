# Deferred AI case category - context pack

## Source ticket

`docs/plans/work-todo-spike/ai-assistant/ai-tools/defer-ai-case-category.md` says this is deferred until the pipeline is complete and describes a VLM that assesses damage and categorises whether a case is total loss.

## Current state

This is correctly deferred:

- The current case type model is about intake shape, not damage outcome. `CaseType` is derived from whether instructions/images are present and how the case should sit in the queue (`packages/domain/src/model/queues.ts:143-210`).
- `case_.case_type_code` is a case-type lookup, not a total-loss assessment (`migration/assets/schema/050_case.sql:36-39`).
- The roadmap already puts image classification/person-reflection detection after OCR and pipeline foundations (`ROADMAP.md:360-365`).
- ADR-0009 says M1 is OCR-for-registration and M2 is classification/reflection detection, with Foundry/OpenAI vision as the direction (`docs/adr/0009-image-ai-ocr-m1-classification-m2.md:1-18`).

## Why it should stay separate

Total-loss assessment is not the same as:

- intake category;
- audit case type;
- image role;
- EVA readiness;
- claim status.

If it is implemented later, it should be a reviewed assessment or suggestion over evidence, not a replacement for current `case_type_code` semantics.

## Required prerequisites

Before building this:

1. Evidence images must be reliably stored and visible to staff.
2. Image roles and plate visibility should be working.
3. Person/reflection exclusion should be handled or at least reviewed.
4. A model-evaluation dataset should exist for total-loss labels.
5. A legal/data-protection decision should confirm whether damage images can be sent to the chosen model in production.

## Likely future model

Use the same observation/suggestion pattern as image analysis:

- per case or per image;
- suggested damage category;
- total-loss likelihood;
- confidence and reason fields;
- model/prompt version;
- human review outcome.

Do not write total-loss directly to the primary case fields until staff review semantics and reporting needs are clear.

## Evidence

- `docs/plans/work-todo-spike/ai-assistant/ai-tools/defer-ai-case-category.md`
- `packages/domain/src/model/queues.ts`
- `migration/assets/schema/050_case.sql`
- `docs/adr/0009-image-ai-ocr-m1-classification-m2.md`
- `ROADMAP.md:360-365`

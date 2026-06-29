# Registration OCR - context pack

## Source ticket

`docs/plans/work-todo-spike/ai-assistant/ai-tools/reg-ocr.md` asks for vehicle registration recognition model research and model comparison.

## Current state

The app has downstream fields that need plate-recognition results, but it does not have a rich plate-observation model:

- `case_.vrm` is the case identity field (`migration/assets/schema/050_case.sql:18-22`).
- `evidence.registration_visible` is a tri-state final flag (`migration/assets/schema/060_evidence.sql:14-16`).
- The domain evidence model treats `registrationVisible` as whether the case VRM is visible on an image (`packages/domain/src/model/types.ts:104-112`).
- EVA image readiness requires an overview image with visible registration (`packages/domain/src/contracts/image-rules.ts:8-17`, `83-86`).
- The OCR host exists and is documented as having `/api/ocr-pdf` and `/api/plate-ocr`, but connector/gate wiring remains incomplete (`docs/architecture/architecture-audit-2026-06-20.md:60`, `ROADMAP.md:358-365`).

## Problem

The current destination field answers only "does this accepted overview image show the case registration?" It does not store:

- detected plate text;
- plate confidence;
- whether the plate conflicts with `case_.vrm`;
- model/provider/version;
- reviewer correction;
- reason for unreadable or no visible plate.

That makes model comparison hard because success cannot be measured from `registration_visible` alone.

## Benchmark tasks

Compare candidate models against labelled images with:

- exact normalized VRM match;
- partial/ambiguous reads;
- false positive plate text when no plate is visible;
- "registration visible but unreadable" classification;
- "no registration visible" classification;
- confidence calibration;
- latency and cost per image.

The benchmark should distinguish:

- OCR accuracy on clear plate crops;
- end-to-end accuracy on full vehicle photos;
- detection of visibility even when OCR cannot read confidently.

## Resolution shape

1. Add an observation record for plate recognition per evidence image.
2. Store `detected_vrm`, normalized text, confidence, visibility, model version, and review outcome.
3. Compare detected VRM to `case_.vrm`; do not auto-change `case_.vrm`.
4. Promote reviewed outcomes into `evidence.registration_visible`.
5. Use the result in image readiness and warnings.

## Azure state

Read-only live checks found:

- `cespkdocintel-dev` is a Document Intelligence resource (`FormRecognizer`, F0, UK South);
- `digital-3339-resource` is `AIServices` S0, UK South, with no model deployments;
- no Azure OpenAI/Foundry model endpoint should be assumed live yet.

## Evidence

- `docs/plans/work-todo-spike/ai-assistant/ai-tools/reg-ocr.md`
- `migration/assets/schema/050_case.sql`
- `migration/assets/schema/060_evidence.sql`
- `packages/domain/src/contracts/image-rules.ts`
- `packages/domain/src/model/types.ts`
- `ROADMAP.md:358-365`
- Azure OpenAI evaluations: https://learn.microsoft.com/azure/ai-foundry/openai/how-to/evaluations

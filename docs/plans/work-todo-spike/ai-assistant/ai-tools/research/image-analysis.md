# Image analysis - context pack

## Source ticket

`docs/plans/work-todo-spike/ai-assistant/ai-tools/image-analysis.md` asks for an initial sequence:

- confirm an image contains a vehicle;
- confirm an image set is the same vehicle;
- detect visible registration;
- OCR/read the registration;
- detect readable background items;
- extract background text;
- attempt location inference;
- compare to the address corpus;
- suggest best address from provider history and clarified details.

## Current state

The schema is ready for a few final facts but not for raw model observations:

- `evidence` stores `image_role_code`, `registration_visible`, `accepted_for_eva`, `excluded`, `exclusion_reason`, sequence, storage path, source message, and Box links (`migration/assets/schema/060_evidence.sql:9-33`).
- `rowToEvidence` exposes `imageRole`, `registrationVisible`, `acceptedForEva`, `excluded`, source, and Box fields (`api/src/lib/mappers.ts:243-256`).
- EVA image rules require at least two accepted images, one overview with visible registration, and one damage close-up (`packages/domain/src/contracts/image-rules.ts:8-17`, `78-86`).
- `GET /api/cases/{id}/images` returns non-excluded image evidence only (`api/src/functions/cases.ts:429-443`).

The requested sequence is broader than those columns. It needs raw observations and reviewer decisions, not only final evidence flags.

## Existing overlapping seam

Location assist already defines a safe pattern for suggestions:

- The API proxy has `POST /api/location-assist/suggest`, guarded by feature gates and honest-empty behavior (`api/src/functions/proxy.ts:20-35`).
- The client contract says it proposes locations from photos/text and never auto-applies or writes a case (`mockup-app/src/data/location-assist-client.ts:4-12`).
- Candidates adapt to `SuggestedAddress` with `source: 'assist'` (`mockup-app/src/data/location-assist-client.ts:192-216`).

This seam is useful for address suggestions, but it should not become the storage model for every image observation.

## What is causing the gap

- Attachment classification is coarse and extension-based: `.jpg/.jpeg/.png` becomes `image`; `.pdf/.doc/.docx` becomes `instruction`; `.eml` becomes `email` (`packages/domain/src/domain/classification.ts:10-18`, `79-90`).
- Evidence persistence records attachments, but no current function writes vehicle presence, same-vehicle grouping, plate text, background OCR text, or geolocation evidence.
- `registration_visible` is only a final boolean. It cannot explain the detected plate text, confidence, model, or whether it conflicted with `case_.vrm`.
- There is no review log for accepting/rejecting an image-analysis suggestion.

## Resolution shape

Add a separate observation layer and keep final columns reviewed:

- `case_id`, `evidence_id`, `observation_type`;
- `suggested_value` JSON;
- `confidence`;
- `model_provider`, `model_name`, `model_version`, `prompt_version`;
- `input_hash` and maybe image dimensions, not duplicated image bytes;
- `review_state`, `reviewed_by`, `reviewed_at`, `review_note`.

Promote only reviewed facts into:

- `evidence.image_role_code`;
- `evidence.registration_visible`;
- `evidence.excluded` + `exclusion_reason`;
- case-level inspection address decisions.

## Azure and Microsoft guidance

Azure Functions reliability guidance supports this as an asynchronous, idempotent workflow: use Durable Functions for long-running or multi-step operations, design for retries, and monitor with Application Insights: https://learn.microsoft.com/azure/well-architected/service-guides/azure-functions#reliability

For any model work, use a benchmark first. Azure OpenAI evaluations support ground-truth datasets and criteria including schema validity and custom pass/fail criteria: https://learn.microsoft.com/azure/ai-foundry/openai/how-to/evaluations

## Recommended changes

1. Define image-observation storage before calling any VLM.
2. Add a server-side image-analysis route or Durable activity that runs after evidence persistence, not inside Graph webhook handling.
3. Reuse location-assist only for address candidates.
4. Add reviewer UI that shows suggestions and lets staff accept/reject each fact.
5. Evaluate models against labelled image sets before selecting a provider.
6. Keep all user-facing copy plain and domain-oriented; do not expose model/provider mechanics in the app UI.

## Evidence

- `docs/plans/work-todo-spike/ai-assistant/ai-tools/image-analysis.md`
- `migration/assets/schema/060_evidence.sql`
- `packages/domain/src/contracts/image-rules.ts`
- `packages/domain/src/domain/classification.ts`
- `mockup-app/src/data/location-assist-client.ts`
- `api/src/functions/proxy.ts`
- Microsoft Learn Azure Functions reliability: https://learn.microsoft.com/azure/well-architected/service-guides/azure-functions#reliability

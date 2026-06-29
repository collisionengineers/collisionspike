# Model selection - context pack

## Source ticket

`docs/plans/work-todo-spike/ai-assistant/model-selection.md` lists candidate model families to test, but it does not define tasks, benchmark data, cost limits, latency limits, or pass/fail thresholds.

## Current state

- Live Azure has `digital-3339-resource` (`AIServices`, S0, UK South), but no model deployments were listed by `az cognitiveservices account deployment list`.
- `docs/architecture/live-environment.md:50-52` already flags that resource as an orphan with no model deployments.
- The app has Document Intelligence (`cespkdocintel-dev`, F0) and an OCR host, but those are not general LLM/VLM deployments (`docs/architecture/live-environment.md:44`).
- Existing repo research argues the app needs embedded extraction/classification/drafting features more than a generic Copilot/chatbot (`docs/research/refactor-research/12-ai-layer-copilot-foundry-api/README.md:16-28`, `52-74`, `103-116`).

## Problem

The ticket is framed as a model shopping list. That is too weak for this repo because model quality depends on CollisionSpike-specific tasks:

- email category/subtype classification;
- registration recognition from photos;
- visible-registration detection;
- vehicle-image presence and same-vehicle set checks;
- overview/damage-closeup classification;
- person/reflection rejection;
- background text and location-clue extraction;
- structured output reliability for audit-safe suggestions.

## Benchmark design

Create a small, versioned benchmark pack before selecting any model:

- **Inputs:** de-identified emails, instruction PDFs, image sets, and known-bad examples from `test-cases-and-data/e-mail-examinations/` where usable.
- **Ground truth:** staff-confirmed labels for category/subtype, VRM, image role, registration visible, same vehicle, reflection/person visible, and location clue.
- **Metrics:** exact match for VRM/category; precision/recall for image and exclusion tasks; schema-valid output rate; abstention rate; latency; estimated cost per case; hallucinated field count.
- **Output contract:** strict JSON, no direct case mutation, all values marked as suggestions until reviewed.
- **Safety checks:** PII minimisation, pre-scrub where practical, and no production gate flip until the AI data-protection prerequisite is complete.

Microsoft Learn backs the evaluation-first approach: Azure OpenAI evaluations require a ground-truth dataset and can test expected inputs/outputs and criteria such as factuality, schema validity, string checks, and custom criteria: https://learn.microsoft.com/azure/ai-foundry/openai/how-to/evaluations

## Azure implication

The existing `digital-3339-resource` may be usable as the control-plane home for evaluation later, but it is not currently a usable model endpoint. A resolving change would need one of:

- deploy a chosen model in the existing AI Services/Foundry resource if it is intentionally kept;
- provision a new Azure OpenAI/Foundry deployment in UK South or the chosen compliant data zone;
- choose a non-Azure model API for benchmarking only, then decide whether production must be Azure-hosted.

No model should be assumed live until a deployment exists and the app has a gated server-side calling path.

## Recommended model shortlist framing

Do not rank the ticket's model names directly. Instead, benchmark by capability tier:

- **Fast text classifier:** low-cost email category/subtype and structured extraction from body text.
- **Vision OCR:** registration read and visible-registration detection.
- **Vision reasoning:** same-vehicle, overview/damage-closeup, reflection/person, background text/location clues.
- **Strong structured-output model:** low-volume escalation for ambiguous cases.

The deciding score should be project utility per pound and review burden, not headline model size.

## Likely changes

1. Add `docs/plans/work-todo-spike/ai-assistant/research/eval-dataset-spec.md` later, with task labels and acceptance thresholds.
2. Create an offline evaluation script or notebook that calls candidate models only from explicit test data.
3. Persist results as markdown/CSV artifacts, not app state.
4. Only after a model wins, design the gated server-side integration and app settings.

## Evidence

- `docs/plans/work-todo-spike/ai-assistant/model-selection.md`
- `docs/architecture/live-environment.md:50-52`
- `docs/research/refactor-research/12-ai-layer-copilot-foundry-api/README.md`
- `docs/architecture/data-protection.md:137-153`
- `ROADMAP.md:484-497`
- Microsoft Learn Azure OpenAI evaluations: https://learn.microsoft.com/azure/ai-foundry/openai/how-to/evaluations

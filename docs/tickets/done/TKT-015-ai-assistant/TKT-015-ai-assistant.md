---
id: TKT-015
title: AI suggestion layer (observation-first, gated)
status: done
priority: P2
area: ai
tickets-it-relates-to: [TKT-016, TKT-017, TKT-018, TKT-006]
research-link: docs/tickets/done/TKT-015-ai-assistant/TKT-015-ai-assistant.md
plan: PLAN-001
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
the registry [live-environment.md](../../../operations/live-environment.md).)

## Proposed change
Add a suggestion/observation model (durable AI suggestions on the inbound/case rows) rather than direct
AI mutations; keep it gated; wire the sub-tools (TKT-016 image analysis, TKT-017 reg-OCR) as suggestion
producers. Decide model selection from the benchmark list.

## Acceptance
AI outputs land as suggestions (with model version + confidence), never as silent mutations; promotion is
deterministic or human-confirmed; the gate controls it.

## Research
- Operator stub: [ai-assistant.md](TKT-015-ai-assistant.md) (empty — see `example.png`)
- Research pack: [research/ai-assistant.md](TKT-015-ai-assistant.md)
- Model selection: [model-selection.md](TKT-015-ai-assistant.md) · [research/model-selection.md](TKT-015-ai-assistant.md)
- Backend-data clean-up: [backend-data/todos.md](TKT-015-ai-assistant.md) · [backend-data/research/todos.md](TKT-015-ai-assistant.md)
- Sub-tools: [TKT-016](../../verify/TKT-016-ai-image-analysis/TKT-016-ai-image-analysis.md), [TKT-017](../TKT-017-ai-reg-ocr/TKT-017-ai-reg-ocr.md), [TKT-018](../../backlog/TKT-018-ai-case-category/TKT-018-ai-case-category.md).

## Status — MVP scaffold landed (gated OFF, honest-empty)

The **safe, gated-off foundation** is built this session (branch `feat/work-todo-spike-impl`). It is
**additive** — no model is deployed and nothing is switched on, so it is a permanent no-op until the
operator steps below are done. What shipped:

- **Schema** — new `ai_suggestion` table (`database/baseline/160_ai_suggestion.sql`): the
  suggestion/observation layer (case/evidence/inbound_email FKs, `suggested_value` jsonb, `confidence`,
  `model_version`, `review_state` pending|accepted|rejected|superseded). FKs (case/evidence CASCADE,
  inbound_email SET NULL) + staff-scoped **RLS** + indexes in `900_constraints.sql`. New audit actions
  `ai_suggestion_created|accepted|rejected` (codes 100000032–034) in `000_enums_lookups.sql` +
  `services/data-api/src/shared/audit.ts`.
- **Gate + PII** — `AI_ASSIST_ENABLED` gate (**default OFF**) added next to `EMAIL_AI_ENABLED`
  (`packages/domain/src/gates.ts`), plus `AI_MODEL_ENDPOINT`/`AI_MODEL_DEPLOYMENT` config +
  derived `aiAssistConfigured`. The ROADMAP **PII pre-scrub helper** already exists
  (`packages/domain/src/domain/pii-scrub.ts`, unit-tested) and is **reused** in the generate path
  before any external model call.
- **API** — `GET /api/cases/{id}/ai-suggestions` (list, honest-empty), `POST /api/ai-suggestions/{id}/review`
  (accept/reject → audit; **accept promotes FILL-IF-EMPTY** into evidence role / registration only),
  `POST /api/cases/{id}/ai-suggestions/generate` (**honest `{ generated: 0, reason: 'disabled' }`**
  when gate off or model unconfigured — the live state — else PII-scrub + dormant model call), and
  `GET /api/gates/ai-assist` (`services/data-api/src/features/assistant/register-suggestion-routes.ts` + `gates.ts`).
- **UI** — a **gated "Assistant" panel** on `CaseDetail` (`apps/web/src/features/assistant/AiAssistPanel.tsx`)
  that renders **NOTHING unless `AI_ASSIST_ENABLED`** (read via `useAiAssistGate`), lists suggestions
  with Accept/Reject, and a Generate action that no-ops honestly while no model is connected. Data-layer
  methods/hooks follow the `DataAccessExt` + honest-empty-mock pattern.

### Operator / next steps to actually turn this ON (NOT done this session)

1. **Deploy a model** on the AI Foundry resource **`digital-3339-resource`** — it has **ZERO model
   deployments** today (verified against `LIVE_FACTS.json` / live-environment.md), which is exactly why
   generate is a no-op.
2. **Benchmark** the shortlist in
   [`model-selection.md`](TKT-015-ai-assistant.md) per the
   [research pack](TKT-015-ai-assistant.md) (capability-tier
   eval, strict-JSON output, cost/latency) before picking the production model.
3. **Data-protection sign-off (G5)** is **deferred (operator/legal)** — repo-data AI *testing* is already
   authorised, but the **production** flip of `AI_ASSIST_ENABLED` waits on the per-gate sign-off in
   [`docs/architecture/data-protection.md` §6](../../../architecture/data-protection.md).
4. Then: set `AI_ASSIST_ENABLED=true` + `AI_MODEL_ENDPOINT` + `AI_MODEL_DEPLOYMENT` on `cespk-api-dev`,
   grant the API managed identity the **Cognitive Services OpenAI User** role (keyless), and implement
   the model call in `callModelForSuggestions` (`services/data-api/src/features/assistant/register-suggestion-routes.ts`).

## Status update — 2026-07-02 (Phase 4 of rules-engine-v2 — one concrete lane wired, still gated OFF)

The rules-engine-v2 plan's Phase 4 built the **first real consumer** of this ticket's suggestion-layer
scaffold: **email-triage categorisation**, not the case/damage-assessment or image/reg-OCR sub-tools
(TKT-016/017/018 remain unbuilt as noted below). `b62b0df` replaced the dormant stub body of
`services/orchestration/src/workflows/intake/triage-classify.ts` with a real Azure OpenAI structured-output call
(GA v1 surface, `json_schema` strict-mode locked to the live taxonomy, `reasoning_effort: low`,
`content_filter` responses treated as abstain, keyless via the orchestration app's managed identity — no
key app-setting). It is wired **post-classify, for abstain/`uncorroborated_*` rows only**; results ride
this ticket's own `ai_suggestion` lifecycle as `suggestion_type: 'triage_category'`, and accepting one
promotes `inbound_email.category_code`/`subtype_code` with `classifier_mode: 'llm'` plus an
`inbound_reclassified` audit row (`services/data-api/src/features/assistant/register-suggestion-routes.ts`) — reusing, not duplicating, the
same feedback-provenance writer a staff reclassify uses.

**MI grant applied:** the orchestration app's managed identity holds **Cognitive Services OpenAI User** on
the Foundry account `digital-3339-resource` — applied and verified 2026-07-02 (role assignment
`d695d697-…`; see [docs/tickets/BOARD.md](../../BOARD.md) §D6 item 3 and the registry
[live-environment.md](../../../operations/live-environment.md)). Item 1 of the "Operator / next steps"
list below (deploy a model) is therefore **done** — `gpt-5` is deployed on that resource (`gpt-5-mini` is
not).

**A/B evidence:** `scripts/evaluation/email/run_ab.py` (new, Phase 4) ran a live 3-item smoke test against
`gpt-5` on 2026-07-02 — 0 abstains, every response matched the strict-JSON contract; `gpt-5-mini`
correctly 404s (not deployed).

**Still gated OFF — nothing above is live-acting:** `EMAIL_AI_ENABLED` (the orch LLM call) and
`AI_ASSIST_ENABLED` (the API suggestion surface used by both this lane and the CaseDetail
`AiAssistPanel`) are both absent from app settings, so the whole path is dead by default. Flipping
`EMAIL_AI_ENABLED` to production needs the **G5 per-AI-gate sign-off** (AI *testing* on repo data is
already authorised — the A/B smoke above used that authorisation) — tracked at
[docs/tickets/BOARD.md](../../BOARD.md) §D6 item 3 / §E2. The **case/damage-assessment and image/reg-OCR
consumers** (TKT-016/017/018) and the generic `POST /api/cases/{id}/ai-suggestions/generate` /
`callModelForSuggestions` path are **unchanged** — still an honest no-op; only the email-triage lane
described above got a real model call this pass.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)

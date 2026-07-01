# ADR-0019 — Triage stage split: engine signals, domain policy, gated AI suggestions

**Status:** Proposed (2026-07-02). Extends ADR-0015 (email triage) and ADR-0018 (vendored engine);
builds on ADR-0010 (dedup ladder) and ADR-0011 (provider / intermediary roles). Realised by the
[rules-engine-v2 plan](../plans/rules_engine_v2_plan_9ba034c4.plan.md) (ROADMAP Phase 8's Azure-era
realization); authoring this ADR is a **Phase-0 exit criterion** of that plan.

## Context

The deterministic classifier (ADR-0015) is accurate on pure text but the remaining live
misclassifications are **context failures**: a follow-up with a job ref mints a new case instead of
attaching (TKT-023); cancellations have no category (TKT-041); intermediary-routed instructions can't
resolve their provider (TKT-021/051). The signals needed to fix these — open-case references,
conversation history, the Image-Source intermediary map, per-provider automation modes — live in
Postgres/Graph and **cannot** be seen by a pure text function, while the text signals themselves
(phrases, refs, VRM, thread-scope) must stay single-sourced in the vendored engine (ADR-0018) or the
regex/normalization stack forks.

## Decision — split by what the rule needs to see

1. **Stage A — text signals stay in the vendored engine** (`rules/email_classifier.py`): pure, $0,
   authored in the sibling and re-vendored on tags. It proposes a category/subtype and surfaces
   references (Case/PO, provider ref, job ref, VRM), reply/thread-scope, and corroboration flags. It
   never sees live state.
2. **Stage B — a deterministic triage-policy module in `packages/domain`** (pure TS over **injected
   context**; joins `resolveCase` / `matchProviderByDomain` as an inviolable-rules peer). It maps
   *(classification × context)* → an action decision (mint / suggest-attach / query lane /
   cancellation proposal / hold), and is invoked from Durable **activities** (checkpointed results,
   persisted decision inputs, stated idempotency contracts — never inline in the orchestrator).
   Rejected alternatives: policy inside the Python engine (needs live DB/Graph context a vendored pure
   function must not touch); policy inline in the orchestrator (untestable, replay-fragile).
3. **Stage C — the gated LLM/embeddings pass is a suggestion writer, never an actor.** It runs only
   for abstain/`uncorroborated_*` rows (per ADR-0015's 2026-06-29 update), input is pre-scrubbed by
   the `pii-scrub` helper, output is structured to the taxonomy and lands in the existing
   `ai_suggestion` accept/reject lifecycle (`classifier_mode='llm'`, model+version stamped). Gates:
   `EMAIL_AI_ENABLED` (the model call) and `AI_ASSIST_ENABLED` (the suggestion surface), both
   default-off; per-provider `ai_allowed` and the global kill switch are honoured; content-filter
   refusals degrade to abstain.
4. **Suggest-first promotion ladder.** Every new policy behaviour ships behind its own default-off
   gate and starts **suggestion-only**; promotion to an automatic action (e.g. exact-ref auto-attach)
   requires eval-corpus results plus live staff confirmations. VRM-only matches are **never**
   promoted past suggestion (ADR-0010's no-ref rung). Box archival remains one-way (ADR-0012):
   "detach" is unlink + flag-for-manual-cleanup, so no behaviour is promoted on a reversibility
   promise the archive cannot keep.
5. **Decision telemetry.** Every policy decision (would-be action, inputs, rule/policy version) is
   logged to App Insights customEvents always-on — the observation channel for promotion decisions —
   rather than a shadow-write into gated tables.

## Consequences

- The orchestrator's routing collapses to "ask the policy, dispatch the decision" — behaviour becomes
  unit-testable in `@cs/domain` and diffable per ruleset version.
- Taxonomy changes acquire a **deploy order**: DDL/choicesets land before any engine tag that emits
  new categories (the engine tag itself is the compatibility boundary).
- Cross-mailbox duplicate delivery + the pre-mint ref-gate widen the mint race: the policy layer
  requires an `internetMessageId` dedup rung and Data-API-side serialization (advisory lock on
  ref/VRM around resolve/ref-gate).
- The LLM pass inherits a data-residency fact the operator signs off (E2/G5): the chat model is a
  Global deployment (processing may leave the UK; at-rest stays in-region) — recorded in the registry.

## Links

- [Rules-engine-v2 plan](../plans/rules_engine_v2_plan_9ba034c4.plan.md) · ADR-0010 · ADR-0011 ·
  ADR-0012 · ADR-0015 (+ its 2026-07-02 taxonomy-v2 update) · ADR-0018 · `docs/gated.md` §D6.

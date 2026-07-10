# Changes — TKT-018: AI VLM total-loss vs repairable categorisation (deferred)

## Status
backlog

## Commits
No code changes — see Summary

## Files touched
- n/a

## Summary
Explicitly deferred. This is the most downstream AI capability — a VLM that assesses damage and categorises total-loss vs repairable — and depends on the suggestion layer (TKT-015) and image analysis (TKT-016) being in place first. The operator marked it deferred until the pipeline is complete; it stays in `backlog` with no work started.

## Determination — 2026-07-10 (backlog-drain batch, operator re-affirmation)

Asked directly during the 2026-07-10 backlog-drain planning (AskUserQuestion), the operator chose
**"Keep deferred"** over building dark behind a `DAMAGE_CATEGORY_ENABLED` gate or moving to
`blocked`. The ticket stays in `backlog`; the deferral remains the operator's to lift. No build, no
DPIA work. The 2026-07-09 assessment below (dependencies live, build shape, fresh-DPIA requirement)
remains the current picture.

## Determination — 2026-07-09 (PLAN-003 final wave D2, assessment only — no build)

**The dependencies this ticket was deferred behind are now live.** Per the registry
([live-environment.md](../../../architecture/live-environment.md) / `LIVE_FACTS.json`, 2026-07-09):

- **TKT-015 suggestion layer** — live (`AI_ASSIST_ENABLED=true` on `cespk-api-dev`): the `ai_suggestion`
  generate/review seam, the CaseDetail assist panel, and the audited accept/dismiss path all exist.
- **TKT-016 image analysis** — live (`IMAGE_ANALYSIS_ENABLED=true`): the staged image-analysis producer
  runs vision calls over case photos and writes suggestion rows (never evidence columns).
- The per-gate data-protection attestation of **2026-07-08** signed both gates
  (data-protection.md §6a), including the vehicle-photo vision path.

**What a build would now involve** (estimate recorded for operator prioritisation — NOT started):

1. **A new suggestion type** (e.g. `damage_severity` with values `total_loss_candidate` /
   `repairable_candidate` / `uncertain`) written as an `ai_suggestion` row — riding the existing TKT-015
   review seam, so it is suggest-only and human-accepted by construction (no new write path, honouring
   the TKT-088/112 writer-ownership model: the api image route writes suggestions only).
2. **A vision prompt extension** on the existing image-analysis producer (same AOAI `gpt-5` deployment,
   same blob/Box byte lanes): assess the damage-closeup + overview set and return a categorisation with
   a plain-language rationale. Structured-output schema + prompt fixture tests offline.
3. **UI**: render the suggestion in the case assist panel with the existing accept/ignore semantics —
   plain language ("The assistant thinks this vehicle may be beyond economical repair"), never a verdict.
4. **Governance**: a fresh DPIA look is warranted before flipping any gate — this flow produces an
   *economic judgement about a claim*, a higher-stakes output class than role/registration classification;
   the 2026-07-08 attestation covered classification/assist, not loss categorisation. Operator sign-off
   line would go in docs/gated.md.
5. **Gate**: its own app-setting (e.g. `DAMAGE_CATEGORY_ENABLED`), default-off, built dark.

**Decision: stays `backlog`.** The ticket was operator-deferred ("until the pipeline is fully complete");
that deferral is the operator's to lift, and nothing downstream blocks on it. No code was changed.

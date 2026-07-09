# Changes — TKT-112: Reconcile the two image-classification writers

## Status
determination recorded (PLAN-003 final wave D2, 2026-07-09) — invariant verified, NO code change needed

## Commits
No code changes — the invariant the ticket feared broken is real in code; this records it.

## Files touched
- this changes.md (ownership determination)

## The two writers, verified in source (2026-07-09)

**Writer A — orchestration auto-classifier (authoritative intake stamps).**
`orchestration/src/lib/image-classify.ts` (gate `IMAGE_ROLE_CLASSIFY_ENABLED`, live `true` on
`cespk-orch-dev`): classifies at intake and STAMPS evidence columns — `image_role_code`,
`registration_visible`, `person_reflection`, `accepted_for_eva`, `excluded`/`exclusion_reason`
(person-reflection exclusion rule) — via `POST /api/internal/cases/{id}/evidence`
(`classifyPersist.ts` + `extractImages.ts` → `data-api.ts persistEvidence/persistImageEvidence`).

**Writer B — api image-analysis route (suggestions only).**
`api/src/functions/image-analysis.ts` (route `cases/{id}/image-analysis/generate`, gate
`IMAGE_ANALYSIS_ENABLED`, live `true`): its ONLY DB write is `persistDraft` →
`INSERT INTO ai_suggestion …` (idempotent NOT-EXISTS on a same-target pending row). Its reads of
`evidence` and `case_` are SELECT-only; it never UPDATEs `evidence.image_role_code`,
`registration_visible`, `person_reflection`, or any case column. The file's own header states
the invariant ("this route ONLY inserts ai_suggestion rows…"), and the TKT-016 non-collision
invariant HOLDS in the deployed source.

**The only path from a suggestion to an evidence column is human accept**:
`api/src/functions/ai-suggestions.ts reviewAiSuggestion` → `promoteAcceptedSuggestion`, which
applies `image_role`/`registration` suggestions onto `evidence` (audited,
`ai_suggestion_accepted`) — a reviewer action, not a second autonomous writer.

## Decision — the documented ownership model

1. **Orchestration owns autonomous evidence-column stamps** (intake-time classification, both
   byte lanes). Any future event-time classification (e.g. the box-upload live-classify path)
   belongs HERE, not in the api.
2. **The api owns reviewer-mediated writes only**: image-analysis produces `ai_suggestion` rows;
   a human accept (the audited review seam) is the only promotion into evidence columns. Staff
   manual re-roling via the SPA remains the override layer.
3. **One-shot backfills** (TKT-064's original pass; TKT-131's retry run in this batch) are
   admin-driven passes that mirror Writer A's exact policy mapping
   (`classificationToEvidenceFields`) — they act FOR the orch writer over historic rows, they do
   not constitute a third model.
4. **No path is deleted or disabled** — the ticket's "delete or permanently disable the losing
   path" clause is satisfied by there being no losing path: the two writers write DISJOINT
   targets (evidence columns vs ai_suggestion rows) by construction, and the acceptance's
   "exactly one image classification writer is active" holds for evidence columns (orch only).

## TKT-088 linkage
TKT-088's stale premise (auto-classification never built) is corrected in
[TKT-088's changes.md](../TKT-088-image-role-classification-check/changes.md); the operator
decision it awaited was superseded by the TKT-064 build + 2026-07-08 vision go-live.

## Acceptance mapping
- "Exactly one image classification writer is active or planned" — YES for evidence columns
  (orch); the api route is a suggestion producer, not an evidence writer (verified in source).
- "The other path is removed, disabled, or documented as superseded" — documented above: not a
  competing path; suggestion-only by invariant.
- "Vision tickets proceed only after this is resolved" — resolved; TKT-016/017 already shipped
  under exactly this model, TKT-018 remains operator-deferred (its assessment records the same
  ownership rule).

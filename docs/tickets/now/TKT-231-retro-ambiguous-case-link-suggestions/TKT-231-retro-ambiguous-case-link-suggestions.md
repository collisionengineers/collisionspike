---
id: TKT-231
title: Surface ambiguous retro matches as case_link suggestions on the Attach-to-case banner
status: now
priority: P3
area: email
tickets-it-relates-to: [TKT-219, TKT-137, TKT-093, TKT-194]
research-link: docs/tickets/now/TKT-231-retro-ambiguous-case-link-suggestions/evidence/post-sweep-audit-2026-07-16.md
---

# Surface ambiguous retro matches as case_link suggestions on the Attach-to-case banner

## Problem

Rung-1 `ambiguous` returns silently: when the retro any-status existence ladder matches MORE
than one case, `retro/resolve-existing` writes a `duplicate_flagged` audit carrying
`candidateIds` — and nothing staff-visible happens. Six live rows sit in this state (2026-07-16
audit, distilled in
[evidence/post-sweep-audit-2026-07-16.md](./evidence/post-sweep-audit-2026-07-16.md)): the
email stays un-linked with no banner, no chip, no queue signal.

Deploy-train note: this ticket rides PR #102's open deploy train together with TKT-227/228
(pre-existing production P1s unrelated to the retro work — on the train because the operator
wants remediation deployed, not because they are retro regressions) and TKT-229/230. TKT-231
was split out of TKT-230 because it rides the suggestion subsystem (`ai_suggestion`/review
flow) rather than the retro pipeline, and it is the only piece that can safely miss the train.

## Decision

Per-candidate **`case_link` suggestions** feeding the EXISTING "Attach to case" banner and
review routes (`suggestion-review-routes` accept-side effects; the reversible attach) — NOT a
new `attention_reason` value. Zero schema change, zero SPA change. Suggestions are PASSIVE
(`autoAttach` never set): a human picks the right case; never auto-mint.

Coordination: **TKT-194 owns any future `attention_reason` vocabulary change; TKT-231
deliberately avoids that constraint** (relates-to linked both ways).

## Change

- `retro-routes.ts`, `internalRetroResolveExisting`, `rows.length > 1` branch, after the
  `duplicate_flagged` audit: resolve the trigger's `inbound_email` id from
  `body.trigger.internetMessageId` (the row exists on the orchestrated path — classifyInbound
  upserted it earlier in the same run; a missing row degrades to the sourceMessageId-subject
  idempotency key), then write one pending `case_link` suggestion per candidate — capped at 5,
  `rows` ordering — with a plain-English rationale ("This email matched more than one case
  by <matched-by label>; choose the right one") and
  `decisionInputs: { matchedBy, keys, candidateIds, source: 'retro_ambiguous' }`.
  Best-effort: a suggestion failure never changes the `ambiguous` outcome.
- **Refactor, don't duplicate**: the suggestion INSERT (idempotency probe, Case/PO enrichment,
  suggested_value build, type-specific audit) is extracted from `internalTriageSuggestLink`
  into the shared exported helper `insertPendingSuggestion`
  (`services/data-api/src/features/inbound/suggestion-write.ts`); both the triage route and
  the retro seam call it. Route behaviour (including TKT-093 auto-attach, which stays in the
  route) is unchanged.
- Idempotency: candidates that already have a pending `case_link` suggestion for
  `(inbound_email_id, target_case_id)` are skipped — a re-run mints zero new rows.

## Known limitation (v1, accepted)

The banner renders the FIRST pending suggestion per row; multiple candidates surface
sequentially (accept/reject one, the next appears). A picker UI is a follow-up.

## Acceptance

1. An ambiguous retro resolve writes N (≤5) pending `case_link` suggestions, one per candidate,
   keeps the `duplicate_flagged` audit, and still returns `outcome: 'ambiguous'`.
2. A re-run of the same trigger dedupes to zero new suggestion rows.
3. The single-hit (linked) branch writes no suggestions.
4. The inbox row shows the existing "Attach to case" banner; accepting performs the standard
   reversible attach; nothing auto-attaches.

## Follow-ups (P4 — record only)

- SPA case-page renders taking ~30 s on some cases (performance; unrelated subsystem, observed
  during the audit).

## Artifacts

- [Changes made](./changes.md)
- [Verification record](./verification.md)

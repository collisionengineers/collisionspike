# TKT-231 research note — post-sweep three-agent audit, 2026-07-16 (distilled)

Distills the TKT-231 portion of the 2026-07-16 three-agent audit of PR #102.

## Root cause

- Rung-1 `ambiguous` returns silently: `retroCaseOrchestrator` maps
  `resolved.outcome === 'ambiguous'` straight to a terminal
  `{ outcome: 'ambiguous', candidateCount }` return.
- The data-api side (`internalRetroResolveExisting`, `rows.length > 1`) already writes a
  `duplicate_flagged` audit with `candidateIds` — but audits are not a staff work surface:
  the trigger row stays `case_id NULL`, no banner, no chip. Six live rows at audit time.

## Why case_link suggestions (and not an attention_reason)

- The whole review surface EXISTS: pending `case_link` suggestions render the "Attach to case"
  banner (inbox-panels), the review routes accept/reject them, and the accept side performs
  the reversible FILL-IF-EMPTY attach (`suggestion-review-routes` / the same promotion
  `internalTriageSuggestLink`'s auto-attach uses). Zero schema change, zero SPA change.
- A new `attention_reason` value would collide with TKT-194's reason-code widening — TKT-194
  owns that vocabulary; TKT-231 deliberately avoids it.
- Passive by doctrine: `autoAttach` is a TKT-093 lever gated far upstream; the retro seam
  never sets it. Never auto-mint, never auto-link an ambiguous match.

## Design points verified during implementation

- The suggestion INSERT lived inline in `internalTriageSuggestLink`
  (services/data-api/src/features/inbound/internal-triage-routes.ts — note: the file is under
  features/inbound/, not features/cases/ as the tasking said). Extracted verbatim to
  `suggestion-write.ts#insertPendingSuggestion` so both callers share idempotency, Case/PO
  enrichment, suggested_value shape and the type-specific audit.
- Idempotency key: `deriveSuggestionIdempotencyKey` — inbound_email_id-subject when the row
  resolves, else sourceMessageId-subject (the suggested_value carries sourceMessageId for the
  fallback probe), per (type, subject, targetCaseId). A re-run therefore mints zero new rows
  per candidate.
- Cap: 5 per trigger in `rows` ordering (`ORDER BY created_at` — oldest case first); the
  `decisionInputs.candidateIds` still names ALL candidates so the review has full context.
- Rationale language: plain business words (AGENTS.md UI-language rule) — matchedBy maps to
  "its Case/PO reference" / "the provider reference" / "the vehicle registration", never the
  internal token.

## Known limitation

The banner renders the first pending suggestion per row; candidates surface sequentially.
Acceptable v1; picker UI is a follow-up.

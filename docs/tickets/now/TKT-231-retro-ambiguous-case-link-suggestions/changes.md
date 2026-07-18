# TKT-231 — changes

## Code

- NEW `services/data-api/src/features/inbound/suggestion-write.ts`
  - `insertPendingSuggestion(...)` — the pending-suggestion writer extracted VERBATIM from
    `internalTriageSuggestLink`: idempotency probe (`deriveSuggestionIdempotencyKey`, pending
    twin per (type, subject, targetCaseId)), best-effort Case/PO enrichment, per-type
    `suggested_value` build, INSERT, and the type-specific audit
    (inbound_link_suggested / cancellation_proposed / ai_suggestion_created).
    Returns `{ suggestionId, created }`; never auto-attaches.
- `services/data-api/src/features/inbound/internal-triage-routes.ts`
  - `internalTriageSuggestLink` now delegates to the shared writer; validation, the
    created:false early return, the 500-on-no-id, and the TKT-093 auto-attach block stay in
    the route (behaviour preserved; the duplicated cancellation/triage_category audit blocks
    were removed — they ride the writer).
- `services/data-api/src/features/inbound/retro-routes.ts`
  - `internalRetroResolveExisting` `rows.length > 1` branch: after the `duplicate_flagged`
    audit, resolves the trigger's inbound_email id, then writes one PASSIVE pending
    `case_link` suggestion per candidate (cap `RETRO_AMBIGUOUS_SUGGESTION_CAP = 5`, rows
    ordering) with plain-English rationale and
    `decisionInputs { matchedBy, keys, candidateIds, source: 'retro_ambiguous' }`.
    Whole block is best-effort try/catch — a suggestion failure never changes the
    `ambiguous` outcome. Structured `retroAmbiguousSuggestions` log line.

## Tests (`retro-routes.test.ts`, new describe)

- Ambiguous (3 candidates): 3 suggestion INSERTs in rows order, each with
  `targetCaseId`/`decisionInputs.source='retro_ambiguous'`/full `candidateIds`, resolved
  inbound_email id, plain-language rationale, NO autoAttach; the `duplicate_flagged` audit
  kept; 3 `inbound_link_suggested` audits via the shared writer; response still
  `{ outcome: 'ambiguous', candidateCount: 3 }`.
- Cap: a 7-way ambiguity mints exactly 5 (cases 1–5).
- Re-run: pending twins short-circuit → 0 new rows, 0 new link audits.
- Single hit: `linked`, zero ai_suggestion statements.

## Deviations from the plan / tasking (recorded)

1. **File location**: `internal-triage-routes.ts` lives under
   `services/data-api/src/features/inbound/`, not `features/cases/` as the tasking scope line
   said. The shared helper was placed beside it (`features/inbound/suggestion-write.ts`)
   rather than exporting from the routes module (importing a routes module for a helper would
   drag `app.http` registrations into every consumer/test).
2. **Rationale wording**: the plan's literal `<matchedBy>` token (e.g. `external_ref`) would
   leak an internal token into a staff-facing banner; mapped to plain business words
   ("the provider reference" / "its Case/PO reference" / "the vehicle registration") per the
   AGENTS.md user-interface-language rule.
3. The extraction moves the cancellation/triage_category audits inside the shared writer —
   call order and payloads are unchanged (audit-then-auto-attach preserved for case_link).

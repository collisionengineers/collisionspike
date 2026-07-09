# Changes — TKT-023: Link follow-up documents/emails to the existing case + Box
## Status
next — the ref-gate/suggest-link machinery is built and deployed but GATED OFF by default
(`TRIAGE_REF_GATE_ENABLED`); needs the D7 DDL delta + that gate flip to activate. See
[verification.md](./verification.md).
## Commits
- `7bac2ee` — feat(domain): Stage-B triage-policy module + `TRIAGE_*` kill-switch gates + v2 codecs/DTO.
- `00980d5` — feat(api): triage context + suggest-link endpoints, advisory-lock serialization, suggestion
  promotion, detach — `POST /api/internal/triage/context` (open-case matches case_po>job_ref>vrm +
  duplicate internetMessageId rung) with `pg_advisory_xact_lock` serialization shared with
  `cases/resolve` + `linkReply` (closes the pre-mint race this ticket names); `linkReply`'s ref match made
  case-insensitive.
- `9fb16cf` — feat(orch): wire Stage-B triage policy into intake (step 1.55) — the acting decision runs on
  the real `TRIAGE_*` gates, default off ⇒ `proceed_default` (today's behaviour, byte-for-byte unchanged)
  until the gate flips; shadow decisions (all gates forced on) always log to App Insights `customEvents`.
- `69ec02e` — feat(spa): case_update/cancellation tabs + suggested-match banner + unlink affordance (the
  staff-facing accept/reject surface this ticket's "fall back to human review" criterion needs).
## Summary
Captures the operator's ask to correlate a follow-up reply (to a document request
we sent) back to its existing case and push the document to Box, instead of
creating a duplicate case. Related to TKT-003/TKT-004 (intake/dedup) and TKT-009
(chaser/Box workflow). The generalised ref-gate is built and deployed gated-off; it does not yet run
because `TRIAGE_REF_GATE_ENABLED` is unset and its DDL prerequisite (D7) is not yet applied live.

## 2026-07-09 — chaser hook (PLAN-003 intake wave; the ticket's remaining acceptance line)

**"The outstanding-document chaser for that case is marked satisfied"** is now wired at every
attach seam: new `markOutstandingChasersResponded(caseId, via)` in `api/src/functions/internal.ts`
flips a case's outstanding chasers (drafted 100000000 / sent 100000001 / overdue 100000003 →
**responded** 100000002) with a chaser-family audit row ("Chaser marked responded — the requested
item arrived (…)"), and is called on:
- `internalInboundLinkReply` linked outcome (auto-linked reply),
- `internalCasesResolve` attach resolution (dedup attach),
- the suggest-link `autoAttach` self-accept (TKT-093 lane),
- `promoteAcceptedSuggestion`'s case_link accept (staff accepting a suggestion —
  `api/src/functions/ai-suggestions.ts`).
No-op when the case has no outstanding chaser; best-effort (a chaser bookkeeping failure can never
block the attach). Unit tests: `api/src/functions/internal-guards.test.ts` (flip set + params,
no-op, failure tolerance). Deployed 2026-07-09 (api 89 fns). Live state: exactly 1 drafted chaser
exists — the flip fires on that case's next attached reply (verifier item).

### 2026-07-09 correction — the suggestion-accept seam was MISSED (PLAN-003 final wave D1)

The list above claimed `promoteAcceptedSuggestion`'s case_link accept called the hook — **it did
not** (the intake-wave build wired the three internal.ts seams only; `ai-suggestions.ts` never
imported it). Fixed this wave: the `case_link` accept branch in
`api/src/functions/ai-suggestions.ts` now calls `markOutstandingChasersResponded(targetCaseId,
'suggestion accepted')` immediately after the successful FILL-IF-EMPTY attach + `inbound_linked`
audit (imported from `./internal.js` — reused, not duplicated; still best-effort inside the hook,
and NOT called when the attach was a no-op or the suggestion was rejected). Unit tests added in
`api/src/functions/ai-suggestions.test.ts` (hook called with the target case on a successful
promotion; not called on a FILL-IF-EMPTY miss; not called on rejection — `./internal.js` mocked so
the route module stays isolated). api suite 352 green; redeployed 2026-07-09 (api 94 fns,
final wave D1). All four attach seams now call the ONE hook.

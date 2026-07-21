# Changes — TKT-294: triageUnified activity (PLAN-014 Slice 4a)

## Status
coded, offline-verified — awaiting PR review/merge

## What changed

- **New** `services/orchestration/src/workflows/intake/triageUnified.ts` — the composed
  activity + its exported pure builders (see ticket body).
- **New** `services/orchestration/src/workflows/intake/triageUnified.test.ts` — unit
  tests for every new export + the gate-off structural-equivalence proof.
- `packages/domain/src/gates.ts` — new `triageParseFed` gate.
- `services/orchestration/src/index.ts` — registers `triageUnified.js`; comments on the
  two existing imports noting their supersession (docstring banners inside
  `classifyInbound.ts`/`triagePolicy.ts` themselves were not added — both files have a
  pre-existing, unrelated mixed CR/LF line-ending inconsistency that made a safe
  string-anchored edit impractical; the supersession is documented here, in `index.ts`'s
  inline comments, and in this ticket instead).

## Review fixes (automated-review + rebase onto engine-consolidated main)

Rebased onto main (Slices 0–2 landed). The parse-fed plumbing is now COMPLETE in this slice so
Slice 4b only threads real values via the orchestrator reorder:

- **Parsed identifier → policy classification (P1 functionality fix):** `toPolicyClassification`
  now injects the parsed `parserRef`/`parserVrm` into the classification's ref signals when
  parse-fed. Without this, the widened lookup found the open case but `decideTriage`'s `hasRefSignal`
  (which requires a classification-level ref) fell through to the default action — defeating the
  whole parse-fed ref-gate. Classifier refs still win; a new functional test proves a document-only
  Case-ref reaches `suggest_attach`/`attach_case` (and its control proves it did NOT before), and an
  ADR-0010 test proves a VRM-only match never auto-attaches (the `matchedOn !== 'vrm'` guard holds).
- **`parsed` input threaded** into the pre-classify probe (D1), content typings (D4), the widened
  lookup, and the policy classification — all gated on `parseFedOn` (empty in 4a; 4b supplies them).
- **Stale-context reuse dropped:** Stage B now ALWAYS runs a fresh Lookup B (post-classify), instead
  of reusing Lookup A when the requests matched — so it never decides/auto-attaches on a pre-classify
  snapshot a concurrent mint/close could have staled. `contextRequestsEqual` removed.
- **Telemetry (`parseFedApplied`) now reflects ACTUAL parse-fed usage** (a resolved
  `open_case_ref_match` of one/ambiguous OR ≥1 content typing), not just the gate — with
  `parseFedGateOn` + `openCaseRefMatch` + `parseFedContentTypingCount` added so the Slice-5 KQL can
  distinguish a genuinely parse-fed decision from a gate-on-but-empty legacy input.
- Return gains `parseFedGateOn` (the gate value) — the checkpointed signal Slice 4b's orchestrator
  uses to decide whether the downstream lanes may use the hoisted parser VRM/ref (Durable
  determinism; never re-reads process.env).
- `buildParseFedClassifyRequest` narrowed `openCaseRefMatch` to `one|none|ambiguous|''` to match
  Slice 2's client union; `''` omits the field. Registered `plan: PLAN-014`.

## What did NOT change

`intakeOrchestrator.ts` — untouched in 4a, still calls the two old activities (4b does the reorder).
`decideTriage` — unchanged, only its INPUTS widen (the ref injection). No live behavior change (the
new activity isn't called by anything until Slice 4b, and it is gate-off).

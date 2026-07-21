# Changes — TKT-295: atomic parse→triage reorder + TKT-102 collapse (PLAN-014 Slice 4b)

## Status
coded, offline-verified — awaiting PR review/merge

## What changed

- **New** `services/orchestration/src/workflows/intake/parse-candidates.ts` — the pure
  `orderParseCandidates` + `ParseAttachment` + doc/pdf/email predicates + `MAX_PARSE_DOCS`, extracted
  from `parse.ts` (dependency-free, safe to value-import from the orchestrator body).
- `services/orchestration/src/workflows/intake/parse.ts` — imports + re-exports the extracted
  surface (single definition; `parse.test.ts`/`classifyPersist.ts` unchanged).
- `services/orchestration/src/workflows/intake/intakeOrchestrator.ts` — the reorder:
  - parse hoisted after `providerMatch`, gated on `orderParseCandidates(...).length > 0`;
  - two-call `classifyInbound`+`triagePolicy` replaced by one `triageUnified` call fed `parsed`;
  - `classification`/`triage` now come from `triageResult.{classification,decision}`;
  - `laneParserVrm`/`laneParserRef` derived from the checkpointed `triageResult.parseFedApplied`;
  - **attach_case** caseVrm, **route_images_unmatched** vrm, **reply-link** ref+vrm switch to the
    Slice 0 helpers with the (gated) parser value in scope;
  - **TKT-102 lane**: inline `parse` call + its try/catch DELETED; rung reads hoisted `parserVrm`;
    the images-unmatched follow-up reads `parserVrm`;
  - receiving_work lane's own parse block DELETED (now hoisted); `caseTypeDecision` unchanged (still
    after triage, needs `classification.subtype`);
  - kill-switch invariant comment rewritten (values+gate, not code position); old "runs FIRST now"
    header replaced.
  - unused `import type { TriagePolicyDecision }` removed; added `orderParseCandidates` value import +
    `ParseAttachment`/`AttachmentTyping`/`TriageUnifiedResult` type-only imports.
- `services/orchestration/src/workflows/intake/triageUnified.ts` — input gains `parsed`; the three
  D1/D4 builders receive it only when `parseFedOn`; result gains `parseFedApplied`.
- `services/orchestration/src/workflows/evidence/imagesReceivedVrmMatch.ts` — module doc corrected
  (describes the single hoisted parse, not the deleted inline call).
- **Tests**: `intake-terminal-replay.test.ts`, `intake-evidence-persist.test.ts`,
  `intake-retro-fallback.test.ts` updated for the new call sequence (`triageUnified` replaces the two
  calls; `parse` drops out for no-attachment fixtures). **New**
  `intake-parse-hoist-slice4b.test.ts` — the reorder + gate + TKT-102-collapse proof.

## Per-lane behavior-change callout (explicit, not silent)

| Lane | Pre-4b | Post-4b (parseFedApplied = true) | Post-4b (false) |
|---|---|---|---|
| attach_case evidence caseVrm | candidate/body | **PDF VRM preferred** (evidence stamp only) | candidate/body (identical) |
| route_images_unmatched vrm | candidate/body | **PDF VRM preferred** on the flag | candidate/body (identical) |
| reply-link ref / vrm | candidate/body | **PDF-only ref/VRM can now link** | candidate/body (identical) |
| TKT-102 rung vrm | inline-parse PDF VRM | hoisted PDF VRM (**same value**, one fewer parse) | same (ungated) |
| receiving_work → caseResolve | hoisted-earlier parserVrm/parserRef | unchanged (ungated, as today) | unchanged |

The three `parseFedApplied`-gated lanes are byte-identical to today when the gate is off, so the
Slice 5 gate-off deploy is decision- AND lane-identical (true ship-dark); the upgrades activate only
at the backtest-validated flip.

## What did NOT change

`decideTriage` logic; ADR-0010 (VRM-only never auto-attaches — reply-link/TKT-102 remain suggest-only
via the Data API + `matchedOn !== 'vrm'`); `parse.ts`'s parsing logic (only its call POSITION moved);
`caseResolve` and everything downstream; the Data API `/triage/context` contract; Stage C
`triageClassify`; PII rules.

**Old-activity registration (corrected after adversarial review):** the `triagePolicy` activity now
has NO remaining caller (dead-but-registered; removable one release after the flip). The
`classifyInbound` activity is **NOT dead** — `retroCaseOrchestrator` (`retro-case.ts`) still calls it
independently — so it stays live and must not be removed; only the intake path stopped using it.
`index.ts` and the orchestrator comment say this explicitly.

## Rebase onto engine-consolidated main + Slice 4a's completed plumbing

Rebased onto main (engine merge + Slices 0/1/2/4a landed). The `triageUnified.ts` parse-fed
plumbing now lives ENTIRELY in Slice 4a (TKT-294) — including the parsed-ref→policy-classification
injection and the telemetry fix — so this slice's `triageUnified.ts` changes are dropped (4a's
version is taken). The orchestrator's lane gate reads `triageResult.parseFedGateOn` (4a's returned
gate signal) instead of the earlier `parseFedApplied` (the orchestrator needs "is the feature on",
which is exactly `parseFedGateOn`; `parseFedApplied` is now a telemetry-only "did a signal actually
reach classify" field). Registered `plan: PLAN-014`. Full orchestration suite: 630 green.

## Adversarial review (pre-commit)

A dedicated adversarial pass verified all eight risk invariants: replay determinism (no `process.env`
read in the orchestrator body), gate-off byte-identity (decision AND the three parser-exposed lanes),
parse-hoist condition equivalence, TKT-102 collapse fidelity, no double-declaration, the
parse-candidates.ts extraction, triageUnified threading, and side-effect scope. No code-logic
regression or replay bug found. Three findings were addressed before commit:

1. **Comment accuracy** — "nothing calls them anymore" was false for `classifyInbound` (retro uses it);
   corrected in `index.ts` + the orchestrator (see above).
2. **Deploy-safety framing** — keeping the old activities registered does NOT make a reordered
   generator replay-safe for in-flight instances; the orchestrator comment now states the real
   mitigation is Slice 5's in-flight DRAIN, not registration.
3. **Telemetry scope** — `buildParserEvaFields` + the `claimant-body-conflict` log were hoisted, which
   would have broadened that telemetry to non-minting doc-bearing mail. Fixed by hoisting ONLY
   `parserVrm`/`parserRef`/`parserContentTypings` (what triage + lanes need) and keeping mileage /
   EVA-field / claimant-conflict derivations in the receiving_work lane (from the same `parseResult`),
   restoring their exact pre-4b scope.

# Verification — TKT-295: atomic parse→triage reorder + TKT-102 collapse (PLAN-014 Slice 4b)

## Verdict
TESTED-OFFLINE

## Evidence

- `services/orchestration`: `npx vitest run` — **57 test files, 627 tests, all green**. Includes:
  - the NEW `intake-parse-hoist-slice4b.test.ts` (5 tests) proving: parse runs BEFORE triageUnified
    for doc-bearing mail; no-doc mail skips parse; the `parsed` bag is threaded verbatim; reply-link
    ref/VRM come from candidate/body when `parseFedApplied:false` and from the PDF when `true`;
    TKT-102 parses exactly ONCE and feeds the rung the hoisted `parserVrm` with `triedVrm` unchanged;
  - the updated `intake-terminal-replay.test.ts` / `intake-evidence-persist.test.ts` /
    `intake-retro-fallback.test.ts` proving the new ordered call sequence across the attach_case,
    linked-reply, receiving_work, and retro-fallback lanes;
  - the pre-existing `parse.test.ts` (orderParseCandidates/MAX_PARSE_DOCS via the re-export) unchanged
    and green — confirms the parse-candidates.ts extraction is behaviour-preserving.
- `services/orchestration`: `npm run build` (`tsc -b --force`) — clean (BUILD_EXIT 0).
- `packages/domain`: `npx vitest run` — 32 files, **602 tests, all green** (unchanged by 4b; confirms
  the `@cs/domain` surface `triageUnified` composes is intact).
- `services/functions/parser`: unchanged by this slice (Slice 1's classifier edit is upstream in the
  branch lineage); its suite is green from Slice 1/2/3.

## Adversarial review

A dedicated adversarial pass (8 risk invariants: replay determinism, gate-off byte-identity across
decision + the 3 parser-exposed lanes, parse-hoist condition equivalence, TKT-102 collapse fidelity,
no double-declaration, the parse-candidates extraction, triageUnified threading, side-effect scope)
found NO code-logic regression or replay bug. Three findings (comment accuracy re `classifyInbound`
still being live via retro; deploy-safety framing = drain not registration; telemetry-scope
broadening from hoisting `buildParserEvaFields`) were all addressed before commit — see `changes.md`.

## Gate-off / replay-safety argument (structural)

- The orchestrator branches ONLY on checkpointed activity results (`triageResult.parseFedApplied`,
  `parseResult.*`) and values pure over the checkpointed `inbound` (`orderParseCandidates(...)`) — no
  `process.env` / `gates.*()` read is introduced in the orchestrator body (Durable determinism).
- `laneParserVrm`/`laneParserRef` are `undefined` when `parseFedApplied:false`; `case-identity.ts`'s
  `(parser || candidate || body || '').trim()` treats an undefined parser field as absent, so the
  gate-off lane result is identical to the pre-4b two-argument call (proven by the gate-off assertions
  in the new test).
- Parse-hoist condition equivalence: `orderParseCandidates(atts).length > 0` is exactly `parse.ts`'s
  own `!candidates.length` skip predicate, so no-doc mail that used to receive `{skipped}` now simply
  omits the call — `parserVrm`/`parserRef`/etc are `''` in both worlds.

## Pending / gaps (Slice 5's responsibility, not this PR's)

- No LIVE proof yet — the gate ships off (ADR-0027 ship-dark). Slice 5 (TKT-296) deploys gate-off,
  DRAINS in-flight Durable instances (the reorder changes the activity sequence, so an instance
  recorded against the OLD orchestrator must not replay against the NEW one — drained, not
  code-migrated), runs the live `triage_decision` KQL spot-check with the `parseFedApplied` filter,
  then flips `TRIAGE_PARSE_FED_ENABLED`. The post-flip latency/error-rate watch covers the two
  accepted costs named in the ticket.

## How to re-verify

- `cd services/orchestration && npm run build` — expect clean.
- `cd services/orchestration && npx vitest run` — expect 57 files / 627 tests green.
- `cd packages/domain && npx vitest run` — expect 32 files / 602 tests green.

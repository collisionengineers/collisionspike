---
id: TKT-294
title: triageUnified activity — composes classify + triage, no reorder yet (PLAN-014 Slice 4a)
status: verify
priority: P1
area: intake
tickets-it-relates-to: [TKT-290, TKT-291, TKT-292, TKT-293]
research-link: workingspace/proposedparserchanges.md
plan: PLAN-014
---

# triageUnified activity — composes classify + triage, no reorder yet (PLAN-014 Slice 4a)

## Problem

`intakeOrchestrator.ts` calls `classifyInbound` (Stage A) then `triagePolicy` (Stage B) as two
separate Durable activities. PLAN-014 replaces this with one composed activity, `triageUnified`, so
`open_case_ref_match`/`attachment_content_typings` can reach the classify call itself (D1). This
slice does NOT reorder the orchestrator — that is Slice 4b — so `triageUnified` is called from the
SAME position the two-call sequence occupies today, and has no parse result available yet.

## Proposed change (built)

New `services/orchestration/src/workflows/intake/triageUnified.ts`:

- Composes existing, UNCHANGED exports: `buildClassifyRequest`, `resolveActingClassification`
  (`classifyInbound.ts`); `deriveAttachmentSignals` (`triagePolicy.ts`); `resolveCaseVrm`/
  `resolveCaseRef` (`case-identity.ts`, TKT-290).
- New pure exports: `buildPreClassifyContextRequest` (D1 Lookup A), `resolveOpenCaseRefMatchState`,
  `deriveContentTypings` (D4, always `[]` in this slice — no parse result exists yet),
  `buildParseFedClassifyRequest`, `buildWidenedTriageContextRequest` (D1 Lookup B),
  `contextRequestsEqual` (skip Lookup B when its request equals Lookup A's).
- Gate `gates.triageParseFed()` (new, `packages/domain/src/gates.ts`), default off.
- Registered in `services/orchestration/src/index.ts`. `classifyInbound.ts`/`triagePolicy.ts` stay
  registered, UNMODIFIED, for Durable in-flight replay safety across the eventual Slice 4b deploy —
  not called by the orchestrator yet from either the old OR new activity in this slice; nothing
  in the orchestrator wiring changes until Slice 4b.

**Gate-off parity** is proven structurally, not via a full I/O-mocked handler run (matching this
directory's own established convention — `classifyInbound.test.ts`/`triagePolicy.test.ts` test pure
functions directly, not the full activity handler): `buildWidenedTriageContextRequest(inbound,
classification, {})` is proven `toEqual` `triagePolicy.ts`'s own `buildTriageContextRequest(inbound,
classification)` across 5 representative fixtures — this is the ONE new computation the gate-off
path introduces; every other step reuses an imported, unchanged function verbatim.

## Acceptance

- All new pure exports unit-tested (`triageUnified.test.ts`).
- Gate-off structural-equivalence proof (above) green across representative fixtures.
- Full `services/orchestration` vitest suite green (622 tests); full `packages/domain` suite green
  (602 tests); `npx tsc --noEmit` clean.

## What's deliberately NOT done here (Slice 4b's job)

The orchestrator does not call `triageUnified` yet — `intakeOrchestrator.ts` is untouched. Parse does
not run before this activity yet, so `attachment_content_typings` is always `[]` and Lookup A's
`parserVrm`/`parserRef` inputs are always undefined (the exported builders already accept them,
ready for Slice 4b to thread real values through without a redesign). No orchestrator-level replay
test exists yet for this activity, since nothing calls it — that proof belongs to Slice 4b, once the
orchestrator's generator actually swaps the two-call sequence for this one.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)

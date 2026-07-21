---
id: TKT-290
title: Centralize the intake orchestrator's duplicated VRM/ref precedence logic
status: now
priority: P2
area: intake
tickets-it-relates-to: [TKT-043, TKT-102]
research-link: workingspace/proposedparserchanges.md
plan: PLAN-014
---

# Centralize the intake orchestrator's duplicated VRM/ref precedence logic

## Problem

`intakeOrchestrator.ts` and `caseResolve.ts` repeat an ad hoc "prefer the best-known VRM/Case-ref
across sources" expression inline at 8 call sites. These are actually **two genuinely different
2-way chains**, not one repeated 3-way chain: sites before the parse activity has run compute
`candidateVrm || bodyVrm` (a cheap subject/body sniff vs. the classifier's own body extraction);
sites after parse has run compute `parserVrm || candidateVrm` (the document, which is authoritative
per ADR-0006, vs. the sniff). Nothing today expresses this as one definition, so each site is a
free-standing copy that could silently drift.

This is Slice 0 of the "parse-fed unified triage stage reorder" (PLAN-014, see the plan document's
Part 3): a forthcoming change (Slice 4b) makes `parserVrm`/`parserRef` available at several call
sites that currently only see the pre-parse chain — that slice is *guaranteed* to touch every one of
these expressions anyway. Landing the mechanical centralization first, as its own small PR, means
Slice 4b's diff is "add `parserVrm` as a new input to an existing helper call" rather than "add
`parserVrm` inline for a fifth/sixth time while also reordering 400 lines" — this repo has prior
incidents of a migration leaving a duplicate/orphaned mechanism behind (a stale-base PR reverting
already-shipped work invisibly to CI; a repo merge that ported UI components but dropped their
wiring), so keeping this refactor small, isolated, and behavior-proven is deliberate risk reduction,
not just tidiness.

## Evidence

- `services/orchestration/src/workflows/intake/intakeOrchestrator.ts` (pre-change): the `attach_case`
  lane's `caseVrm` (was line ~255), `route_images_unmatched`'s `vrm` (was ~354-355), the reply-link
  lane's `ref`/`vrm` (was ~377-378), the receiving-work dedup ladder's `candidateRef` (was ~535) —
  all `candidate || body`, no parser value available yet at these points.
- `correlatePreInstruction`'s `vrm` (was ~691), `receivingWorkEvidenceExtra.caseVrm` (was ~767),
  `enrich`'s `vrm` (was ~790) — all `parser || candidate`, no body fallback.
- `services/orchestration/src/workflows/intake/caseResolve.ts:63`'s `bestVrm` — same `parser ||
  candidate` chain as an activity input (the activity never receives `classification`, so it has no
  `bodyVrm` to fall back to either).

## Proposed change

New `services/orchestration/src/workflows/intake/case-identity.ts`: `resolveCaseVrm({parserVrm?,
candidateVrm?, bodyVrm?})` and `resolveCaseRef({parserRef?, candidateRef?, bodyCaseref?})`, both
parser-first — matching the existing post-parse convention already used at the three sites above,
not the candidate-first wording an earlier design sketch assumed. A caller that omits a field (e.g.
no `parserVrm` because parse hasn't run yet at that call site) degrades to exactly the narrower chain
it used before — this is a synthesis of the two existing chains into one general helper, not a
literal dedup, so each call site's swap is proven behaviorally equivalent by a dedicated unit test
before the swap, not assumed.

**Deliberately NOT centralized** (different, correct semantics — read and confirmed, not touched):
`caseResolve.ts:138`'s `candidateRef || parserRef` (candidate-first — a retro-discovered, verified
Case/PO must outrank a freshly parsed one there) and the TKT-102 lane's `triedVrm` (means "what did we
already try and fail on before this parse result existed," which must never include the parse result
it predates — centralizing it would be a genuine behavior change, not a refactor).

## Acceptance

- `resolveCaseVrm`/`resolveCaseRef` exist in `case-identity.ts`, unit-tested per real call-site
  scenario (pre-parse chain, post-parse chain, whitespace-only-source edge case) before any call site
  is swapped.
- All 8 identified call sites (7 in `intakeOrchestrator.ts`, 1 in `caseResolve.ts`) use the new
  helpers; the 2 deliberate exceptions are left inline, each with a comment explaining why.
- Zero behavior change: the full `services/orchestration` vitest suite passes unchanged (no test
  assertions altered, only the new `case-identity.test.ts` added).
- `npx tsc --noEmit` clean for `services/orchestration`.

## Research

Distilled from PLAN-014's Part 3 design work (2026-07-21) — a two-approach design pass + adversarial
cross-review + a review-gate pass identified this as the correct "smallest safe unit first" slice,
landing before the parse-fed reorder itself (Slice 4b) so that later, riskier change has a smaller,
already-clean diff to work against. See `workingspace/proposedparserchanges.md` for the full reorder
context this slice serves.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)

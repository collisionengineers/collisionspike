# Changes — TKT-290: Centralize the intake orchestrator's duplicated VRM/ref precedence logic

## Status
coded, offline-verified — awaiting PR review/merge

## What changed

- **New** `services/orchestration/src/workflows/intake/case-identity.ts` — `resolveCaseVrm` and
  `resolveCaseRef`, both parser-first, with a module doc explaining the two chains they generalize
  and the two deliberate exceptions.
- **New** `services/orchestration/src/workflows/intake/case-identity.test.ts` — one test per real
  call-site scenario (pre-parse chain, post-parse chain, `caseResolve.ts`'s own chain, whitespace-only
  source, all-absent), plus a documented note on the preserved "whitespace-only higher-precedence
  source still wins and reduces to `''`" quirk inherited from the original inline
  `(a || b || '').trim()` expressions.
- `services/orchestration/src/workflows/intake/intakeOrchestrator.ts` — 7 call sites swapped to the
  new helpers (`attach_case`'s `caseVrm`; `route_images_unmatched`'s `vrm`; the reply-link lane's
  `ref`/`vrm`; the receiving-work dedup ladder's `candidateRef`; `correlatePreInstruction`'s `vrm`;
  `receivingWorkEvidenceExtra.caseVrm`; `enrich`'s `vrm`). TKT-102's `triedVrm` (the one deliberate
  exception in this file) is untouched, left inline.
- `services/orchestration/src/workflows/intake/caseResolve.ts` — `bestVrm` (line ~63) swapped to
  `resolveCaseVrm`. `candidateRef || parserRef` (line ~138, the other deliberate exception) is
  untouched.

## What did NOT change

No behavior. No test assertion was altered — only the new `case-identity.test.ts` file was added.
`decideTriage`, `resolveCase`, the Data API contracts, and every downstream activity are untouched.

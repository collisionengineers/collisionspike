# Changes — TKT-219: Run Box and Outlook retro locates in parallel and combine findings, widen triggers, and split dev/live Case-PO adoption

## Status
now — implementation complete + all suites green (2026-07-16); deploy + Box-rung activation + live
smoke in progress this session.

## Domain (`packages/domain`)

- `src/domain/retro-case.ts` — `RETRO_TRIGGER_OTHER_CATEGORY` ('other' is locate-only eligible, the
  TKT-119 ack pattern; reason `other_locate_eligible`); `isJunkRetroKey` (kind-aware guard pinned
  against the 13 TKT-140 junk keys — month/year, numeric dates, money amounts, dateless-plate and
  `…VEH` shapes for the VRM kind only) applied to every non-Case/PO key in `decideRetro`;
  `RetroKeys.claimant` + `bodyClaimant` input (forename+surname shape, ≥5 chars, matched-only);
  `hasUsableRetroKey`; `planRetroReconstruction` — the PURE parallel-rung combination matrix
  (box_source / combined / outlook_only / minimal_anchor / none).
- `src/gates.ts` — `retroAdoptArchivePo` (`RETRO_ADOPT_ARCHIVE_PO_ENABLED`, default off = dev-mint).
- `src/domain/retro-case.test.ts` — new suites: junk guard (all 13 junk keys reject; genuine corpus
  keys pass; kind-awareness), 'other' locate-only, claimant key shape, `hasUsableRetroKey`,
  `planRetroReconstruction` full matrix + gate-off asymmetries. 593 domain tests green.

## Orchestration (`services/orchestration`)

- `src/adapters/graph.ts` — `MESSAGE_SEARCH_PAGE_SIZE` 25→250; `searchMessages` gains an
  `onTruncated` callback (TKT-219 "no silent caps"); paging/cycle bounds unchanged (already present).
- `src/workflows/retro/retro-activities.ts` — `RETRO_SEARCH_TOTAL_LIMIT=500` per mailbox×variant
  with truncation logged via `ctx.warn`; claimant rung in `retroOutlookLocate` (searched as given —
  no compact/spaced variants for a name); claimant content-search tier in `retroBoxLocate`;
  weak-key-only corroboration generalised from VRM-only to VRM/claimant
  (`weak_key_uncorroborated`); `retroCreatePersist` forwards `intermediary`.
- `src/workflows/retro/retro-case.ts` — REWRITTEN: rung 1 unchanged and first; rungs 2+3 dispatched
  in ONE `Task.all` fan-out (per-rung salvage on partial failure); `planRetroReconstruction`
  drives four arms — box_source (today's Box behaviour + refused_category falls back to the
  IN-HAND Outlook hit, no re-search), combined (Box identity + corroborated Outlook material —
  replaces the data-empty minimal anchor; archive marker stays case-type ground truth; archive
  otherFiles still registered), outlook_only, minimal_anchor; shared `finishPersisted` chain runs
  classifyPersist WITH `caseVrm`+`workProviderId` (G2 — per-provider AI opt-out now holds) then
  `extractImages` (G1) then the folder-ensure (Outlook-only identity_ready) then statusEvaluate,
  for created AND already_exists_linked (removes the undocumented G4 asymmetry as a refactor
  consequence — TKT-220 scope adjusts at its pick-up); manual-drain path stamps
  `unable_to_locate` on `trigger_not_found` (the 19 unstamped TKT-140 rows' gap) and threads
  claimant + the drain's own providerMatch intermediary; stale "[R3 — not built]" header replaced
  with the parallel-ladder contract.
- `src/workflows/intake/intakeOrchestrator.ts` — both retro seams pass `bodyClaimant`
  (matched-only supplement) and the sender's intermediary match into the sub-orchestration.
- `src/adapters/data-api.ts` — retro payload/response typings (claimant, intermediary,
  resolvedProviderId).
- Tests: `graph.test.ts` truncation-callback case; `retro-case-provider-recovery.test.ts` rewritten
  for the fan-out (Task.all harness) + new combined-arm and refused-fallback generator tests.
  510 orchestration tests green.

## Data API (`services/data-api`)

- `src/features/inbound/retro-validate.ts` — claimant key normalisation + accepted in the
  resolve-existing key requirement (search-only key; never a rung-1 link probe).
- `src/features/inbound/retro-routes.ts` — `RETRO_ADOPT_ARCHIVE_PO_ENABLED` split:
  `identityVerified` requires the gate ON (dev-mint mode can never land terminal); the discovered
  PO reaches `case_ref` + an honest environment-aware note when adoption is off;
  `allowCasePoMint` opens for the normal allocator in dev-mint mode; `intermediary` forwarded into
  BOTH `applyParserFields` call sites (TKT-021 corroboration + single-candidate fallback now work
  on retro); responses carry `resolvedProviderId` (feeds the orchestrator's evidence chain).
- Tests: adoption ON verbatim-store + never-remint; adoption OFF dev-mint (case_ref carry, hold
  demotion despite a terminal request, honest note wording); intermediary forwarding;
  resolvedProviderId in both outcomes. 998 data-api tests green.

## Docs / registry (with TKT-221)

ADR-0022 2026-07-16 amendment (blocked-original categories; parallel ladder + combined arm;
adopt-PO gate; verified `$search` semantics; TKT-222 related-correspondence directive); TKT-119
acceptance-wording clarification; TKT-178 evidence cross-reference
`retro-po-adoption-flip-2026-07-16.md`; LIVE_FACTS.json `safetyGates.retroReconstruction` with the
dated az evidence.

## Follow-ups minted

- TKT-220 — remaining parity gaps (G3, G5, G6, G7, drain subtype, suspect-parserEva forwarding,
  un-mocked refused_category route test). Note: G4 landed here (see above).
- TKT-222 — link ALL related mailbox emails to a reconstructed case (operator directive
  2026-07-16), design recorded in the spec + ADR amendment.

## Gates run

`npm --prefix packages/domain run test` 593 ✓ · `npm --prefix services/orchestration run build` ✓
`test` 510 ✓ · `npm --prefix services/data-api run build` ✓ `test` 998 ✓ ·
`check-tickets` ✓ · `check-doc-links` ✓ · `generate-agent-adapters --check` ✓.

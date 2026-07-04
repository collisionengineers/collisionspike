# TKT-058 — changes log

## 2026-07-04 — R1 built (foundations + any-status link)

- **Domain** (`packages/domain`): new `src/domain/retro-case.ts` (+44-case test file) —
  `RETRO_TRIGGER_CATEGORIES`, `CASE_PO_SHAPE_RE` (anchored mirror of the classifier
  `CASEREF_RE`), `normalizeCasePo`, `decideRetro`, `decideRetroStatus`, `parseCasePoMarker`,
  `matchPrincipalByCasePo`, `markerToCaseType`, `selectBoxInstructionCandidate`; barrel export;
  `gates.ts` + `retroCase` / `retroOutlookSearch` / `retroBoxArchiveRootIds`.
- **Schema**: `migration/assets/schema/deltas/2026-07-04-retro-case.sql` (idempotent, additive
  — `choice_audit_action` 100000046-48, `choice_intake_channel_kind` 100000003 `retro`) +
  the same rows appended to canonical `000_enums_lookups.sql`. NOT yet applied live.
- **Data API** (`api`): `AUDIT_ACTION` + retro codes; exported the shared internals
  (`withServiceAuth`, `upsertInboundEmail`, `applyParserFields`, `isUniqueViolation`, envelope
  types) from `functions/internal.ts` (no behaviour change); new `lib/retro-validate.ts`
  (+tests) and `functions/internal-retro.ts` — `POST /api/internal/retro/resolve-existing`
  (any-status link, never-re-point guard, ambiguity flag) + `POST /api/internal/retro/create`
  (get-or-create under triage locks, verbatim discovered PO, terminal-only-when-verified,
  conflict→link); registered in `src/index.ts`.
- **Orchestration**: `lib/data-api.ts` + `retroResolveExisting`/`retroCreate`; new
  `functions/gated/retro-case.ts` — `retroCaseOrchestrator` (ladder scaffold: rung 1 live,
  R2/R3 rungs stubbed), activities `retroFindTrigger`/`retroResolveExisting`/
  `retroRecordFailure`, keyed drain starter `POST /api/retro-case` (deterministic
  `retro-<id>` instance dedup); registered in `src/index.ts`; two additive `decideRetro` +
  `callSubOrchestratorWithRetry` hooks in `intakeOrchestrator.ts` (reply lane after
  `linkReply` non-linked; non-reply lane before its return).
- **Verification**: domain 442→full-workspace 886 vitest green; api tsc + 153 tests green;
  orch tsc green; esbuild bundles rebuilt (`deploy/api/main.cjs`, `deploy/orch/main.cjs`).
  Gates unset everywhere → live behaviour unchanged (ships dark).

# Changes — TKT-016: Image-analysis VLM sequence (vehicle / reg / location)

## Status
now (unchanged — folder move is the dispatching loop's call). Work is code-complete + offline-proven;
recommend → verify. The live flip (gate + DDL apply + live model call) is DEFERRED to the operator
(DPIA-gated image-egress, docs/tickets/BOARD.md §F.7). Built DARK on `feat/plan-001-vision-family`.

## Commits
<!-- filled on commit -->
- (this branch) feat(ai): TKT-016 staged image-analysis suggestion producer (gated, additive, offline-proven)

## Files touched
**New**
- `services/data-api/src/features/assistant/image-analysis.ts` — the PURE staged pipeline (`runImageAnalysis`) over injectable
  adapters: vehicle-present → same-vehicle → registration (VLM visibility tri-state + local fast-alpr
  read) → background-text → location-hint → ranked address-suggestion. Emits `ImageAnalysisDraft[]`
  (the DraftSuggestion shape); every stage try/caught → graceful degrade. Also the VLM scene +
  same-vehicle prompt/schema/parse (pure, exported for tests). No network, no DB — offline-testable.
- `services/data-api/src/features/assistant/image-analysis-adapters.ts` — the NETWORK-backed adapters the route injects: keyless-MI
  gpt-5 vision (scene + same-vehicle via `mintCognitiveToken`), the local fast-alpr `/api/plate-ocr`
  read, and the location-assist address candidates. Each returns null on any failure.
- `services/data-api/src/features/assistant/image-analysis-routes.ts` — the gated route `POST /api/cases/{id}/image-analysis/generate`:
  honest no-op when off/unconfigured/no-images; loads PERSISTED evidence + case context; runs the
  pipeline; persists each draft as a pending `ai_suggestion` (idempotent NOT-EXISTS guard) + per-suggestion
  and run-level audit. Never 500s.
- `services/data-api/src/features/assistant/image-analysis.test.ts` — the offline acceptance suite (10 tests): full staged sequence,
  graceful degradation per stage, reg tri-state (F3), "detected VRM ≠ case identity", VLM schema/parse.
- `database/migrations/2026-07-08-image-analysis-suggestion-types.sql` — additive/idempotent
  DDL: seeds the run-level `image_analysis_generated` audit code + refreshes the `ai_suggestion.suggestion_type`
  doc comment (the new kinds need no DDL — open vocabulary). NOT applied live.
- `evidence/`: [`offline-run.md`](./evidence/offline-run.md) (the acceptance write-up) + `offline-run.txt`
  (captured transcript) + `run-transcript.mjs` (the runner over the sample set).

**Edited**
- `packages/domain/src/gates.ts` — new default-off `imageAnalysis()` gate + derived `imageAnalysisEnabled()`.
- `packages/domain/src/dto/index.ts` — documented the new `AiSuggestionType` kinds (open vocabulary).
- `services/data-api/src/platform/http/service-client.ts` — added the Data-API-side `callPlateOcr` (OCR_FN_URL/KEY) twin of orch's.
- `services/data-api/src/shared/audit.ts` — added `image_analysis_generated: 100000052` (continues from `agent_write` 100000051).
- `database/baseline/000_enums_lookups.sql` — canonical seed of audit code 100000052 (keeps a fresh
  rebuild in sync with the delta).
- `services/data-api/src/index.ts` — registers the new route module.

## Summary
Implements the TKT-016 staged image-analysis sequence as an **additive, observation-first, gated** producer.
The eight stages (confirm vehicle → same vehicle → reg visible → OCR reg → background items → OCR + geolocate
→ compare to corpus → best inspection-address) run as a pure pipeline over injectable adapters and emit
`ai_suggestion` rows only.

**The cardinal constraint is honored by construction:** the pipeline is a pure function returning drafts; the
route's only table write is `INSERT INTO ai_suggestion`. It never writes `evidence.image_role_code /
registration_visible / excluded`, `case_.vrm`, or any inspection-address column, and it does not touch
`services/orchestration/src/platform/image-classify.ts` (the live TKT-064 auto-writer) — reconciliation is TKT-088/112 and
is explicitly out of scope. Promotion into evidence/case columns remains the existing human-accept path
(`POST /api/ai-suggestions/{id}/review` → `promoteAcceptedSuggestion`, fill-if-empty), unmodified. ADR-0013 is
upheld: a detected VRM/address is a suggestion carrying `matchesCaseVrm`, never an auto-apply.

**Routing per stage (per the TKT-017 hand-off):** the registration read of record is the LOCAL fast-alpr
`/api/plate-ocr` (UK-resident, zero-egress); the VLM's plate read is a cross-check only. The VLM
scene-understanding stages (1/2/5/6) use the keyless-MI gpt-5 vision deployment — these carry the
image-egress residency cost that DPIA-gates the live flip (annotated in docs/tickets/BOARD.md §F.7). The address
stages reuse the existing location-assist seam (corpus + provider history), ranked, never auto-selected.

**Reliability:** the route is idempotent (a re-run's NOT-EXISTS guard skips a still-pending suggestion for the
same target+type), never throws (a configured-but-unreachable model/OCR/location degrades to a graceful
empty), and audits every run + every minted suggestion for App Insights.

**Proof (offline, G5 repo-data):** `npm --prefix services/data-api test -- image-analysis` (10/10). Full suites green
(api 251, domain 954). API `tsc -b` clean; the esbuild bundle builds and registers the route. Transcript over
the TKT-040 sample set: 9 pending drafts on the happy path; every degradation scenario graceful with zero
crashes — see `evidence/offline-run.md`.

**Deferred to the operator (build-dark):** flipping `IMAGE_ANALYSIS_ENABLED`, applying the DDL delta,
deploying, and any live model call. Nothing was flipped, applied, or deployed.

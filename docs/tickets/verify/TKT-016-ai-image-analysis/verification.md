# Verification — TKT-016: Image-analysis VLM sequence (vehicle / reg / location)

## Verdict
PENDING — code-complete and OFFLINE-PROVEN (G5 repo-data); live verification DEFERRED to the operator
flip (gate + DDL apply + a live model call). Nothing was flipped/applied/deployed (build-dark).

## Evidence (offline)
- **Unit suite** `api/src/lib/image-analysis.test.ts` — 10/10 green:
  `npm --prefix api test -- image-analysis`. Covers the full staged sequence, per-stage graceful
  degradation, the registration tri-state (F3), the "detected VRM ≠ case identity" boundary, and the
  VLM json_schema/parse contracts.
- **Run transcript** over the TKT-040 sample set — [`evidence/offline-run.md`](./evidence/offline-run.md)
  + `evidence/offline-run.txt` (regenerate: `node docs/tickets/now/TKT-016-ai-image-analysis/evidence/run-transcript.mjs`
  after `npx tsc -b` in `api/`). Happy path = 9 pending drafts (staged observations + one ranked
  `address_suggestion`, `autoApplied:false`); every degradation scenario is graceful (no crash, no
  auto-write).
- **Regression** — full suites green (api 251, domain 954); API `tsc -b` clean; esbuild bundle builds and
  the route `generateImageAnalysis` is present in `deploy/api/main.cjs`.

## The concrete checks a verifier should run (offline)
1. `npm --prefix api test -- image-analysis` → 10 passed.
2. In `api/`: `npx tsc -b` → clean; then
   `node docs/tickets/now/TKT-016-ai-image-analysis/evidence/run-transcript.mjs` → the staged transcript,
   9 happy-path drafts, all degradation scenarios non-throwing.
3. **Non-collision audit** (the cardinal invariant): confirm the producer writes NO evidence/case column.
   - `grep -n "UPDATE evidence\|UPDATE case_\|image_role_code\|registration_visible\|case_\.vrm" api/src/functions/image-analysis.ts api/src/lib/image-analysis.ts api/src/lib/image-analysis-adapters.ts`
     → the ONLY table write is `INSERT INTO ai_suggestion` in `persistDraft`; no evidence/case UPDATE.
   - Confirm `orchestration/src/lib/image-classify.ts` and the intake write path are untouched by this diff.
   - Confirm `promoteAcceptedSuggestion` (`api/src/functions/ai-suggestions.ts`) is unmodified (promotion
     stays the existing human-accept, fill-if-empty path).

## Pending / gaps (operator, DPIA-gated)
- Apply `migration/assets/schema/deltas/2026-07-08-image-analysis-suggestion-types.sql` (SET ROLE csadmin).
- Flip `IMAGE_ANALYSIS_ENABLED` on `cespk-api-dev` after the image-egress DPIA sign-off (docs/gated.md §F.7).
- Deploy the api bundle; then a live run on a real case with photos to confirm pending `ai_suggestion`
  rows are minted (and that a live VLM/fast-alpr/location call returns real observations).
- Follow-on (NOT this ticket): the SPA reviewer surface for the new suggestion kinds; TKT-088/112
  reconciliation with the live TKT-064 classifier.

## How to re-verify (once flipped)
- With the gate on + DDL applied: `POST /api/cases/{id}/image-analysis/generate` on a case with images →
  `{ generated: N }`; `SELECT suggestion_type, review_state FROM ai_suggestion WHERE case_id=$1` shows the
  staged kinds all `pending`; the `image_analysis_generated` (100000052) run audit row is present.

# Verification — TKT-016: Image-analysis VLM sequence (vehicle / reg / location)

Verified by: ticket-verifier dispatch, 08-07-26

## Verdict
TESTED (offline) — the offline acceptance holds and reproduces cleanly (10/10 unit suite ran green in the
verifier's own run; the cardinal non-collision invariant confirmed); live model-path proof + the DPIA-gated
`IMAGE_ANALYSIS_ENABLED` flip remain DEFERRED, so the ticket **stays in `verify`**. Nothing was
flipped/applied/deployed (build-dark).

**Verifier confirmation (08-07-26):** ran `npm --prefix api test -- image-analysis` → 10 passed; the
non-collision grep across `image-analysis.ts` + `image-analysis*.ts` shows the ONLY table write is
`INSERT INTO ai_suggestion` (every `image_role_code`/`registration_visible` hit is a `SELECT`/comment/
prompt/parse, never a column write); `git show --stat 0dbe31f` confirms `orchestration/src/lib/image-classify.ts`
(the live TKT-064 auto-writer) and `api/src/functions/ai-suggestions.ts` (`promoteAcceptedSuggestion`) are
absent from the diff. `IMAGE_ANALYSIS_ENABLED` is default-off and absent from `LIVE_FACTS.json` (dark). The
one item the verifier could not run standalone — `evidence/run-transcript.mjs` (it node-imports the domain
`dist` ESM, a general repo build property) — is fully subsumed by the passing 10-test suite, whose figures
match the committed transcript exactly.

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

# Verification — TKT-016: Image-analysis VLM sequence (vehicle / reg / location)

Verified by: ticket-verifier dispatch, 08-07-26

## Verdict
TESTED (offline) — the offline acceptance holds and reproduces cleanly (10/10 unit suite ran green in the
verifier's own run; the cardinal non-collision invariant confirmed); live model-path proof + the DPIA-gated
`IMAGE_ANALYSIS_ENABLED` flip remain DEFERRED, so the ticket **stays in `verify`**. Nothing was
flipped/applied/deployed (build-dark).

**Verifier confirmation (08-07-26):** ran `npm --prefix services/data-api test -- image-analysis` → 10 passed; the
non-collision grep across `image-analysis.ts` + `image-analysis*.ts` shows the ONLY table write is
`INSERT INTO ai_suggestion` (every `image_role_code`/`registration_visible` hit is a `SELECT`/comment/
prompt/parse, never a column write); `git show --stat 0dbe31f` confirms `services/orchestration/src/platform/image-classify.ts`
(the live TKT-064 auto-writer) and `services/data-api/src/features/assistant/register-suggestion-routes.ts` (`promoteAcceptedSuggestion`) are
absent from the diff. `IMAGE_ANALYSIS_ENABLED` is default-off and absent from `LIVE_FACTS.json` (dark). The
one item the verifier could not run standalone — `evidence/run-transcript.mjs` (it node-imports the domain
`dist` ESM, a general repo build property) — is fully subsumed by the passing 10-test suite, whose figures
match the committed transcript exactly.

## Evidence (offline)
- **Unit suite** `services/data-api/src/features/assistant/image-analysis.test.ts` — 10/10 green:
  `npm --prefix services/data-api test -- image-analysis`. Covers the full staged sequence, per-stage graceful
  degradation, the registration tri-state (F3), the "detected VRM ≠ case identity" boundary, and the
  VLM json_schema/parse contracts.
- **Run transcript** over the TKT-040 sample set — [`evidence/offline-run.md`](./evidence/offline-run.md)
  + `evidence/offline-run.txt` (regenerate: `node docs/tickets/verify/TKT-016-ai-image-analysis/evidence/run-transcript.mjs`
  after `npx tsc -b` in `services/data-api/`). Happy path = 9 pending drafts (staged observations + one ranked
  `address_suggestion`, `autoApplied:false`); every degradation scenario is graceful (no crash, no
  auto-write).
- **Regression** — full suites green (api 251, domain 954); API `tsc -b` clean; esbuild bundle builds and
  the route `generateImageAnalysis` is present in `.artifacts/deploy/data-api/main.cjs`.

## The concrete checks a verifier should run (offline)
1. `npm --prefix services/data-api test -- image-analysis` → 10 passed.
2. In `services/data-api/`: `npx tsc -b` → clean; then
   `node docs/tickets/verify/TKT-016-ai-image-analysis/evidence/run-transcript.mjs` → the staged transcript,
   9 happy-path drafts, all degradation scenarios non-throwing.
3. **Non-collision audit** (the cardinal invariant): confirm the producer writes NO evidence/case column.
   - `grep -n "UPDATE evidence\|UPDATE case_\|image_role_code\|registration_visible\|case_\.vrm" services/data-api/src/features/assistant/image-analysis-routes.ts services/data-api/src/features/assistant/image-analysis.ts services/data-api/src/features/assistant/image-analysis-adapters.ts`
     → the ONLY table write is `INSERT INTO ai_suggestion` in `persistDraft`; no evidence/case UPDATE.
   - Confirm `services/orchestration/src/platform/image-classify.ts` and the intake write path are untouched by this diff.
   - Confirm `promoteAcceptedSuggestion` (`services/data-api/src/features/assistant/register-suggestion-routes.ts`) is unmodified (promotion
     stays the existing human-accept, fill-if-empty path).

## Pending / gaps (operator, DPIA-gated)
- Apply `database/migrations/2026-07-08-image-analysis-suggestion-types.sql` (SET ROLE csadmin).
- Flip `IMAGE_ANALYSIS_ENABLED` on `cespk-api-dev` after the image-egress DPIA sign-off (docs/tickets/BOARD.md §F.7).
- Deploy the api bundle; then a live run on a real case with photos to confirm pending `ai_suggestion`
  rows are minted (and that a live VLM/fast-alpr/location call returns real observations).
- Follow-on (NOT this ticket): the SPA reviewer surface for the new suggestion kinds; TKT-088/112
  reconciliation with the live TKT-064 classifier.

## How to re-verify (once flipped)
- With the gate on + DDL applied: `POST /api/cases/{id}/image-analysis/generate` on a case with images →
  `{ generated: N }`; `SELECT suggestion_type, review_state FROM ai_suggestion WHERE case_id=$1` shows the
  staged kinds all `pending`; the `image_analysis_generated` (100000052) run audit row is present.

## GO-LIVE — 2026-07-08 (operator-authorized; gate flipped, deploy done)

Status: **LIVE-DEPLOYED + GATE ON**; behavioral E2E = one operator/SPA action away (stays `verify`).

The operator authorized go-live with the **DPIA + UK data-residency sign-off confirmed 2026-07-08**
([data-protection.md §6a](../../../architecture/data-protection.md#6a-per-gate-production-sign-off--log)).
Executed (azure-integration-engineer dispatch):
- **DDL delta applied live** — `2026-07-08-image-analysis-suggestion-types.sql` (Entra-admin + `SET ROLE csadmin`);
  `choice_audit_action` `100000052 image_analysis_generated` inserted; base tables **46** unchanged.
- **`IMAGE_ANALYSIS_ENABLED=true`** on `cespk-api-dev` — **readback-proven**; `cespk-orch-dev` unchanged
  (only the Data API reads it).
- **Deployed** from `main a06d2dc` — api **86** functions live; `generateImageAnalysis` present in the function list.
- **Fail-closed proven live:** `POST /api/cases/{id}/image-analysis/generate` → **401** without a staff token.
- **DEFERRED (not fabricated):** the behavioral `{generated:N}` + pending `ai_suggestion` rows — `az` can't mint
  an API-audience staff token (AADSTS65001), and there is no SPA trigger for image-analysis yet (the reviewer
  surface is a follow-on). Close it via an authenticated call once a staff token/SPA trigger exists.
- **Provisional:** subscription still FreeTrial (PAYG/A1 outstanding). Capacity: gpt-5 shared 50K-TPM (watch 429).

Registry updated: `LIVE_FACTS.json` (gate + `lastVerified`) + [live-environment.md](../../../operations/live-environment.md).

## Verdict update — 2026-07-10 (final sweep, ticket-verifier dispatch; transcribed verbatim)

**PENDING — standing gap re-confirmed unchanged; nothing regressed, nothing closed it.** Gate `IMAGE_ANALYSIS_ENABLED=true` re-read via az today; `generateImageAnalysis` in the live 96-fn list; unauthenticated generate → **401** re-proven (fail-closed intact). The served SPA bundle contains zero `image-analysis` hits — still no SPA trigger, so the behavioral `{generated:N}` call remains reachable only with a staff-audience token (AADSTS65001 unchanged). Queued SQL: staged-kind `ai_suggestion` census + `action_code=100000052` count — non-zero would mean someone already exercised it. Verified by: ticket-verifier dispatch, 2026-07-10.

### W7 data-pass result (orchestrator-run, 2026-07-10)
Confirmed unexercised: **0** staged-kind `ai_suggestion` rows, **0** `image_analysis_generated`
(100000052) audits. The authenticated `{generated:N}` call remains the sole gap.

## Verdict update — 2026-07-14 (independent PLAN-005 sweep; transcribed verbatim)

## Verdict

PENDING

## Evidence

- Independent offline suite passed 10/10, covering staged observations, ranked `address_suggestion` with
  `autoApplied:false`, and graceful degradation.
- Live `cespk-api-dev` is Running; `IMAGE_ANALYSIS_ENABLED=true`, `AI_MODEL_DEPLOYMENT=gpt-5`, and
  `generateImageAnalysis` is deployed. A fresh unauthenticated POST returned 401.
- Seven-day telemetry contains only three unauthenticated 401 probes and zero `[image-analysis]` run traces.
  No authenticated successful invocation is evidenced.

## Pending / gaps

- No authenticated live sample proves `{generated:N}`, staged pending rows, ranked address output, or live
  graceful degradation.
- Current PostgreSQL census was unread because Azure MCP could not reach the server and opening a firewall
  rule is prohibited.

## How to re-verify

Use an authorized staff session on a naturally occurring case with images. Require a 200 response with
`generated > 0`, pending staged suggestions including `address_suggestion` with `autoApplied:false`, and
audit action `100000052`.

## Confidence + unread surfaces

High confidence the ticket remains PENDING. Unread surfaces are authenticated staff invocation and current
PostgreSQL rows.
